import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDeploymentTarget, isVercel, getVercelInfo } from '@/lib/deployment'

const VARS = [
  'ARI_DEPLOYMENT_TARGET',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_PROJECT_ID',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_GIT_PROVIDER',
  'VERCEL_GIT_REPO_ID',
  'VERCEL_GIT_REPO_OWNER',
  'VERCEL_GIT_REPO_SLUG',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_GIT_COMMIT_SHA',
] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = Object.fromEntries(VARS.map((k) => [k, process.env[k]]))
  for (const k of VARS) delete process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('getDeploymentTarget', () => {
  it('defaults to local with no env vars', () => {
    expect(getDeploymentTarget()).toBe('local')
    expect(isVercel()).toBe(false)
  })

  it('detects vercel from VERCEL=1', () => {
    process.env.VERCEL = '1'
    expect(getDeploymentTarget()).toBe('vercel')
    expect(isVercel()).toBe(true)
  })

  it('stays local on VERCEL_ENV/VERCEL_PROJECT_ID alone (vercel env pull artifacts)', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_PROJECT_ID = 'prj_abc123'
    expect(getDeploymentTarget()).toBe('local')
  })

  it('explicit ARI_DEPLOYMENT_TARGET=vercel wins with no Vercel vars', () => {
    process.env.ARI_DEPLOYMENT_TARGET = 'vercel'
    expect(getDeploymentTarget()).toBe('vercel')
  })

  it('explicit ARI_DEPLOYMENT_TARGET=local overrides Vercel system vars', () => {
    process.env.ARI_DEPLOYMENT_TARGET = 'local'
    process.env.VERCEL = '1'
    expect(getDeploymentTarget()).toBe('local')
  })

  it('ignores an unrecognized ARI_DEPLOYMENT_TARGET value', () => {
    process.env.ARI_DEPLOYMENT_TARGET = 'docker'
    expect(getDeploymentTarget()).toBe('local')
    process.env.VERCEL = '1'
    expect(getDeploymentTarget()).toBe('vercel')
  })
})

describe('getVercelInfo', () => {
  it('returns null when not on Vercel', () => {
    expect(getVercelInfo()).toBeNull()
  })

  it('returns nulls for unset fields on Vercel', () => {
    process.env.VERCEL = '1'
    const info = getVercelInfo()
    expect(info).not.toBeNull()
    expect(info!.projectId).toBeNull()
    expect(info!.productionUrl).toBeNull()
    expect(info!.git.repoId).toBeNull()
  })

  it('normalizes the full system-var set', () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_PROJECT_ID = 'prj_abc123'
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_xyz'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'my-ari.vercel.app'
    process.env.VERCEL_GIT_PROVIDER = 'github'
    process.env.VERCEL_GIT_REPO_ID = '123456'
    process.env.VERCEL_GIT_REPO_OWNER = 'noameppel'
    process.env.VERCEL_GIT_REPO_SLUG = 'ari'
    process.env.VERCEL_GIT_COMMIT_REF = 'main'
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234'

    expect(getVercelInfo()).toEqual({
      projectId: 'prj_abc123',
      deploymentId: 'dpl_xyz',
      env: 'production',
      productionUrl: 'my-ari.vercel.app',
      git: {
        provider: 'github',
        repoId: '123456',
        repoOwner: 'noameppel',
        repoSlug: 'ari',
        commitRef: 'main',
        commitSha: 'abc1234',
      },
    })
  })
})
