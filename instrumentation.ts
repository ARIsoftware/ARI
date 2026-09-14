/**
 * Next.js Instrumentation Hook
 *
 * This file runs when the Next.js server starts, regardless of how it's started:
 * - pnpm run dev
 * - pnpm next dev --turbo
 * - pnpm run build
 *
 * We use it to auto-generate the module registry so you never have to remember
 * to run `pnpm run generate-module-registry` manually.
 */

import { isVercel } from './lib/deployment'

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    // Only auto-generate in development — in production (Vercel), the filesystem
    // is read-only and prebuild already generated the registry at build time.
    if (process.env.NODE_ENV !== 'production' && !isVercel()) {
      console.log('🔄 Auto-generating module registry...')

      try {
        // Dynamic imports - only loaded in Node.js runtime
        const { execSync } = await import('child_process')
        const path = await import('path')

        // Run the registry generation script
        const scriptPath = path.join(process.cwd(), 'scripts', 'generate-module-registry.js')
        execSync(`node "${scriptPath}"`, { stdio: 'inherit' })

        console.log('✅ Module registry generated successfully')
      } catch (error) {
        console.error('❌ Failed to generate module registry:', error)
        // Don't throw - allow server to start even if registry generation fails
      }
    }

    // Apply lib/db/setup.sql on every boot. Idempotent. Skipped during the
    // Vercel build phase (no DB available). Awaited so the auth hook on first
    // sign-in always finds the latest schema.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      try {
        const { ensureSchema } = await import('./lib/db/ensure-schema')
        await ensureSchema()
      } catch {
        // ensureSchema swallows its own DB errors; this outer catch is for
        // the dynamic import itself.
      }

      // Provision / reconcile the non-BYPASSRLS app role (DB-level RLS
      // enforcement, Phase 2). Runs after setup.sql so the ari_instance
      // columns exist. Never throws and never blocks startup on failure —
      // the outcome is recorded for /health and the app keeps running on
      // the privileged pool until the role is ready.
      try {
        const { ensureAppRole } = await import('./lib/db/app-role')
        await ensureAppRole()
      } catch {
        // ensureAppRole swallows its own errors; this catch is for the import.
      }
    }

    // Fire-and-forget anonymous install ping. Never blocks startup.
    void import('./lib/telemetry/send-tv-connect').then(({ sendTvConnect }) => {
      sendTvConnect().catch(() => {})
    }).catch(() => {})
  }
}
