"use client"

import { useEffect, useState, useRef, useMemo, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  Command,
  Settings,
  Package,
  LogOut,
  User,
  X
} from "lucide-react"
import { ThemePickerDropdown } from "@/components/theme-picker-dropdown"
import { useModules } from "@/lib/modules/module-hooks"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import { MODULE_TOPBAR_ICONS } from "@/lib/generated/module-topbar-registry"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DM_Sans } from "next/font/google"
import { Announcement, AnnouncementTag, AnnouncementTitle } from "@/components/ui/kibo-ui/announcement"

function truncateTaskName(taskName: string, maxLength: number = 50): string {
  if (taskName.length <= maxLength) return taskName
  return taskName.substring(0, maxLength) + "..."
}
import { useIsMobile } from "@/components/ui/use-mobile"
import { useSupabase } from "@/components/providers"
import { authClient } from "@/lib/auth-client"
import { useCommandPalette } from "@/components/command-palette"
import { useDragDropMode } from "@/components/drag-drop-mode-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { getGlobalTimerState } from "@/lib/focus-timer-state"

const globalTimerState = getGlobalTimerState()

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

// Define the order of built-in icons
const BUILTIN_ICONS = [
  { id: "icon-theme", label: "Theme" },
  { id: "icon-command", label: "Command" },
  { id: "icon-settings", label: "Settings" },
  { id: "icon-modules", label: "Modules" },
  { id: "icon-logout", label: "Logout" },
] as const

// Sortable wrapper for top bar icons in drag mode
function SortableTopBarIcon({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 9999 : undefined,
    cursor: 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

// Icons component for the top bar
function TopBarIcons({ isDragMode = false }: { isDragMode?: boolean }) {
  const router = useRouter()
  const { session, supabase } = useSupabase()
  const { setOpen: setCommandPaletteOpen } = useCommandPalette()
  const [mounted, setMounted] = useState(false)
  const user = session?.user
  const { modules } = useModules()
  const { iconOrder, setPendingIconOrder } = useDragDropMode()

  // Filter modules that have topBarIcon configured
  const moduleIcons = modules.filter(m => m.topBarIcon && (m.topBarIcon.icon || m.topBarIcon.component))

  // Track dynamically loaded top bar icon components from the registry
  const [loadedTopBarComponents, setLoadedTopBarComponents] = useState<Record<string, ComponentType<any>>>({})
  const loadingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Load component-based top bar icons from the registry
    const componentModules = modules.filter(m => m.topBarIcon?.component && m.id in MODULE_TOPBAR_ICONS)
    const toLoad = componentModules.filter(m => !loadingRef.current.has(m.id))
    if (toLoad.length === 0) return

    toLoad.forEach(m => loadingRef.current.add(m.id))

    Promise.all(
      toLoad.map(m =>
        MODULE_TOPBAR_ICONS[m.id]()
          .then((mod: any) => ({ id: m.id, component: mod.default as ComponentType<any> | undefined }))
          .catch(() => ({ id: m.id, component: undefined }))
      )
    ).then(results => {
      const loaded: Record<string, ComponentType<any>> = {}
      for (const { id, component } of results) {
        if (component) loaded[id] = component
      }
      if (Object.keys(loaded).length > 0) {
        setLoadedTopBarComponents(prev => ({ ...prev, ...loaded }))
      }
    })
  }, [modules])

  // Build all icons list with their IDs
  const allIcons = [
    ...moduleIcons.map(m => ({ id: `module-${m.id}`, type: "module" as const, module: m })),
    ...BUILTIN_ICONS.map(icon => ({ id: icon.id, type: "builtin" as const, builtinId: icon.id })),
  ]

  // Sort icons by saved order (lower number = earlier position)
  const sortedIcons = [...allIcons].sort((a, b) => {
    const orderA = iconOrder?.[a.id] ?? 50
    const orderB = iconOrder?.[b.id] ?? 50
    return orderA - orderB
  })

  // Only render portals after mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  // dnd-kit sensors and state for icon reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const [dragIcons, setDragIcons] = useState(sortedIcons)
  useEffect(() => {
    if (isDragMode) setDragIcons(sortedIcons)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally snapshot sortedIcons only when entering drag mode
  }, [isDragMode])

  const renderedDragIcons = useMemo(() => dragIcons.filter(icon => {
    if (icon.type === "module" && icon.module.topBarIcon?.component) {
      return !!loadedTopBarComponents[icon.module.id]
    }
    if (icon.type === "module") {
      return !!(icon.module.topBarIcon?.icon && icon.module.topBarIcon?.route)
    }
    return true
  }), [dragIcons, loadedTopBarComponents])
  const dragIconIds = useMemo(() => renderedDragIcons.map(i => i.id), [renderedDragIcons])

  const handleIconDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = dragIconIds.indexOf(active.id as string)
    const newIndex = dragIconIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(dragIcons, oldIndex, newIndex)
    setDragIcons(reordered)

    const newOrder: Record<string, number> = {}
    reordered.forEach((item, index) => {
      newOrder[item.id] = (index + 1) * 10
    })
    setPendingIconOrder(newOrder)
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/sign-in")
  }

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  // Render a built-in icon by its ID
  const renderBuiltinIcon = (iconId: string) => {
    switch (iconId) {
      case "icon-theme":
        return <ThemePickerDropdown isDragMode={isDragMode} />
      case "icon-command":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
                onClick={isDragMode ? undefined : () => setCommandPaletteOpen(true)}
              >
                <Command className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Command Palette</p>
            </TooltipContent>
          </Tooltip>
        )
      case "icon-settings":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
                onClick={isDragMode ? undefined : () => router.push("/settings")}
              >
                <Settings className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
        )
      case "icon-modules":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
                onClick={isDragMode ? undefined : () => router.push("/modules")}
              >
                <Package className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Modules</p>
            </TooltipContent>
          </Tooltip>
        )
      case "icon-logout":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
                onClick={isDragMode ? undefined : handleSignOut}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Sign Out</p>
            </TooltipContent>
          </Tooltip>
        )
      default:
        return null
    }
  }

  // Render a single icon's content (shared between drag and normal mode)
  const renderIconContent = (icon: typeof sortedIcons[0]) => {
    if (icon.type === "module") {
      const module = icon.module
      if (module.topBarIcon!.component) {
        const TopBarComponent = loadedTopBarComponents[module.id]
        if (!TopBarComponent) return null
        return <TopBarComponent isDragMode={isDragMode} />
      }
      if (!module.topBarIcon!.icon || !module.topBarIcon!.route) return null
      const Icon = getLucideIcon(module.topBarIcon!.icon)
      return module.topBarIcon!.tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
              onClick={isDragMode ? undefined : () => router.push(module.topBarIcon!.route!)}
            >
              <Icon className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{module.topBarIcon!.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
          onClick={isDragMode ? undefined : () => router.push(module.topBarIcon!.route!)}
        >
          <Icon className="h-5 w-5" />
        </Button>
      )
    }
    return renderBuiltinIcon(icon.builtinId)
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {/* Draggable icons container */}
        {isDragMode ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIconDragEnd}>
            <SortableContext items={dragIconIds} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center gap-1">
                {renderedDragIcons.map((icon) => (
                  <SortableTopBarIcon key={icon.id} id={icon.id}>
                    {renderIconContent(icon)}
                  </SortableTopBarIcon>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex items-center gap-1">
            {sortedIcons.map((icon) => (
              <div key={icon.id}>
                {renderIconContent(icon)}
              </div>
            ))}
          </div>
        )}

        {/* User Avatar - NOT draggable, always at the end */}
        {mounted ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full overflow-hidden p-0 hover:ring-2 hover:ring-white/20"
              >
                {user?.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="Profile"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full overflow-hidden p-0"
          >
            <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </Button>
        )}
      </div>
    </TooltipProvider>
  )
}

