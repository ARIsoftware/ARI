/**
 * Vercel REST API client — server-only, used by the /welcome Vercel setup flow
 * (app/api/setup/vercel-configure) to write the project's environment variables
 * and trigger the redeploy that picks them up.
 *
 * The access token is passed per-call and never stored. Error messages carry
 * only Vercel's *response* detail (status + message) — never request data, so
 * the token can't leak into logs or client responses.
 */

import type { VercelInfo } from '@/lib/deployment'
import { getEnvVarSpec } from '@/lib/env-registry'

const VERCEL_API = 'https://api.vercel.com'

export class VercelApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'VercelApiError'
    this.status = status
  }
}

async function vercelFetch(
  endpoint: string,
  token: string,
  options: { method?: string; body?: unknown; teamId?: string | null } = {},
): Promise<Response> {
  const url = new URL(`${VERCEL_API}${endpoint}`)
  if (options.teamId) url.searchParams.set('teamId', options.teamId)
  return fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
}

/** Extract Vercel's error message from a failed response without echoing the request. */
async function responseError(response: Response, context: string): Promise<VercelApiError> {
  let detail = response.statusText
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body?.error?.message) detail = body.error.message
  } catch {
    /* non-JSON body — statusText is fine */
  }
  return new VercelApiError(`${context}: ${response.status} ${detail}`, response.status)
}

export interface ResolvedProject {
  projectId: string
  projectName: string
  /** null for personal-account tokens; set when the project lives in a team. */
  teamId: string | null
}

/**
 * Resolve the current project with the given token. Personal tokens can fetch
 * the project directly; team-scoped projects need the owning team's id, which
 * we discover by listing the token's teams and retrying.
 */
export async function resolveProject(token: string, projectId: string): Promise<ResolvedProject> {
  const direct = await vercelFetch(`/v9/projects/${projectId}`, token)
  if (direct.ok) {
    const project = (await direct.json()) as { id: string; name: string }
    return { projectId: project.id, projectName: project.name, teamId: null }
  }

  if (direct.status !== 403 && direct.status !== 404) {
    throw await responseError(direct, 'Could not look up the Vercel project')
  }

  const teamsResponse = await vercelFetch('/v2/teams?limit=100', token)
  if (!teamsResponse.ok) {
    throw await responseError(teamsResponse, 'Could not list the token’s Vercel teams')
  }
  const { teams = [] } = (await teamsResponse.json()) as { teams?: Array<{ id: string }> }

  for (const team of teams) {
    const attempt = await vercelFetch(`/v9/projects/${projectId}`, token, { teamId: team.id })
    if (attempt.ok) {
      const project = (await attempt.json()) as { id: string; name: string }
      return { projectId: project.id, projectName: project.name, teamId: team.id }
    }
  }

  throw new VercelApiError(
    'The access token has no access to this Vercel project. Create the token with access to the account or team that owns this deployment.',
    403,
  )
}

export type VercelEnvVarType = 'sensitive' | 'encrypted' | 'plain'
export type VercelEnvTarget = 'production' | 'preview' | 'development'

export interface VercelEnvVar {
  key: string
  value: string
  type: VercelEnvVarType
  target: VercelEnvTarget[]
}

/**
 * Map setup fields to the Vercel env-var payload. Pure — unit-tested directly.
 * Sensitivity comes from the canonical registry (lib/env-registry.ts);
 * NEXT_PUBLIC_/URL values are plain. Sensitive vars can't target development,
 * so everything targets production + preview only.
 *
 * `existingKeys` (from listEnvKeys) lets a partially hand-configured project
 * keep its values: derived defaults (app URLs, DB mode) are only written when
 * the key isn't already set, so a custom domain or DB mode is never clobbered.
 * DATABASE_URL/BETTER_AUTH_SECRET are caller-decided — included iff provided.
 *
 * `issuedAt` (epoch ms as a string) is stamped alongside the one-shot admin
 * credentials: Vercel env vars can't be deleted after bootstrap (no stored
 * token), so /api/auth/bootstrap refuses stamped credentials older than its
 * TTL instead — a fresh database months later must not silently re-create an
 * admin with the original setup password.
 */
export function buildVercelEnvPlan(
  fields: {
    databaseUrl?: string
    betterAuthSecret?: string
    adminEmail: string
    adminPassword: string
    productionUrl: string
    issuedAt: string
  },
  existingKeys: Set<string> = new Set(),
): VercelEnvVar[] {
  const target: VercelEnvTarget[] = ['production', 'preview']
  const appUrl = `https://${fields.productionUrl}`

  const typeFor = (key: string): VercelEnvVarType =>
    getEnvVarSpec(key)?.sensitive ? 'sensitive' : 'encrypted'

  const plan: VercelEnvVar[] = []
  if (fields.databaseUrl) {
    plan.push({
      key: 'DATABASE_URL',
      value: fields.databaseUrl,
      type: typeFor('DATABASE_URL'),
      target,
    })
  }
  if (fields.betterAuthSecret) {
    plan.push({
      key: 'BETTER_AUTH_SECRET',
      value: fields.betterAuthSecret,
      type: typeFor('BETTER_AUTH_SECRET'),
      target,
    })
  }
  plan.push(
    { key: 'ARI_FIRST_RUN_ADMIN_EMAIL', value: fields.adminEmail, type: 'encrypted', target },
    {
      key: 'ARI_FIRST_RUN_ADMIN_PASSWORD',
      value: fields.adminPassword,
      type: typeFor('ARI_FIRST_RUN_ADMIN_PASSWORD'),
      target,
    },
    { key: 'ARI_FIRST_RUN_ISSUED_AT', value: fields.issuedAt, type: 'plain', target },
  )
  const derived: Array<[string, string]> = [
    ['NEXT_PUBLIC_APP_URL', appUrl],
    ['BETTER_AUTH_URL', appUrl],
    ['ARI_DB_MODE', 'postgres'],
  ]
  for (const [key, value] of derived) {
    if (!existingKeys.has(key)) plan.push({ key, value, type: 'plain', target })
  }
  return plan
}

