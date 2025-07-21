import { DM_Sans } from "next/font/google"
import { currentUser } from "@clerk/nextjs/server"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default async function Page() {
  let user = null

  // Try to get user, but don't fail if Clerk is not configured
  try {
    user = await currentUser()
  } catch (error) {
    console.log("Clerk not configured, continuing without user")
  }

  return (
    <div className="min-h-screen">
      <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI-2</span>
      </div>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Overview</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="grid auto-rows-min gap-4 md:grid-cols-3">
              <div className="aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-lg font-semibold">Welcome back!</h3>
                  <p className="text-sm text-muted-foreground">
                    {user?.firstName ? `Hello, ${user.firstName}` : "Hello there"}
                  </p>
                </div>
              </div>
              <div className="aspect-video rounded-xl bg-muted/50" />
              <div className="aspect-video rounded-xl bg-muted/50" />
            </div>
            <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
