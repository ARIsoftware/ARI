"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { DM_Sans } from "next/font/google"
import { Announcement, AnnouncementTag, AnnouncementTitle } from "@/components/ui/kibo-ui/announcement"
import { getLastCompletedTask, truncateTaskName } from "@/lib/get-last-completed-task"
import { getAuthenticatedSupabase } from "@/lib/supabase"
import { useIsMobile } from "@/components/ui/use-mobile"
import { useSupabase } from "@/components/providers"

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

export function TaskAnnouncement() {
  const [lastTask, setLastTask] = useState<{ title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [focusTimer, setFocusTimer] = useState({ isActive: false, timeRemaining: 0, isComplete: false })
  const isMobile = useIsMobile()
  const { session, supabase } = useSupabase()
  const user = session?.user

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

    // Set up real-time subscription for task completions
    const setupSubscription = async () => {
      const client = await getAuthenticatedSupabase()
      const channel = client
        .channel("task-completions")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tasks",
            filter: "completed=eq.true",
          },
          (payload) => {
            if (payload.new && payload.new.completed === true) {
              setLastTask({ title: payload.new.title })
            }
          }
        )
        .subscribe()

      return () => {
        client.removeChannel(channel)
      }
    }

    const cleanup = setupSubscription()
    
    return () => {
      cleanup.then(fn => fn && fn())
      // Clean up focus timer listener
      globalTimerState.listeners = globalTimerState.listeners.filter(l => l !== listener)
    }
  }, [user?.id, session?.access_token])

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

  // Show focus timer when active
  if (focusTimer.isActive) {
    return (
      <div className="topbar bg-black w-full relative z-50 flex items-center justify-center" style={{ height: '90vh' }}>
        <h1 className="text-white text-6xl font-bold">
          FOCUS TIME {formatTime(focusTimer.timeRemaining)}
        </h1>
      </div>
    )
  }

  // Show completion message
  if (focusTimer.isComplete) {
    return (
      <div className="topbar bg-black w-full relative z-50 flex items-center justify-center" style={{ height: '90vh' }}>
        <h1 className="text-white text-6xl font-bold">
          FOCUS TIME COMPLETE 💪
        </h1>
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
        className={`topbar h-[45px] w-full relative z-50 flex items-center justify-center ${getBgClass()}`}
        style={getBgStyle()}
      >
        <span className={`text-white font-medium ${dmSans.className}`}>
          {customMessage}
        </span>
      </div>
    )
  }

  if (loading || !lastTask) {
    return (
      <div
        className={`topbar h-[45px] w-full relative z-50 flex items-center justify-center ${getBgClass()}`}
        style={getBgStyle()}
      >
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
      </div>
    )
  }

  return (
    <div
      className={`topbar h-[45px] w-full relative z-50 flex items-center justify-center ${getBgClass()}`}
      style={getBgStyle()}
    >
      <Announcement className="bg-white border-gray-200 hover:bg-gray-50 shadow-sm">
        <AnnouncementTag className="bg-gray-100 text-gray-700 font-medium">
          Task Complete
        </AnnouncementTag>
        <AnnouncementTitle className="text-gray-900">
          {truncateTaskName(lastTask.title, isMobile ? 20 : 50)}
          <ArrowUpRight className="ml-1 h-3 w-3 text-gray-500" />
        </AnnouncementTitle>
      </Announcement>
    </div>
  )
}