import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { MainContentWrapper } from "@/components/main-content-wrapper"
import { AppBreadcrumb } from "@/components/app-breadcrumb"

/**
 * Shared shell for all authenticated app routes served from app/(app)/
 * (the module catch-all, /modules, and /settings).
 *
 * The shell — TaskAnnouncement bar + SidebarProvider + AppSidebar + TopBar — is
 * rendered ONCE here so it persists across client navigation: only the
 * {children} slot swaps. This removes the per-page remount (sidebar collapse,
 * focus timer, drag mode, submenu state all survive navigation) and de-duplicates
 * the shell that previously lived inline in each page.
 *
 * (app) is a route group, so it does NOT change any URLs — every path resolves
 * exactly as before. The auth gate here runs on hard load / RSC-tree changes,
 * not on every soft navigation between (app) children, so it complements rather
 * than replaces middleware's per-request cookie check and the catch-all's own
 * getAuthenticatedUser() call.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    redirect("/sign-in")
  }

  return (
    <div className="min-h-screen bg-background">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar>
            <AppBreadcrumb />
          </TopBar>
          <MainContentWrapper>{children}</MainContentWrapper>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
