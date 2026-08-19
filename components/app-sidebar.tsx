"use client"

import * as React from "react"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import Link from "next/link"
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
import { useEnabledModulesFromContext } from "@/lib/modules/context"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import { useDragDropMode } from "@/components/drag-drop-mode-context"
import { useTheme } from "@/lib/theme/theme-context"
import { useCanHover } from "@/hooks/use-can-hover"
import { cn } from "@/lib/utils"
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
  useSidebar,
} from "@/components/ui/sidebar"
import { SubmenuRenderer } from "@/components/sidebar-submenu-renderer"


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

// Mini view: the sidebar column sits at rail width and grows to full width
// while the pointer is over it, pushing the page content across with it.
const MINI_RAIL_WIDTH = "3.25rem"
const MINI_FULL_WIDTH = "16rem"
// Hover intent: sweeping the pointer across the rail on the way to the top bar
// shouldn't expand it (the whole page shifts right when it does), and brushing
// past the edge on the way out shouldn't collapse it mid-click.
const MINI_OPEN_DELAY_MS = 150
const MINI_CLOSE_DELAY_MS = 120

type ModuleItem = ReturnType<typeof useEnabledModulesFromContext>[0]

/**
 * Renders the module nav for one sidebar position. Shared by every view:
 * Default (group labels), Compressed (no labels) and Mini (icons only in the
 * rail, full labels in the hover panel).
 */
