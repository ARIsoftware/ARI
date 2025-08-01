import type * as React from "react"
import { UserProfileDropdown } from "./user-profile-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { CheckSquare, Plus, Archive, Dumbbell, Target, TrendingUp, Users, UserPlus, Settings } from "lucide-react"

const data = {
  navMain: [
    {
      title: "Fitness First",
      url: "#",
      icon: Dumbbell,
      items: [
        {
          title: "Daily Fitness",
          url: "/daily-fitness",
          icon: Dumbbell,
        },
        {
          title: "Goals",
          url: "#",
          icon: Target,
        },
        {
          title: "Progress",
          url: "#",
          icon: TrendingUp,
        },
      ],
    },
    {
      title: "Todo",
      url: "#",
      icon: CheckSquare,
      items: [
        {
          title: "All Tasks",
          url: "/tasks",
          icon: CheckSquare,
        },
        {
          title: "Add Task",
          url: "/add-task",
          icon: Plus,
        },
        {
          title: "Completed",
          url: "#",
          icon: Archive,
          isActive: false,
        },
      ],
    },
    {
      title: "People",
      url: "#",
      icon: Users,
      items: [
        {
          title: "All Contacts",
          url: "/contacts",
          icon: Users,
        },
        {
          title: "Add Contact",
          url: "#",
          icon: UserPlus,
        },
        {
          title: "Settings",
          url: "#",
          icon: Settings,
        },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarContent>
        {/* We create a SidebarGroup for each parent. */}
        {data.navMain.map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={item.isActive}>
                      <a href={item.url} className="flex items-center">
                        <item.icon className="mr-2 size-4" />
                        {item.title}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <div className="mt-auto mb-16 flex items-center justify-center p-4">
        <UserProfileDropdown />
      </div>
      <SidebarRail />
    </Sidebar>
  )
}
