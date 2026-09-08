import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { VercelInfo } from '@/lib/deployment'
import {
  resolveProject,
  upsertVercelEnvVars,
  triggerRedeploy,
  buildVercelEnvPlan,
  listEnvKeys,
  VercelApiError,
  type ResolvedProject,
} from '@/lib/vercel/api'

const TOKEN = 'vercel_test_token_abc123'

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function vercelInfo(overrides: Partial<VercelInfo['git']> = {}): VercelInfo {
  return {
    projectId: 'prj_1',
    deploymentId: 'dpl_current',
    env: 'production',
    productionUrl: 'my-ari.vercel.app',
    git: {
      provider: 'github',
      repoId: '123456',
      repoOwner: 'noameppel',
      repoSlug: 'ari',
      commitRef: 'main',
      commitSha: 'abc1234',
      ...overrides,
    },
  }
}

const PROJECT: ResolvedProject = { projectId: 'prj_1', projectName: 'ari', teamId: null }

describe('resolveProject', () => {
  it('resolves directly for personal tokens and sends the bearer header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'prj_1', name: 'ari' }))
    await expect(resolveProject(TOKEN, 'prj_1')).resolves.toEqual({
      projectId: 'prj_1',
      projectName: 'ari',
      teamId: null,
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.vercel.com/v9/projects/prj_1')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('rethrows a 401 (invalid token) without falling back to team discovery', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { message: 'not authorized' } }))
    const err = await resolveProject(TOKEN, 'prj_1').catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(err.message).not.toContain(TOKEN)
  })

  it('falls back to team discovery on 403 and finds the owning team', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: { message: 'nope' } }))
      .mockResolvedValueOnce(jsonResponse(200, { teams: [{ id: 'team_a' }, { id: 'team_b' }] }))
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'not here' } }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'prj_1', name: 'ari' }))

    await expect(resolveProject(TOKEN, 'prj_1')).resolves.toEqual({
      projectId: 'prj_1',
      projectName: 'ari',
      teamId: 'team_b',
    })
    expect(String(fetchMock.mock.calls[2][0])).toContain('teamId=team_a')
    expect(String(fetchMock.mock.calls[3][0])).toContain('teamId=team_b')
  })

  it('throws when no team grants access, without echoing the token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'nope' } }))
      .mockResolvedValueOnce(jsonResponse(200, { teams: [{ id: 'team_a' }] }))
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: 'nope' } }))

    const err = await resolveProject(TOKEN, 'prj_1').catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.message).not.toContain(TOKEN)
  })

  it('rethrows non-403/404 lookup failures with Vercel detail only', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: 'server exploded' } }))
    const err = await resolveProject(TOKEN, 'prj_1').catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.status).toBe(500)
    expect(err.message).toContain('server exploded')
    expect(err.message).not.toContain(TOKEN)
  })

  it('throws when listing teams fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { error: { message: 'nope' } }))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))
    const err = await resolveProject(TOKEN, 'prj_1').catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.status).toBe(500)
  })
})

describe('buildVercelEnvPlan', () => {
  const base = {
    adminEmail: 'admin@example.com',
    adminPassword: 'a-very-long-password',
    productionUrl: 'my-ari.vercel.app',
    issuedAt: '1700000000000',
  }

  it('includes all vars with registry-driven types and prod+preview targets', () => {
    const plan = buildVercelEnvPlan({
      ...base,
      databaseUrl: 'postgres://x',
      betterAuthSecret: 's3cret',
    })
    const byKey = Object.fromEntries(plan.map((v) => [v.key, v]))

    expect(byKey.DATABASE_URL.type).toBe('sensitive')
    expect(byKey.BETTER_AUTH_SECRET.type).toBe('sensitive')
    expect(byKey.ARI_FIRST_RUN_ADMIN_PASSWORD.type).toBe('sensitive')
    expect(byKey.ARI_FIRST_RUN_ADMIN_EMAIL.type).toBe('encrypted')
    expect(byKey.NEXT_PUBLIC_APP_URL).toMatchObject({
      type: 'plain',
      value: 'https://my-ari.vercel.app',
    })
    expect(byKey.BETTER_AUTH_URL.value).toBe('https://my-ari.vercel.app')
    expect(byKey.ARI_DB_MODE).toMatchObject({ type: 'plain', value: 'postgres' })
    // Stamps the one-shot credentials so bootstrap can expire them.
    expect(byKey.ARI_FIRST_RUN_ISSUED_AT).toMatchObject({ type: 'plain', value: '1700000000000' })
    for (const v of plan) expect(v.target).toEqual(['production', 'preview'])
  })

  it('omits databaseUrl and betterAuthSecret when not provided (already configured)', () => {
    const keys = buildVercelEnvPlan(base).map((v) => v.key)
    expect(keys).not.toContain('DATABASE_URL')
    expect(keys).not.toContain('BETTER_AUTH_SECRET')
    expect(keys).not.toContain('GITHUB_TOKEN')
    expect(keys).toContain('ARI_FIRST_RUN_ADMIN_EMAIL')
  })

  it('includes GITHUB_TOKEN as sensitive when provided', () => {
    const plan = buildVercelEnvPlan({ ...base, githubToken: 'ghp_abc' })
    const entry = plan.find((v) => v.key === 'GITHUB_TOKEN')
    expect(entry).toMatchObject({
      value: 'ghp_abc',
      type: 'sensitive',
      target: ['production', 'preview'],
    })
  })

  it('never clobbers derived keys the project already has', () => {
    const existing = new Set(['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'ARI_DB_MODE'])
    const keys = buildVercelEnvPlan(base, existing).map((v) => v.key)
    expect(keys).not.toContain('NEXT_PUBLIC_APP_URL')
    expect(keys).not.toContain('BETTER_AUTH_URL')
    expect(keys).not.toContain('ARI_DB_MODE')
    expect(keys).toContain('ARI_FIRST_RUN_ADMIN_EMAIL')
  })
})

describe('listEnvKeys', () => {
  it('returns only names stored for the production target', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        envs: [
          { key: 'DATABASE_URL', target: ['production', 'preview'] },
          // Development-only var must NOT count as configured — treating it as
          // present would omit it from the production write plan and wedge setup.
          { key: 'BETTER_AUTH_SECRET', target: ['development'] },
          // Legacy string-shaped target.
          { key: 'ARI_DB_MODE', target: 'production' },
          // No target at all — not production, excluded.
          { key: 'ORPHAN' },
          {},
        ],
      }),
    )
    const keys = await listEnvKeys(TOKEN, PROJECT)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v9/projects/prj_1/env')
    expect(keys).toEqual(new Set(['DATABASE_URL', 'ARI_DB_MODE']))
  })

  it('throws with Vercel detail on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: { message: 'no scope' } }))
    const err = await listEnvKeys(TOKEN, PROJECT).catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.message).toContain('no scope')
    expect(err.message).not.toContain(TOKEN)
  })
})

