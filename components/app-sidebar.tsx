import type * as React from "react"
import { SearchForm } from "./search-form"
import { VersionSwitcher } from "./version-switcher"
import { UserProfileDropdown } from "./user-profile-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { CheckSquare, Plus, Archive, Dumbbell, Target, TrendingUp, Users, UserPlus, Settings } from "lucide-react"

const data = {
  versions: ["1.0.1", "1.1.0-alpha", "2.0.0-beta1"],
  navMain: [
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
          url: "#",
          icon: Plus,
        },
        {
          title: "Completed",
          url: "#",
          icon: Archive,
          isActive: true,
        },
      ],
    },
    {
      title: "Fitness",
      url: "#",
      icon: Dumbbell,
      items: [
        {
          title: "Workouts",
          url: "#",
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
      title: "People",
      url: "#",
      icon: Users,
      items: [
        {
          title: "All Contacts",
          url: "#",
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
      <SidebarHeader>
        <VersionSwitcher versions={data.versions} defaultVersion={data.versions[0]} />
        <SearchForm />
      </SidebarHeader>
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
      <SidebarFooter>
        <div className="flex items-center justify-center p-2">
          <UserProfileDropdown />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