export function TaskAnnouncement() {
  const [lastTask, setLastTask] = useState<{ title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [focusTimer, setFocusTimer] = useState({ isActive: false, timeRemaining: 0, isComplete: false })
  const isMobile = useIsMobile()
  const { session, supabase } = useSupabase()
  const user = session?.user
  const { isDragMode, setDragMode, saveOrder } = useDragDropMode()
  const { modules } = useModules()
  const isTasksEnabled = modules.some(m => m.id === 'tasks')

  useEffect(() => {
    // Load last completed task
    const abortController = new AbortController()
    if (session?.access_token && isTasksEnabled) {
      fetch('/api/modules/tasks/last-completed', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        signal: abortController.signal,
      })
        .then(res => res.ok ? res.json() : null)
        .then(task => { if (task && !abortController.signal.aborted) setLastTask(task) })
        .catch(() => {})
        .finally(() => { if (!abortController.signal.aborted) setLoading(false) })
    } else {
      setLoading(false)
    }

    // Set up focus timer listener
    const listener = (isActive: boolean, timeRemaining: number) => {
      if (!isActive && timeRemaining === 0 && focusTimer.isActive) {
        setFocusTimer({ isActive: false, timeRemaining: 0, isComplete: true })
        setTimeout(() => {
          setFocusTimer({ isActive: false, timeRemaining: 0, isComplete: false })
        }, 5000)
      } else {
        setFocusTimer({ isActive, timeRemaining, isComplete: false })
      }
    }
    globalTimerState.listeners.push(listener)

    return () => {
      abortController.abort()
      globalTimerState.listeners = globalTimerState.listeners.filter(l => l !== listener)
    }
  }, [user?.id, session?.access_token, isTasksEnabled])

  // Run the countdown interval when timer is active
  // This is the main timer that decrements every second
  useEffect(() => {
    if (!focusTimer.isActive || focusTimer.timeRemaining <= 0) {
      return
    }

    const interval = setInterval(() => {
      const newTime = globalTimerState.timeRemaining - 1
      globalTimerState.timeRemaining = newTime

      if (newTime <= 0) {
        globalTimerState.isActive = false
        globalTimerState.timeRemaining = 0
        // Notify all listeners that timer completed
        globalTimerState.listeners.forEach(listener => listener(false, 0))
      } else {
        // Notify all listeners of the new time
        globalTimerState.listeners.forEach(listener => listener(true, newTime))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [focusTimer.isActive])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Get custom top bar settings from environment variables
  const customMessage = process.env.NEXT_PUBLIC_TOP_BAR_MESSAGE
  const customColor = process.env.NEXT_PUBLIC_TOP_BAR_COLOR || '#000000'

  // Debug logging - remove after confirming it works
  console.log('🔍 Top Bar Debug:', {
    customMessage,
    customColor,
    rawMessage: process.env.NEXT_PUBLIC_TOP_BAR_MESSAGE,
    rawColor: process.env.NEXT_PUBLIC_TOP_BAR_COLOR
  })

  // Stop the focus timer
  const stopFocusTimer = () => {
    globalTimerState.isActive = false
    globalTimerState.timeRemaining = 0
    globalTimerState.listeners.forEach(listener => listener(false, 0))
    setFocusTimer({ isActive: false, timeRemaining: 0, isComplete: false })
  }

  // Show focus timer when active
  if (focusTimer.isActive) {
    return (
      <div className="topbar bg-black w-full relative z-50 flex flex-col items-center justify-center" style={{ height: '90vh' }}>
        <h1 className="text-white text-6xl font-bold">
          FOCUS TIME {formatTime(focusTimer.timeRemaining)}
        </h1>
        <button
          onClick={stopFocusTimer}
          className="absolute bottom-12 text-white hover:text-gray-300 transition-colors"
          aria-label="Stop focus timer"
        >
          <X className="w-10 h-10" />
        </button>
      </div>
    )
  }

  // Dismiss the completion message
  const dismissComplete = () => {
    setFocusTimer({ isActive: false, timeRemaining: 0, isComplete: false })
  }

  // Show completion message
  if (focusTimer.isComplete) {
    return (
      <div className="topbar w-full relative z-50 flex flex-col items-center justify-center" style={{ height: '90vh', backgroundColor: '#247524' }}>
        <h1 className="text-white text-6xl font-bold">
          FOCUS TIME COMPLETE
        </h1>
        <button
          onClick={dismissComplete}
          className="absolute bottom-12 text-white hover:text-gray-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-10 h-10" />
        </button>
      </div>
    )
  }

  // Determine background color class or inline style
  const getBgStyle = () => {
    return customColor !== '#000000'
      ? { backgroundColor: customColor }
      : {};
  };

  const getBgClass = () => {
    return customColor === '#000000' ? 'bg-topbar text-topbar-foreground' : '';
  };

  // Handle exit drag mode - optimistic UI, save in background
  const handleExitDragMode = () => {
    saveOrder() // Fire and forget - saves in background
    setDragMode(false) // Exit immediately
  }

  // Show drag mode UI
  if (isDragMode) {
    return (
      <div className={`topbar h-[45px] w-full relative z-50 flex items-center justify-between px-4 overflow-visible ${getBgClass()}`} style={getBgStyle()}>
        <div className="flex-1" />
        <button
          onClick={handleExitDragMode}
          className="px-4 py-1.5 rounded-full bg-topbar hover:brightness-110 border border-white/30 text-white font-normal transition-colors cursor-pointer translate-y-[20px] z-50 font-sans"
          style={getBgStyle()}
        >
          Drag the highlighted items to reorder. Press here to SAVE and EXIT.
        </button>
        <div className="flex-1 flex justify-end">
          <TopBarIcons isDragMode={true} />
        </div>
      </div>
    )
  }

  // If custom message is set, show it instead of task completion
  if (customMessage) {
    return (
      <div
        className={`topbar h-[45px] w-full relative z-50 flex items-center justify-between px-4 ${getBgClass()}`}
        style={getBgStyle()}
      >
        <div className="flex-1" />
        <span className={`text-topbar-foreground font-medium ${dmSans.className}`}>
          {customMessage}
        </span>
        <div className="flex-1 flex justify-end">
          <TopBarIcons />
        </div>
      </div>
    )
  }

  if (loading || !lastTask) {
    return (
      <div
        className={`topbar h-[45px] w-full relative z-50 flex items-center justify-between px-4 ${getBgClass()}`}
        style={getBgStyle()}
      >
        <div className="flex-1" />
        <span className={`text-topbar-foreground font-medium ${dmSans.className}`}>ARI</span>
        <div className="flex-1 flex justify-end">
          <TopBarIcons />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`topbar h-[45px] w-full relative z-50 flex items-center justify-between px-4 ${getBgClass()}`}
      style={getBgStyle()}
    >
      <div className="flex-1" />
      <Announcement className="bg-white border-gray-200 hover:bg-gray-50 shadow-sm">
        <AnnouncementTag className="bg-gray-100 text-gray-700 font-medium">
          Task Complete
        </AnnouncementTag>
        <AnnouncementTitle className="text-gray-900">
          {truncateTaskName(lastTask.title, isMobile ? 20 : 50)}
          <ArrowUpRight className="ml-1 h-3 w-3 text-gray-500" />
        </AnnouncementTitle>
      </Announcement>
      <div className="flex-1 flex justify-end">
        <TopBarIcons />
      </div>
    </div>
  )
}