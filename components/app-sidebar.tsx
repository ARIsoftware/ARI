"use client"

import type * as React from "react"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { useFeatures } from "@/lib/features-context"
import { menuConfig, getUrlToFeatureMap } from "@/lib/menu-config"
import { useEnabledModulesFromContext } from "@/lib/modules/context"
import { getLucideIcon } from "@/lib/modules/icon-utils"
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
import { SubmenuRenderer } from "@/components/sidebar-submenu-renderer"

// Get URL to feature name mapping dynamically
const URL_TO_FEATURE_MAP = getUrlToFeatureMap()

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { isFeatureEnabled, loading } = useFeatures()
  const [showMainMenu, setShowMainMenu] = useState(false)

  // Get enabled modules from context (pre-fetched server-side)
  const enabledModules = useEnabledModulesFromContext()

  // Find if current route belongs to a module with a submenu
  const activeSubmenuModule = enabledModules.find(module => {
    if (!module.submenu?.component) return false
    // Check if current path starts with any of the module's routes
    return module.routes?.some(route => pathname.startsWith(route.path))
  })

  // Reset showMainMenu when navigating to a route outside the current submenu module
  useEffect(() => {
    setShowMainMenu(false)
  }, [activeSubmenuModule?.id])

  // Sort modules by menuPriority (lower first), then alphabetically
  const sortModules = (modules: typeof enabledModules) => {
    return [...modules].sort((a, b) => {
      const priorityA = a.menuPriority ?? 50
      const priorityB = b.menuPriority ?? 50

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      // Same priority - sort alphabetically
      return a.name.localeCompare(b.name)
    })
  }

  // Filter modules by sidebar position
  const mainModulesUnsorted = enabledModules.filter(module =>
    module.routes?.some(route => route.sidebarPosition === 'main')
  )
  const bottomModulesUnsorted = enabledModules.filter(module =>
    module.routes?.some(route => route.sidebarPosition === 'bottom')
  )

  const mainModules = sortModules(mainModulesUnsorted)
  const bottomModules = sortModules(bottomModulesUnsorted)

  // Filter items based on feature preferences
  const filterItems = (items: typeof menuConfig[0]['items']) => {
    return items.filter(item => {
      const featureName = URL_TO_FEATURE_MAP[item.url]
      // If URL is not mapped to a feature (e.g., '#' placeholders), show it
      if (!featureName) return true
      // Otherwise check if feature is enabled
      return isFeatureEnabled(featureName)
    })
  }

  // Filter groups that have at least one visible item
  const filteredNavMain = menuConfig
    .map(group => ({
      ...group,
      items: filterItems(group.items)
    }))
    .filter(group => group.items.length > 0)

  // Only show loading for features context (which is also fast)
  // Modules are pre-fetched server-side, so no loading state needed
  if (loading) {
    return (
      <Sidebar {...props}>
        <SidebarContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  // If we're on a page with a submenu and not forcing main menu, show the submenu
  if (activeSubmenuModule && !showMainMenu) {
    return (
      <Sidebar {...props}>
        <SidebarContent>
          <SubmenuRenderer
            moduleId={activeSubmenuModule.id}
            module={activeSubmenuModule}
            onBack={() => setShowMainMenu(true)}
          />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  // Otherwise show the main menu
  return (
    <Sidebar {...props}>
      <SidebarContent>
        {/* Core navigation groups */}
        {filteredNavMain.map((item) => (
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

        {/* Module navigation - Main position */}
        {mainModules.map((module) => {
          const mainRoutes = module.routes?.filter(r => r.sidebarPosition === 'main') || []
          if (mainRoutes.length === 0) return null
          const hasSubmenu = !!module.submenu?.component

          return (
            <SidebarGroup key={module.id}>
              {module.title && <SidebarGroupLabel>{module.title}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainRoutes.map((route) => {
                    const Icon = getLucideIcon(route.icon || module.icon)

                    return (
                      <SidebarMenuItem key={route.path}>
                        <SidebarMenuButton asChild>
                          <a href={route.path} className="flex items-center">
                            <Icon className="mr-2 size-4" />
                            <span className={hasSubmenu ? "flex-1" : undefined}>{route.label}</span>
                            {hasSubmenu && <ChevronRight className="size-4 text-muted-foreground" />}
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}

        {/* Module navigation - Bottom position */}
        {bottomModules.map((module) => {
          const bottomRoutes = module.routes?.filter(r => r.sidebarPosition === 'bottom') || []
          if (bottomRoutes.length === 0) return null
          const hasSubmenu = !!module.submenu?.component

          return (
            <SidebarGroup key={module.id}>
              {module.title && <SidebarGroupLabel>{module.title}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {bottomRoutes.map((route) => {
                    const Icon = getLucideIcon(route.icon || module.icon)

                    return (
                      <SidebarMenuItem key={route.path}>
                        <SidebarMenuButton asChild>
                          <a href={route.path} className="flex items-center">
                            <Icon className="mr-2 size-4" />
                            <span className={hasSubmenu ? "flex-1" : undefined}>{route.label}</span>
                            {hasSubmenu && <ChevronRight className="size-4 text-muted-foreground" />}
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
