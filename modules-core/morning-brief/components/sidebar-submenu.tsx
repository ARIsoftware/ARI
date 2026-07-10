'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleSubmenuProps } from '@/lib/modules/submenu-types'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Sunrise, Settings } from 'lucide-react'

const menuItems = [
  {
    label: 'Brief',
    path: '/morning-brief',
    icon: Sunrise,
  },
  {
    label: 'Settings',
    path: '/morning-brief/settings',
    icon: Settings,
  },
]

export default function MorningBriefSubmenu({ moduleId, module }: ModuleSubmenuProps) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton asChild isActive={pathname === item.path}>
                <Link href={item.path} className="flex items-center">
                  <item.icon className="mr-2 size-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
