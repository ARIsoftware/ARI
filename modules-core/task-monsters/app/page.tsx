"use client"

import dynamic from "next/dynamic"

// Dynamic import to avoid SSR issues with Three.js
const TaskMonstersWorld = dynamic(
  () => import("../components/task-monsters-world"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading monster village...</p>
      </div>
    )
  }
)

export default function TaskMonstersPage() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full bg-background">
      <TaskMonstersWorld />
    </div>
  )
}
