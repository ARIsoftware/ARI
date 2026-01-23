"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  Command,
  Settings,
  Package,
  LogOut,
  User,
  Play,
  Pause,
  Clock,
  X
} from "lucide-react"
import { FocusTimerTopBarIcon } from "@/components/focus-timer-top-bar-icon"
import { NotepadTopBarIcon } from "@/components/notepad-top-bar-icon"
import { ThemePickerDropdown } from "@/components/theme-picker-dropdown"
import { useModules } from "@/lib/modules/module-hooks"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DM_Sans } from "next/font/google"
import { Announcement, AnnouncementTag, AnnouncementTitle } from "@/components/ui/kibo-ui/announcement"
import { getLastCompletedTask, truncateTaskName } from "@/modules/tasks/lib/get-last-completed-task"
import { useIsMobile } from "@/components/ui/use-mobile"
import { useSupabase } from "@/components/providers"
import { authClient } from "@/lib/auth-client"
import { useCommandPalette } from "@/components/command-palette"
import { useMusicPlayer } from "@/components/youtube-music-player"
import { useDragDropMode } from "@/components/drag-drop-mode-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Import focus timer state
let globalTimerState = {
  isActive: false,
  timeRemaining: 0,
  listeners: [] as Array<(isActive: boolean, timeRemaining: number) => void>
}

// Make sure we're using the same global state as the focus timer
if (typeof window !== 'undefined' && (window as any).globalTimerState) {
  globalTimerState = (window as any).globalTimerState
} else if (typeof window !== 'undefined') {
  (window as any).globalTimerState = globalTimerState
}

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
  { id: "icon-notepad", label: "Notepad" },
  { id: "icon-focus", label: "Focus Timer" },
  { id: "icon-music", label: "Music" },
  { id: "icon-logout", label: "Logout" },
] as const

