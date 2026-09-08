/**
 * Deployment-environment detection.
 *
 * ARI can run locally (config persisted in .env.local) or on Vercel (config
 * persisted in the Vercel project's environment variables). Everything that
 * needs to branch on "where am I running" calls these helpers — never inspect
 * process.env.VERCEL directly in app code, so future targets (docker, etc.)
 * only need changes here.
 */

export type DeploymentTarget = 'local' | 'vercel'

export function getDeploymentTarget(): DeploymentTarget {
  // Explicit override wins — lets a non-Vercel host opt into Vercel-style
  // behavior, or a local machine whose .env.local carries Vercel vars (e.g.
  // from `vercel env pull`) force ARI_DEPLOYMENT_TARGET=local to opt out.
  const explicit = process.env.ARI_DEPLOYMENT_TARGET
  if (explicit === 'vercel' || explicit === 'local') {
    return explicit
  }

  // VERCEL alone is NOT enough: `vercel env pull` writes VERCEL="1" into the
  // local .env file, so a lone VERCEL check misfires on local machines. Real
  // Vercel builds and lambdas always run with VERCEL_ENV=production|preview,
  // while a pulled development-target env file carries VERCEL_ENV=development
  // (and `vercel dev` is a local workflow by definition). A deliberately
  // pulled production env file can still misfire — that's what the explicit
  // ARI_DEPLOYMENT_TARGET=local override above is for.
  if (
    process.env.VERCEL &&
    (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview')
  ) {
    return 'vercel'
  }

  return 'local'
}

export function isVercel(): boolean {
  return getDeploymentTarget() === 'vercel'
}

export interface VercelInfo {
  projectId: string | null
  deploymentId: string | null
  env: string | null
  /** Production domain without scheme, e.g. "my-ari.vercel.app" */
  productionUrl: string | null
  git: {
    provider: string | null
    repoId: string | null
    repoOwner: string | null
    repoSlug: string | null
    commitRef: string | null
    commitSha: string | null
  }
}

/**
 * Normalized snapshot of Vercel's system environment variables, or null when
 * not running on Vercel. Fields are null when the project has "Enable access
 * to System Environment Variables" turned off.
 */
export function getVercelInfo(): VercelInfo | null {
  if (!isVercel()) return null
  return {
    projectId: process.env.VERCEL_PROJECT_ID || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    env: process.env.VERCEL_ENV || null,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
    git: {
      provider: process.env.VERCEL_GIT_PROVIDER || null,
      repoId: process.env.VERCEL_GIT_REPO_ID || null,
      repoOwner: process.env.VERCEL_GIT_REPO_OWNER || null,
      repoSlug: process.env.VERCEL_GIT_REPO_SLUG || null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF || null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    },
  }
}