describe('upsertVercelEnvVars', () => {
  const vars = buildVercelEnvPlan({
    databaseUrl: 'postgres://x',
    betterAuthSecret: 's3cret',
    adminEmail: 'admin@example.com',
    adminPassword: 'a-very-long-password',
    productionUrl: 'my-ari.vercel.app',
    issuedAt: '1700000000000',
  })

  it('POSTs the array body with upsert=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { created: [], failed: [] }))
    await upsertVercelEnvVars(TOKEN, PROJECT, vars)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/v10/projects/prj_1/env')
    expect(String(url)).toContain('upsert=true')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(vars)
  })

  it('appends teamId for team projects', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { created: [] }))
    await upsertVercelEnvVars(TOKEN, { ...PROJECT, teamId: 'team_a' }, vars)
    expect(String(fetchMock.mock.calls[0][0])).toContain('teamId=team_a')
  })

  it('treats any failed[] entry as fatal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        created: [],
        failed: [{ error: { key: 'DATABASE_URL', message: 'bad' } }],
      }),
    )
    const err = await upsertVercelEnvVars(TOKEN, PROJECT, vars).catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.message).toContain('DATABASE_URL')
    expect(err.message).not.toContain(TOKEN)
  })

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'invalid target' } }))
    const err = await upsertVercelEnvVars(TOKEN, PROJECT, vars).catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.message).toContain('invalid target')
  })
})

describe('triggerRedeploy', () => {
  it('creates a git-source production deployment with forceNew=1', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'dpl_new', url: 'ari-xyz.vercel.app' }))
    const result = await triggerRedeploy(TOKEN, PROJECT, vercelInfo())
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/v13/deployments')
    expect(String(url)).toContain('forceNew=1')
    expect(JSON.parse(init.body)).toEqual({
      name: 'ari',
      project: 'prj_1',
      target: 'production',
      gitSource: { type: 'github', repoId: 123456, ref: 'main' },
    })
    expect(result).toEqual({ deploymentId: 'dpl_new', url: 'ari-xyz.vercel.app' })
  })

  it('uses projectId for gitlab and repoUuid for bitbucket', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'dpl_gl' }))
    await triggerRedeploy(TOKEN, PROJECT, vercelInfo({ provider: 'gitlab', repoId: '987' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).gitSource).toEqual({
      type: 'gitlab',
      projectId: '987',
      ref: 'main',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'dpl_bb' }))
    const uuid = '{9f6d…}'
    await triggerRedeploy(TOKEN, PROJECT, vercelInfo({ provider: 'bitbucket', repoId: uuid }))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).gitSource).toEqual({
      type: 'bitbucket',
      repoUuid: uuid,
      ref: 'main',
    })
  })

  it('throws a clear error when git metadata and deployment id are both missing', async () => {
    const info = { ...vercelInfo({ repoId: null }), deploymentId: null }
    const err = await triggerRedeploy(TOKEN, PROJECT, info).catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.message).toContain('Redeploy manually')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to redeploy-by-id when git vars are missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'dpl_new' }))
    const result = await triggerRedeploy(TOKEN, PROJECT, vercelInfo({ repoId: null }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'ari',
      deploymentId: 'dpl_current',
      target: 'production',
      withLatestCommit: true,
    })
    expect(result).toEqual({ deploymentId: 'dpl_new', url: null })
  })

  it('throws with Vercel detail on failure, never the token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: { message: 'insufficient scope' } }))
    const err = await triggerRedeploy(TOKEN, PROJECT, vercelInfo()).catch((e) => e)
    expect(err).toBeInstanceOf(VercelApiError)
    expect(err.message).toContain('insufficient scope')
    expect(err.message).not.toContain(TOKEN)
  })
})
