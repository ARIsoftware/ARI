/**
 * Canonical registry of the environment variables ARI understands.
 *
 * Single source of truth for:
 *   - which vars are REQUIRED for ARI to be considered "set up"
 *   - which vars are sensitive (drives Vercel env-var type on cloud installs)
 *   - human-readable descriptions (setup UI, diagnostics)
 *
 * Setup detection (`isSetupComplete` / `getMissingRequiredConfig`) is derived
 * from this registry — middleware, auth-helpers, and the setup API must all
 * call these helpers instead of re-implementing the check.
 */

export type EnvVarGroup = 'database' | 'auth' | 'app' | 'first-run' | 'integrations'

export interface EnvVarSpec {
  key: string
  /** Missing required vars put ARI into setup mode (welcome installer). */
  required: boolean
  /** Sensitive values are written as write-only "sensitive" Vercel env vars. */
  sensitive: boolean
  group: EnvVarGroup
  description: string
}

export const ENV_REGISTRY: readonly EnvVarSpec[] = [
  {
    key: 'DATABASE_URL',
    required: true,
    sensitive: true,
    group: 'database',
    description: 'Postgres connection string (local Postgres, Supabase, Neon, etc.)',
  },
  {
    key: 'BETTER_AUTH_SECRET',
    required: true,
    sensitive: true,
    group: 'auth',
    description:
      'Session-signing secret; also derives the encryption key for stored API keys — never rotate after setup',
  },
  {
    key: 'BETTER_AUTH_URL',
    required: false,
    sensitive: false,
    group: 'auth',
    description: 'Public base URL Better Auth uses for callbacks and trusted origins',
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    required: false,
    sensitive: false,
    group: 'app',
    description: 'Public app URL (build-time inlined into the client bundle)',
  },
  {
    key: 'ARI_DB_MODE',
    required: false,
    sensitive: false,
    group: 'database',
    description: 'Database backend: postgres | supabaselocal | supabasecloud',
  },
  {
    key: 'ARI_FIRST_RUN_ADMIN_EMAIL',
    required: false,
    sensitive: false,
    group: 'first-run',
    description: 'One-shot email for the initial admin account (consumed by /api/auth/bootstrap)',
  },
  {
    key: 'ARI_FIRST_RUN_ADMIN_PASSWORD',
    required: false,
    sensitive: true,
    group: 'first-run',
    description:
      'One-shot password for the initial admin account (consumed by /api/auth/bootstrap)',
  },
  {
    key: 'ARI_FIRST_RUN_ISSUED_AT',
    required: false,
    sensitive: false,
    group: 'first-run',
    description:
      'Epoch-ms stamp written with the one-shot admin credentials on Vercel; bootstrap ignores stamped credentials older than 24h',
  },
  {
    key: 'GITHUB_TOKEN',
    required: false,
    sensitive: true,
    group: 'integrations',
    description: 'GitHub token used to persist module installs on Vercel (read-only filesystem)',
  },
] as const

export function getEnvVarSpec(key: string): EnvVarSpec | undefined {
  return ENV_REGISTRY.find((spec) => spec.key === key)
}

/** Names of required vars that are missing/empty in the current environment. */
export function getMissingRequiredConfig(): string[] {
  return ENV_REGISTRY.filter((spec) => spec.required && !process.env[spec.key]).map(
    (spec) => spec.key,
  )
}

/**
 * Whether ARI has all required configuration. False puts the app into setup
 * mode: middleware routes everything to /welcome.
 */
export function isSetupComplete(): boolean {
  return getMissingRequiredConfig().length === 0
}
