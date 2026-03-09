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
import { Home, BarChart3, Settings } from 'lucide-react'

const menuItems = [
  {
    label: 'Overview',
    path: '/my-prospects',
    icon: Home,
  },
  {
    label: 'Analytics',
    path: '/my-prospects/analytics',
    icon: BarChart3,
  },
  {
    label: 'Settings',
    path: '/my-prospects/settings',
    icon: Settings,
  },
]

export default function MyProspectsSubmenu({ moduleId, module }: ModuleSubmenuProps) {
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
