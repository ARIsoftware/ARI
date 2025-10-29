import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import DashboardClient from "@/components/dashboard-client"
import { getAuthenticatedUser } from "@/lib/auth-helpers"
import { getRandomQuote } from "@/lib/quotes-server"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default async function DashboardPage() {
  // Fetch user and quote server-side
  const { user } = await getAuthenticatedUser()
  const quote = user ? await getRandomQuote(user.id) : null

  return (
    <div className="min-h-screen bg-gray-50/50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <DashboardClient initialQuote={quote} />
      </SidebarProvider>
    </div>
  )
}
