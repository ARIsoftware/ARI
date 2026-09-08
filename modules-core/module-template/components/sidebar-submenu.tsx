'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
    path: '/module-template',
    icon: Home,
  },
  {
    label: 'Settings',
    path: '/module-template/settings',
    icon: Settings,
  },
]

// Submenus receive ModuleSubmenuProps ({ moduleId, module: manifest }) from
// '@/lib/modules/submenu-types' — declare the props parameter when you need
// manifest data; this demo is static.
export default function ModuleTemplateSubmenu() {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton asChild isActive={pathname === item.path}>
                {/* Link (soft nav) not <a> (hard reload) so the React Query cache
                    survives — subpages share the settings query and render instantly. */}
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
