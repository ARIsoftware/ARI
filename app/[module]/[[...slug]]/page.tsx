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

import { notFound, redirect } from 'next/navigation'
import { getEnabledModule } from '@/lib/modules/module-registry'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { ErrorBoundary, ModuleErrorFallback } from '@/components/error-boundary'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { TopBar } from '@/components/top-bar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { TaskAnnouncement } from '@/components/task-announcement'
import { MainContentWrapper } from '@/components/main-content-wrapper'
import { MODULE_PAGES } from '@/lib/generated/module-pages-registry'

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

  // Early filter: skip non-module paths (static files, etc.)
  const nonModulePaths = ['favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json', '_next', '.well-known']
  if (nonModulePaths.includes(module) || module.startsWith('_') || module.startsWith('.')) {
    notFound()
  }

  // Construct the full page path (module + slug)
  const pagePath = slug.length > 0 ? `${module}/${slug.join('/')}` : module

  // If a stale/invalid cookie exists, middleware may let this through.
  // Do a real session check here so expired sessions redirect to sign-in instead of 404.
  const { user } = await getAuthenticatedUser()
  if (!user) {
    redirect('/sign-in')
  }

  // Server-side validation - check if module exists and is enabled
  const moduleInfo = await getEnabledModule(module, user.id)

  if (!moduleInfo) {
    // Module doesn't exist or is disabled
    console.error(`[Module Route] 404 - Module not enabled or doesn't exist: ${module}`)
    notFound()
  }

  // Look up the page loader - first try exact match, then match dynamic [param] patterns
  let pageLoader = MODULE_PAGES[pagePath]

  if (!pageLoader) {
    // Find a registry key with dynamic segments (e.g., "tasks/edit/[id]") that matches the URL
    const pathParts = pagePath.split('/')
    for (const key of Object.keys(MODULE_PAGES)) {
      const keyParts = key.split('/')
      if (keyParts.length !== pathParts.length) continue
      const matches = keyParts.every((part, i) =>
        part === pathParts[i] || (part.startsWith('[') && part.endsWith(']'))
      )
      if (matches) {
        pageLoader = MODULE_PAGES[key]
        break
      }
    }
  }

  if (!pageLoader) {
    console.error(`[Module Route] 404 - No page loader registered for path: ${pagePath}`)
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

    // Determine if fullscreen mode is enabled (default: false)
    // When fullscreen is true, hide sidebar and top bar
    const isFullscreen = moduleInfo.fullscreen === true

    // Wrap module page in error boundary to prevent crashes
    const pageContent = (
      <ErrorBoundary
        fallback={<ModuleErrorFallback moduleName={moduleInfo.name} />}
      >
        <PageComponent.default />
      </ErrorBoundary>
    )

    // Conditionally wrap based on fullscreen mode
    if (isFullscreen) {
      // Fullscreen mode - pure module content only, no sidebar, no top bar
      return (
        <div className="min-h-screen bg-background">
          {pageContent}
        </div>
      )
    } else {
      // Normal mode - show sidebar and top bar (default)
      return (
        <div className="min-h-screen bg-background">
          <TaskAnnouncement />
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <MainContentWrapper>
                <TopBar>
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{moduleInfo.name}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </TopBar>
                {pageContent}
              </MainContentWrapper>
            </SidebarInset>
          </SidebarProvider>
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

  // Early filter: skip non-module paths (static files, etc.)
  const nonModulePaths = ['favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json', '_next', '.well-known']
  if (nonModulePaths.includes(module) || module.startsWith('_') || module.startsWith('.')) {
    return { title: 'Not Found' }
  }

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
