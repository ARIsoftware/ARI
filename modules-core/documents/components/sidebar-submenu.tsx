'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileBox, Settings, Trash2 } from 'lucide-react'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'

const menuItems = [
  {
    title: 'Overview',
    href: '/documents',
    icon: FileBox,
  },
  {
    title: 'Trash',
    href: '/documents/trash',
    icon: Trash2,
  },
  {
    title: 'Settings',
    href: '/documents/settings',
    icon: Settings,
  },
]

export default function DocumentsSubmenu() {
  const pathname = usePathname()

  return (
    <SidebarMenu>
      {menuItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={item.href}>
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