// Icons component for the top bar
function TopBarIcons({ isDragMode = false }: { isDragMode?: boolean }) {
  const router = useRouter()
  const { session, supabase } = useSupabase()
  const { setOpen: setCommandPaletteOpen } = useCommandPalette()
  const { isPlaying, isReady, togglePlayPause } = useMusicPlayer()
  const [mounted, setMounted] = useState(false)
  const user = session?.user
  const { modules } = useModules()
  const { iconOrder, setPendingIconOrder } = useDragDropMode()
  const containerRef = useRef<HTMLDivElement>(null)
  const swapyRef = useRef<any>(null)

  // Filter modules that have topBarIcon configured
  const moduleIcons = modules.filter(m => m.topBarIcon)

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

  // Initialize Swapy when drag mode is active
  useEffect(() => {
    if (isDragMode && containerRef.current && mounted) {
      // Dynamic import of Swapy to avoid SSR issues
      import("swapy").then(({ createSwapy }) => {
        // Small delay to ensure DOM is ready
        const timer = setTimeout(() => {
          if (containerRef.current) {
            swapyRef.current = createSwapy(containerRef.current, {
              animation: "dynamic",
              swapMode: "hover",
            })

            swapyRef.current.onSwapEnd((event: any) => {
              // Convert swap result to icon order mapping
              const newOrder: Record<string, number> = {}
              event.slotItemMap.asArray.forEach((item: any, index: number) => {
                if (item.item) {
                  newOrder[item.item] = (index + 1) * 10 // Priority 10, 20, 30, etc.
                }
              })
              setPendingIconOrder(newOrder)
            })
          }
        }, 100)

        return () => {
          clearTimeout(timer)
          swapyRef.current?.destroy()
          swapyRef.current = null
        }
      })
    }

    return () => {
      swapyRef.current?.destroy()
      swapyRef.current = null
    }
  }, [isDragMode, mounted, setPendingIconOrder])

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
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
            onClick={isDragMode ? undefined : () => setCommandPaletteOpen(true)}
          >
            <Command className="h-5 w-5" />
          </Button>
        )
      case "icon-settings":
        return (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
            onClick={isDragMode ? undefined : () => router.push("/settings")}
          >
            <Settings className="h-5 w-5" />
          </Button>
        )
      case "icon-modules":
        return (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
            onClick={isDragMode ? undefined : () => router.push("/modules")}
          >
            <Package className="h-5 w-5" />
          </Button>
        )
      case "icon-notepad":
        return <NotepadTopBarIcon isDragMode={isDragMode} />
      case "icon-focus":
        return <FocusTimerTopBarIcon isDragMode={isDragMode} />
      case "icon-music":
        return (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
            onClick={isDragMode ? undefined : togglePlayPause}
            disabled={!isReady && !isDragMode}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>
        )
      case "icon-logout":
        return (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
            onClick={isDragMode ? undefined : handleSignOut}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {/* Draggable icons container */}
        <div ref={containerRef} className="flex items-center gap-1">
          {sortedIcons.map((icon) => (
            <div key={icon.id} data-swapy-slot={icon.id}>
              <div data-swapy-item={icon.id}>
                {icon.type === "module" ? (
                  // Module icon
                  (() => {
                    const module = icon.module
                    const Icon = getLucideIcon(module.topBarIcon!.icon)
                    return module.topBarIcon!.tooltip ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
                            onClick={isDragMode ? undefined : () => router.push(module.topBarIcon!.route)}
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
                        className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
                        onClick={isDragMode ? undefined : () => router.push(module.topBarIcon!.route)}
                      >
                        <Icon className="h-5 w-5" />
                      </Button>
                    )
                  })()
                ) : (
                  // Built-in icon
                  renderBuiltinIcon(icon.builtinId)
                )}
              </div>
            </div>
          ))}
        </div>

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

  useEffect(() => {
    // Load initial task
    loadLastTask()

    // Set up focus timer listener
    const listener = (isActive: boolean, timeRemaining: number) => {
      if (!isActive && timeRemaining === 0 && focusTimer.isActive) {
        // Timer just completed
        setFocusTimer({ isActive: false, timeRemaining: 0, isComplete: true })
        // Auto-dismiss completion message after 5 seconds
        setTimeout(() => {
          setFocusTimer({ isActive: false, timeRemaining: 0, isComplete: false })
        }, 5000)
      } else {
        setFocusTimer({ isActive, timeRemaining, isComplete: false })
      }
    }
    globalTimerState.listeners.push(listener)

    // Note: Realtime subscription removed - using TanStack Query refetch pattern instead
    // The task announcement will update when the user navigates or on window focus

    return () => {
      // Clean up focus timer listener
      globalTimerState.listeners = globalTimerState.listeners.filter(l => l !== listener)
    }
  }, [user?.id, session?.access_token])

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

  const loadLastTask = async () => {
    if (!session?.access_token) {
      setLoading(false)
      return
    }
    
    const tokenFn = async () => session?.access_token || null
    const task = await getLastCompletedTask(tokenFn)
    setLastTask(task)
    setLoading(false)
  }

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

  // Handle exit drag mode - optimistic UI, save in background
  const handleExitDragMode = () => {
    saveOrder() // Fire and forget - saves in background
    setDragMode(false) // Exit immediately
  }

  // Show drag mode UI
  if (isDragMode) {
    return (
      <div className="topbar h-[45px] w-full relative z-50 flex items-center justify-between px-4 bg-blue-900">
        <div className="flex-1" />
        <button
          onClick={handleExitDragMode}
          className={`px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white font-normal transition-colors cursor-pointer ${dmSans.className}`}
        >
          Drag items to reorder. Press here to save and exit.
        </button>
        <div className="flex-1 flex justify-end">
          <TopBarIcons isDragMode={true} />
        </div>
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
    return customColor === '#000000' ? 'bg-black' : '';
  };

  // If custom message is set, show it instead of task completion
  if (customMessage) {
    return (
      <div
        className={`topbar h-[45px] w-full relative z-50 flex items-center justify-between px-4 ${getBgClass()}`}
        style={getBgStyle()}
      >
        <div className="flex-1" />
        <span className={`text-white font-medium ${dmSans.className}`}>
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
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
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