'use client'

import { usePathname } from 'next/navigation'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Home, Settings } from 'lucide-react'
import type { ModuleSubmenuProps } from '@/lib/modules/submenu-types'

const menuItems = [
  { label: 'Videos', path: '/motivation', icon: Home },
  { label: 'Settings', path: '/motivation/settings', icon: Settings },
]

export default function MotivationSubmenu(_props: ModuleSubmenuProps) {
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
