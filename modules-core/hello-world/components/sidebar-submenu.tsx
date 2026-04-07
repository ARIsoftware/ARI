'use client'

import { usePathname } from 'next/navigation'
import type { ModuleSubmenuProps } from '@/components/sidebar-submenu-renderer'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Home, Settings } from 'lucide-react'

const menuItems = [
  {
    label: 'Overview',
    path: '/hello-world',
    icon: Home,
  },
  {
    label: 'Settings',
    path: '/hello-world/settings',
    icon: Settings,
  },
]

export default function HelloWorldSubmenu({ moduleId, module }: ModuleSubmenuProps) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton asChild isActive={pathname === item.path}>
                <a href={item.path} className="flex items-center">
                  <item.icon className="mr-2 size-4" />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
