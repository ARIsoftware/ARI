/**
 * Module Catch-All Page Route
 *
 * Dynamically loads module pages from /modules/[module]/app/
 * This route handles ALL module pages via catch-all routing.
 *
 * URL Pattern: /[module]/[[...slug]]
 * Examples:
 *   /hello-world → /modules/hello-world/app/page.tsx
 *   /hello-world/settings → /modules/hello-world/app/settings/page.tsx
 *
 * IMPORTANT: This uses a registry-based approach since Next.js doesn't support
 * fully dynamic imports at build time.
 */

import { notFound } from 'next/navigation'
import { getEnabledModule } from '@/lib/modules/module-registry'
import { ErrorBoundary, ModuleErrorFallback } from '@/components/error-boundary'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

// Import all module pages at build time
// This is the only way to make dynamic routing work with Next.js App Router
const MODULE_PAGES: Record<string, any> = {
  'hello-world': () => import('@/modules/hello-world/app/page')
}

/**
 * Module Page Component
 *
 * Validates module exists and is enabled, then dynamically imports
 * and renders the module's page component.
 */
export default async function ModuleCatchAllPage({
  params
}: {
  params: Promise<{ module: string; slug?: string[] }>
}) {
  // Next.js 15: params is a Promise
  const { module, slug = [] } = await params

  console.log(`[Module Route] Attempting to load module: ${module}`)

  // Server-side validation - check if module exists and is enabled
  const moduleInfo = await getEnabledModule(module)

  console.log(`[Module Route] moduleInfo result:`, moduleInfo ? `Found (${moduleInfo.name})` : 'null')

  if (!moduleInfo) {
    // Module doesn't exist or is disabled
    console.error(`[Module Route] 404 - Module not enabled or doesn't exist: ${module}`)
    notFound()
  }

  // Check if we have a page loader for this module
  const pageLoader = MODULE_PAGES[module]

  console.log(`[Module Route] Page loader exists:`, !!pageLoader)

  if (!pageLoader) {
    console.error(`[Module Route] 404 - No page loader registered for module: ${module}`)
    notFound()
  }

  try {
    // Dynamic import of module page component
    // IMPORTANT: Module pages MUST export default (not named exports)
    const PageComponent = await pageLoader()

    if (!PageComponent.default) {
      console.error(`Module ${module} page must export default component`)
      notFound()
    }

    // Determine if sidebar should be shown (default: true)
    const showSidebar = moduleInfo.sidebar !== false

    // Wrap module page in error boundary to prevent crashes
    const pageContent = (
      <ErrorBoundary
        fallback={<ModuleErrorFallback moduleName={moduleInfo.name} />}
      >
        <PageComponent.default />
      </ErrorBoundary>
    )

    // Conditionally wrap with sidebar based on module.json sidebar field
    if (showSidebar) {
      return (
        <div className="min-h-screen bg-gray-50/50">
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              {pageContent}
            </SidebarInset>
          </SidebarProvider>
        </div>
      )
    } else {
      // No sidebar - full width layout
      return (
        <div className="min-h-screen bg-gray-50/50">
          {pageContent}
        </div>
      )
    }
  } catch (error: any) {
    // Log the error for debugging
    console.error(`Failed to load module ${module} page:`, error)
    notFound()
  }
}

/**
 * Generate metadata for module pages
 *
 * This provides dynamic page titles and metadata based on the module
 */
export async function generateMetadata({
  params
}: {
  params: Promise<{ module: string; slug?: string[] }>
}) {
  const { module } = await params

  // Get module info
  const moduleInfo = await getEnabledModule(module)

  if (!moduleInfo) {
    return {
      title: 'Not Found'
    }
  }

  return {
    title: `${moduleInfo.name} | ARI`,
    description: moduleInfo.description
  }
}
