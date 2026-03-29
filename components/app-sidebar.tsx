"use client"

import type * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useFeatures } from "@/lib/features-context"
import { menuConfig, getUrlToFeatureMap } from "@/lib/menu-config"
import { useEnabledModulesFromContext } from "@/lib/modules/context"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import { useDragDropMode } from "@/components/drag-drop-mode-context"
import { useTheme } from "@/lib/theme/theme-context"
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

// Types for render items (extracted so SortableSidebarGroup can use them)
type ModuleGroup = {
  type: 'group'
  title: string
  modules: ReturnType<typeof useEnabledModulesFromContext>
  minPriority: number
}
type SingleModule = {
  type: 'single'
  module: ReturnType<typeof useEnabledModulesFromContext>[0]
  minPriority: number
}
type RenderItem = ModuleGroup | SingleModule

// Sortable wrapper for sidebar groups in drag mode
function SortableSidebarGroup({ id, item, dragModeClass, position }: { id: string; item: RenderItem; dragModeClass: string; position: 'main' | 'bottom' }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 9999 : undefined,
    cursor: 'grab',
  }

  const modules = item.type === 'group' ? item.modules : [item.module]
  const routes = modules.flatMap(module => {
    const posRoutes = module.routes?.filter(r => r.sidebarPosition === position) || []
    return posRoutes.map(route => ({ route, module, hasSubmenu: !!module.submenu?.component }))
  })

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={dragModeClass}>
      <SidebarGroup>
        {item.type === 'group' && <SidebarGroupLabel>{item.title}</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {routes.map(({ route, module, hasSubmenu }) => {
              const Icon = getLucideIcon(route.icon || module.icon)
              return (
                <SidebarMenuItem key={route.path}>
                  <SidebarMenuButton asChild>
                    <a href={route.path} className="flex items-center pointer-events-none">
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
    </div>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { isFeatureEnabled, loading } = useFeatures()
  const [showMainMenu, setShowMainMenu] = useState(false)

  // Get enabled modules from context (pre-fetched server-side)
  const enabledModules = useEnabledModulesFromContext()

  // Drag and drop mode
  const { isDragMode, setPendingOrder, moduleOrder } = useDragDropMode()

  // Theme settings for sidebar view
  const { sidebarView } = useTheme()
  const isCompressed = sidebarView === 'compressed'
  // dnd-kit sensors with distance activation to avoid accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

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
  // Use moduleOrder from context if available (overrides server-side menuPriority)
  const sortModules = (modules: typeof enabledModules) => {
    return [...modules].sort((a, b) => {
      // Prefer locally saved moduleOrder, fallback to server-side menuPriority
      const priorityA = moduleOrder?.[a.id] ?? a.menuPriority ?? 50
      const priorityB = moduleOrder?.[b.id] ?? b.menuPriority ?? 50

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

  // Group modules by title/group field
  // Modules with same title are collected together; ungrouped modules render individually
  const groupModulesForRender = (
    modules: typeof mainModules,
    position: 'main' | 'bottom'
  ): RenderItem[] => {
    // Filter to modules that have routes for this position
    const modulesWithRoutes = modules.filter(module => {
      const routes = module.routes?.filter(r => r.sidebarPosition === position) || []
      return routes.length > 0
    })

    // Collect modules by title (group field)
    const grouped: Record<string, typeof mainModules> = {}
    const ungrouped: typeof mainModules = []

    for (const module of modulesWithRoutes) {
      const groupName = module.group
      if (groupName) {
        if (!grouped[groupName]) {
          grouped[groupName] = []
        }
        grouped[groupName].push(module)
      } else {
        ungrouped.push(module)
      }
    }

    // Build render items
    const renderItems: RenderItem[] = []

    // Helper: get effective priority for a module (dynamic moduleOrder > static menuPriority)
    const getEffectivePriority = (m: typeof mainModules[0]) =>
      moduleOrder?.[m.id] ?? m.menuPriority ?? 50

    // Add groups
    for (const [title, mods] of Object.entries(grouped)) {
      // Sort modules within group by effective priority
      mods.sort((a, b) => getEffectivePriority(a) - getEffectivePriority(b))
      renderItems.push({
        type: 'group',
        title,
        modules: mods,
        minPriority: Math.min(...mods.map(m => getEffectivePriority(m)))
      })
    }

    // Add ungrouped modules as singles
    for (const module of ungrouped) {
      renderItems.push({
        type: 'single',
        module,
        minPriority: getEffectivePriority(module)
      })
    }

    // Sort all render items by minPriority
    renderItems.sort((a, b) => a.minPriority - b.minPriority)

    return renderItems
  }

  const mainRenderItems = groupModulesForRender(mainModules, 'main')
  const bottomRenderItems = groupModulesForRender(bottomModules, 'bottom')

  // Combined drag items list for dnd-kit (main + bottom together), tagged with position
  type DragItem = { item: RenderItem; position: 'main' | 'bottom' }
  const allDragItems = useMemo(
    () => [
      ...mainRenderItems.map(item => ({ item, position: 'main' as const })),
      ...bottomRenderItems.map(item => ({ item, position: 'bottom' as const })),
    ],
    [mainRenderItems, bottomRenderItems]
  )

  // Local state so React controls drag-mode order
  const [dragItems, setDragItems] = useState<DragItem[]>([])
  useEffect(() => {
    if (isDragMode) setDragItems(allDragItems)
  }, [isDragMode]) // Only reset when entering drag mode

  const dragItemIds = useMemo(
    () => dragItems.map(({ item }) => item.type === 'group' ? `group-${item.title}` : item.module.id),
    [dragItems]
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = dragItemIds.indexOf(active.id as string)
    const newIndex = dragItemIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(dragItems, oldIndex, newIndex)
    setDragItems(reordered)

    // Convert to priority map
    const newOrder: Record<string, number> = {}
    reordered.forEach(({ item }, index) => {
      const basePriority = (index + 1) * 10
      if (item.type === 'group') {
        item.modules.forEach((mod, modIndex) => {
          newOrder[mod.id] = basePriority + modIndex * 0.1
        })
      } else {
        newOrder[item.module.id] = basePriority
      }
    })
    setPendingOrder(newOrder)
  }

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

  // Apple-esque drag mode styling: subtle ring with glow effect (ring-inset keeps it within bounds)
  const dragModeClass = isDragMode
    ? "ring-1 ring-inset ring-blue-400/50 shadow-[0_0_12px_rgba(96,165,250,0.2)] rounded-lg mx-2 my-1"
    : ""

  // Otherwise show the main menu
  return (
    <Sidebar {...props} className={isDragMode ? "drag-mode-active" : ""}>
      <SidebarContent className="-mt-3.5">
        {/* Core navigation groups - not draggable */}
        {filteredNavMain.map((item) => (
          <SidebarGroup key={item.title}>
            {!isCompressed && <SidebarGroupLabel>{item.title}</SidebarGroupLabel>}
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

        {/* Modules container - groups are draggable units */}
        {isDragMode ? (
          /* Drag mode: Groups as draggable units via dnd-kit */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dragItemIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col min-h-0 overflow-auto pb-4">
                {dragItems.map(({ item, position }) => {
                  const itemId = item.type === 'group' ? `group-${item.title}` : item.module.id
                  return (
                    <SortableSidebarGroup key={itemId} id={itemId} item={item} dragModeClass={dragModeClass} position={position} />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          /* Normal mode: Grouped modules */
          <>
            {/* Module navigation - Main position */}
            {mainRenderItems.map((item) => {
              if (item.type === 'group') {
                // Render a group of modules under one title
                return (
                  <SidebarGroup key={`main-group-${item.title}`}>
                    {!isCompressed && <SidebarGroupLabel>{item.title}</SidebarGroupLabel>}
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {item.modules.map((module, moduleIndex) => {
                          const mainRoutes = module.routes?.filter(r => r.sidebarPosition === 'main') || []
                          const hasSubmenu = !!module.submenu?.component
                          // Tighter spacing for non-first modules in group
                          const groupingClass = moduleIndex > 0 ? '[&>li]:mt-0' : ''

                          return (
                            <div key={module.id} className={groupingClass}>
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
                            </div>
                          )
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )
              } else {
                // Render a single ungrouped module
                const module = item.module
                const mainRoutes = module.routes?.filter(r => r.sidebarPosition === 'main') || []
                const hasSubmenu = !!module.submenu?.component

                return (
                  <SidebarGroup key={module.id}>
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
              }
            })}

            {/* Module navigation - Bottom position */}
            {bottomRenderItems.map((item) => {
              if (item.type === 'group') {
                // Render a group of modules under one title
                return (
                  <SidebarGroup key={`bottom-group-${item.title}`}>
                    {!isCompressed && <SidebarGroupLabel>{item.title}</SidebarGroupLabel>}
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {item.modules.map((module, moduleIndex) => {
                          const bottomRoutes = module.routes?.filter(r => r.sidebarPosition === 'bottom') || []
                          const hasSubmenu = !!module.submenu?.component
                          const groupingClass = moduleIndex > 0 ? '[&>li]:mt-0' : ''

                          return (
                            <div key={module.id} className={groupingClass}>
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
                            </div>
                          )
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )
              } else {
                // Render a single ungrouped module
                const module = item.module
                const bottomRoutes = module.routes?.filter(r => r.sidebarPosition === 'bottom') || []
                const hasSubmenu = !!module.submenu?.component

                return (
                  <SidebarGroup key={module.id}>
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
              }
            })}
          </>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
