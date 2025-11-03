/**
 * Next.js Instrumentation Hook
 *
 * This file runs when the Next.js server starts, regardless of how it's started:
 * - npm run dev
 * - pnpm run dev
 * - pnpm next dev --turbo
 * - npm run build
 *
 * We use it to auto-generate the module registry so you never have to remember
 * to run `npm run generate-module-registry` manually.
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
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
}
