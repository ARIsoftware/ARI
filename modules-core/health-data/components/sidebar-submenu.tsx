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
import {
  Home,
  Heart,
  Moon,
  Dumbbell,
  Route,
  Activity,
  PersonStanding,
  Stethoscope,
  ClipboardList,
  Table,
} from 'lucide-react'

const menuItems = [
  { label: 'Overview', path: '/health-data', icon: Home },
  { label: 'Heart', path: '/health-data/heart', icon: Heart },
  { label: 'Sleep', path: '/health-data/sleep', icon: Moon },
  { label: 'Workouts', path: '/health-data/workouts', icon: Dumbbell },
  { label: 'Routes', path: '/health-data/routes', icon: Route },
  { label: 'ECG', path: '/health-data/ecg', icon: Activity },
  { label: 'Mobility', path: '/health-data/mobility', icon: PersonStanding },
  { label: 'Vitals', path: '/health-data/vitals', icon: Stethoscope },
  { label: 'Clinical', path: '/health-data/clinical', icon: ClipboardList },
  { label: 'All Metrics', path: '/health-data/all-metrics', icon: Table },
]

export default function HealthDataSubmenu(_props: ModuleSubmenuProps) {
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
