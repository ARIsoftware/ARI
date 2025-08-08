"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { DM_Sans } from "next/font/google"
import { Announcement, AnnouncementTag, AnnouncementTitle } from "@/components/ui/kibo-ui/announcement"
import { getLastCompletedTask, truncateTaskName } from "@/lib/get-last-completed-task"
import { supabase } from "@/lib/supabase"
import { useIsMobile } from "@/components/ui/use-mobile"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export function TaskAnnouncement() {
  const [lastTask, setLastTask] = useState<{ title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => {
    // Load initial task
    loadLastTask()

    // Set up real-time subscription for task completions
    const channel = supabase
      .channel("task-completions")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ari-database",
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
      supabase.removeChannel(channel)
    }
  }, [])

  const loadLastTask = async () => {
    const task = await getLastCompletedTask()
    setLastTask(task)
    setLoading(false)
  }

  if (loading || !lastTask) {
    return (
      <div className="topbar h-[38px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
      </div>
    )
  }

  return (
    <div className="topbar h-[38px] bg-black w-full relative z-50 flex items-center justify-center">
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