/**
 * Create-or-update the project's env vars in one call. `upsert=true` makes
 * retries idempotent. Vercel applies the batch per-key, so a partial failure is
 * possible — any entry in `failed` is treated as fatal (the caller retries).
 */
export async function upsertEnvVars(
  token: string,
  project: ResolvedProject,
  vars: VercelEnvVar[],
): Promise<void> {
  const response = await vercelFetch(`/v10/projects/${project.projectId}/env?upsert=true`, token, {
    method: 'POST',
    body: vars,
    teamId: project.teamId,
  })
  if (!response.ok) {
    throw await responseError(response, 'Could not save environment variables to Vercel')
  }
  const result = (await response.json()) as {
    failed?: Array<{ error?: { key?: string; message?: string } }>
  }
  if (result.failed && result.failed.length > 0) {
    const keys = result.failed
      .map((f) => f.error?.key)
      .filter(Boolean)
      .join(', ')
    throw new VercelApiError(
      `Vercel rejected ${result.failed.length} environment variable(s)${keys ? ` (${keys})` : ''}. Please try again.`,
      502,
    )
  }
}

/**
 * Names of the env vars already stored on the project **for the production
 * target**. Values are not returned (sensitive vars are write-only anyway) —
 * presence is all callers need to avoid clobbering existing configuration.
 *
 * Target-filtered on purpose: a var stored only for the development target
 * (e.g. added by hand with just "Development" checked) must NOT count as
 * configured, or the production redeploy boots without it and setup wedges.
 */
export async function listEnvKeys(token: string, project: ResolvedProject): Promise<Set<string>> {
  const response = await vercelFetch(`/v9/projects/${project.projectId}/env`, token, {
    teamId: project.teamId,
  })
  if (!response.ok) {
    throw await responseError(response, 'Could not read the project’s environment variables')
  }
  const result = (await response.json()) as {
    envs?: Array<{ key?: string; target?: string | string[] }>
  }
  return new Set(
    (result.envs ?? [])
      .filter((e) => {
        const targets = Array.isArray(e.target) ? e.target : e.target ? [e.target] : []
        return targets.includes('production')
      })
      .map((e) => e.key)
      .filter((k): k is string => !!k),
  )
}

export interface TriggeredDeployment {
  deploymentId: string
  /** Deployment-specific URL (no scheme), e.g. "ari-abc123.vercel.app" */
  url: string | null
}

// The /v13/deployments gitSource shape differs per provider: GitHub wants a
// numeric repoId, GitLab a projectId, Bitbucket the repo UUID.
function buildGitSource(git: VercelInfo['git']): Record<string, unknown> | null {
  if (!git.provider || !git.repoId || !git.commitRef) return null
  switch (git.provider) {
    case 'github':
      return { type: 'github', repoId: Number(git.repoId), ref: git.commitRef }
    case 'gitlab':
      return { type: 'gitlab', projectId: git.repoId, ref: git.commitRef }
    case 'bitbucket':
      return { type: 'bitbucket', repoUuid: git.repoId, ref: git.commitRef }
    default:
      return null
  }
}

/**
 * Trigger a fresh production deployment so the new env vars take effect.
 * `forceNew=1` is required: without it Vercel dedupes a same-sha deployment to
 * the existing one, which still has the old (empty) environment.
 */
export async function triggerRedeploy(
  token: string,
  project: ResolvedProject,
  info: VercelInfo,
): Promise<TriggeredDeployment> {
  const gitSource = buildGitSource(info.git)
  if (!gitSource && !info.deploymentId) {
    throw new VercelApiError(
      'Cannot trigger a redeploy: Vercel git metadata and deployment id are both unavailable. Redeploy manually from the Vercel dashboard once configuration is saved.',
      400,
    )
  }
  const body = gitSource
    ? {
        name: project.projectName,
        project: project.projectId,
        target: 'production',
        gitSource,
      }
    : {
        // Fallback when git system vars are unavailable: redeploy the current
        // deployment by id, picking up the latest commit on its branch.
        name: project.projectName,
        deploymentId: info.deploymentId,
        target: 'production',
        withLatestCommit: true,
      }

  const response = await vercelFetch('/v13/deployments?forceNew=1', token, {
    method: 'POST',
    body,
    teamId: project.teamId,
  })
  if (!response.ok) {
    throw await responseError(response, 'Could not trigger a Vercel redeploy')
  }
  const deployment = (await response.json()) as { id: string; url?: string }
  return { deploymentId: deployment.id, url: deployment.url ?? null }
}