function ModuleNavGroups({
  items,
  position,
  showGroupLabels,
  onItemClick,
}: {
  items: RenderItem[]
  position: 'main' | 'bottom'
  showGroupLabels: boolean
  onItemClick: (e: React.MouseEvent, module: ModuleItem) => void
}) {
  return (
    <>
      {items.map((item) => {
        const modules = item.type === 'group' ? item.modules : [item.module]
        const groupKey = item.type === 'group' ? `${position}-group-${item.title}` : item.module.id

        return (
          <SidebarGroup key={groupKey}>
            {item.type === 'group' && showGroupLabels && <SidebarGroupLabel>{item.title}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {modules.map((module, moduleIndex) => {
                  const routes = module.routes?.filter(r => r.sidebarPosition === position) || []
                  const hasSubmenu = !!module.submenu?.component
                  // Tighter spacing for non-first modules in a group
                  const groupingClass = moduleIndex > 0 ? '[&>li]:mt-0' : ''

                  const links = routes.map((route) => {
                    const Icon = getLucideIcon(route.icon || module.icon)
                    return (
                      <SidebarMenuItem key={route.path}>
                        <SidebarMenuButton asChild>
                          <Link href={route.path} className="flex items-center" onClick={(e) => onItemClick(e, module)}>
                            <Icon className="mr-2 size-4" />
                            <span className={hasSubmenu ? "flex-1" : undefined}>{route.label}</span>
                            {hasSubmenu && <ChevronRight className="size-4 text-muted-foreground" />}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })

                  // Groups wrap each module so the spacing tweak applies per module;
                  // ungrouped singles render their items straight into the menu.
                  return item.type === 'group' ? (
                    <div key={module.id} className={groupingClass}>{links}</div>
                  ) : (
                    <React.Fragment key={module.id}>{links}</React.Fragment>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}

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
                    {/* Drag-mode preview only (pointer-events-none, never navigated).
                        Keep as <a> so it doesn't register the router / trigger prefetch. */}
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
  const [showMainMenu, setShowMainMenu] = useState(false)

  // Get enabled modules from context (pre-fetched server-side)
  const enabledModules = useEnabledModulesFromContext()

  // Drag and drop mode
  const { isDragMode, setPendingOrder, moduleOrder } = useDragDropMode()

  // Theme settings for sidebar view
  const { sidebarView } = useTheme()
  const isCompressed = sidebarView === 'compressed'

  // Close the full-screen mobile menu after navigating
  const { isMobile, openMobile, setOpenMobile } = useSidebar()

  // Mini view: an icon rail that expands on hover, pushing the page across.
  // Mobile uses the full-screen sheet, drag mode needs full-width groups to be
  // draggable, and a touch-only device can never fire the hover that reveals
  // the labels — all three fall back to the regular rendering.
  const canHover = useCanHover()
  const isMini = sidebarView === 'mini' && !isMobile && !isDragMode && canHover
  const [miniExpanded, setMiniExpanded] = useState(false)
  // Open and close are mutually exclusive, so one timer covers both.
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearMiniTimer = () => {
    if (miniTimer.current) {
      clearTimeout(miniTimer.current)
      miniTimer.current = null
    }
  }
  const openMini = useCallback(() => {
    clearMiniTimer()
    miniTimer.current = setTimeout(() => setMiniExpanded(true), MINI_OPEN_DELAY_MS)
  }, [])
  const closeMini = useCallback(() => {
    clearMiniTimer()
    miniTimer.current = setTimeout(() => setMiniExpanded(false), MINI_CLOSE_DELAY_MS)
  }, [])
  // Keyboard users get no hover: expand immediately when focus enters the rail so
  // the focused link is readable. Limited to :focus-visible so clicking an icon
  // (where the pointer is already there to hover with) doesn't jump the column.
  const handleMiniFocus = useCallback((e: React.FocusEvent) => {
    if (!(e.target instanceof HTMLElement) || !e.target.matches(':focus-visible')) return
    clearMiniTimer()
    setMiniExpanded(true)
  }, [])
  // Collapse when the view switches away from Mini (e.g. the user picks another
  // sidebar view, or drag mode takes over) — adjusted during render rather than
  // in an effect so there's no extra pass with a stale expanded panel.
  const [wasMini, setWasMini] = useState(isMini)
  if (wasMini !== isMini) {
    setWasMini(isMini)
    // A pending collapse timer can still fire afterwards; it only sets the same
    // false value, so there's nothing to clean up here.
    if (!isMini) setMiniExpanded(false)
  }
  // Drop any pending collapse timer on unmount.
  useEffect(() => clearMiniTimer, [])

  const handleNavClick = () => {
    setShowMainMenu(false)
    if (isMobile) setOpenMobile(false)
    // Mini deliberately stays open after a click — the panel follows the
    // pointer, so it collapses when the cursor leaves, not when you navigate.
  }

  // On mobile, tapping a main-menu item that has a submenu should reveal that
  // submenu inside the sheet (rather than navigating away and closing it, which
  // makes the submenu easy to miss). Items without a submenu navigate directly.
  const [mobileSubmenuId, setMobileSubmenuId] = useState<string | null>(null)
  const handleMainItemClick = (e: React.MouseEvent, module: typeof enabledModules[0]) => {
    if (isMobile && module.submenu?.component) {
      e.preventDefault()
      setMobileSubmenuId(module.id)
      return
    }
    handleNavClick()
  }
  // Reset the forced submenu whenever the sheet closes, so reopening starts at
  // the main menu.
  useEffect(() => {
    if (!openMobile) setMobileSubmenuId(null)
  }, [openMobile])
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

  // Reset showMainMenu on any navigation. Previously this only fired when
  // the active submenu module changed, so once a user pressed "Back" the
  // main menu stuck for every subsequent page inside the same module.
  useEffect(() => {
    setShowMainMenu(false)
    setMobileSubmenuId(null)
  }, [pathname, activeSubmenuModule?.id])

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

    for (const mod of modulesWithRoutes) {
      const groupName = mod.group
      if (groupName) {
        if (!grouped[groupName]) {
          grouped[groupName] = []
        }
        grouped[groupName].push(mod)
      } else {
        ungrouped.push(mod)
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
    for (const mod of ungrouped) {
      renderItems.push({
        type: 'single',
        module: mod,
        minPriority: getEffectivePriority(mod)
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

  // Mobile: a submenu the user explicitly tapped into takes precedence and its
  // Back button returns to the main menu. Desktop/default: show the submenu for
  // the current page unless the user pressed Back to force the main menu.
  const mobileSubmenuModule = mobileSubmenuId
    ? enabledModules.find(module => module.id === mobileSubmenuId)
    : undefined
  const submenuToShow = mobileSubmenuModule ?? (showMainMenu ? undefined : activeSubmenuModule)

  // Version stamp shown at the bottom of the full menu (Default / Compressed /
  // the Mini hover panel — the icon rail is too narrow for it).
  const versionFooter = (
    <div
      className="mt-auto px-4 py-2 text-[10px] text-muted-foreground/60 font-mono select-none"
      title={`commit ${process.env.NEXT_PUBLIC_ARI_COMMIT}`}
    >
      ARI {process.env.NEXT_PUBLIC_ARI_VERSION}
    </div>
  )

  // Mini view. Handled before the submenu early-return below because it renders
  // both the main menu and module submenus itself: the column is pinned at rail
  // width and expands on hover, pushing the page content across (labels are
  // clipped by the width and faded out via .mini-sidebar in globals.css).
  if (isMini) {
    return (
      <Sidebar
        {...props}
        style={
          {
            '--sidebar-width': miniExpanded ? MINI_FULL_WIDTH : MINI_RAIL_WIDTH,
            ...props.style,
          } as React.CSSProperties
        }
        className={cn('mini-sidebar', props.className)}
        data-mini-expanded={miniExpanded}
        onMouseEnter={openMini}
        onMouseLeave={closeMini}
        onFocusCapture={handleMiniFocus}
        onBlurCapture={closeMini}
      >
        <SidebarContent className="overflow-x-hidden">
          {submenuToShow ? (
            <SubmenuRenderer
              moduleId={submenuToShow.id}
              module={submenuToShow}
              onBack={() => {
                setMobileSubmenuId(null)
                setShowMainMenu(true)
              }}
            />
          ) : (
            <>
              <ModuleNavGroups
                items={mainRenderItems}
                position="main"
                showGroupLabels={false}
                onItemClick={handleMainItemClick}
              />
              <ModuleNavGroups
                items={bottomRenderItems}
                position="bottom"
                showGroupLabels={false}
                onItemClick={handleMainItemClick}
              />
              {/* Too wide for the rail — only shown once expanded */}
              {miniExpanded && versionFooter}
            </>
          )}
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  if (submenuToShow) {
    return (
      <Sidebar {...props}>
        <SidebarContent>
          <SubmenuRenderer
            moduleId={submenuToShow.id}
            module={submenuToShow}
            onBack={() => {
              setMobileSubmenuId(null)
              setShowMainMenu(true)
            }}
          />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  // Apple-esque drag mode styling: subtle ring with glow effect (ring-inset keeps it within bounds)
  const dragModeClass = isDragMode
    ? "outline outline-[3px] outline-[#60a5fa80] shadow-[0_0_12px_rgba(96,165,250,0.2)] rounded-lg mx-2 my-1"
    : ""

  // Otherwise show the main menu
  return (
    <Sidebar {...props} className={isDragMode ? "drag-mode-active" : ""}>
      <SidebarContent className="mobile-main-nav -mt-3.5">
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
            <ModuleNavGroups
              items={mainRenderItems}
              position="main"
              showGroupLabels={!isCompressed}
              onItemClick={handleMainItemClick}
            />

            {/* Module navigation - Bottom position */}
            <ModuleNavGroups
              items={bottomRenderItems}
              position="bottom"
              showGroupLabels={!isCompressed}
              onItemClick={handleMainItemClick}
            />
          </>
        )}
        {versionFooter}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
