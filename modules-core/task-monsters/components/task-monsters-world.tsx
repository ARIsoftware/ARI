"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Suspense, useState, useEffect, useCallback } from "react"
import VoxelScene from "./voxel-scene"
import TaskMonsterPopup from "./task-monster-popup"
import { useSupabase } from "@/components/providers"
import type { Task } from "@/lib/supabase"
import { assignMonsterToTask } from "../lib/monster-utils"

interface TaskWithMonster extends Task {
  monster_type: string
  monster_colors: { primary: string; secondary: string }
}

export default function TaskMonstersWorld() {
  const { session, isLoading: authLoading } = useSupabase()
  const [tasks, setTasks] = useState<TaskWithMonster[]>([])
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch tasks and assign monsters
  const fetchTasks = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const response = await fetch('/api/tasks', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tasks')
      }

      const allTasks: Task[] = await response.json()

      // Filter to only incomplete tasks
      const incompleteTasks = allTasks.filter(task => !task.completed)

      // Assign monsters to tasks that don't have them (client-side only, no saving)
      const tasksWithMonsters: TaskWithMonster[] = incompleteTasks.map((task) => {
        if (task.monster_type && task.monster_colors) {
          return task as TaskWithMonster
        }

        // Assign a monster based on task ID for consistency
        const { type, colors } = assignMonsterToTask(task)

        return {
          ...task,
          monster_type: type,
          monster_colors: colors,
        } as TaskWithMonster
      })

      setTasks(tasksWithMonsters)
      setError(null)
    } catch (err) {
      console.error('Error fetching tasks:', err)
      setError('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }, [session])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleMonsterClick = (task: TaskWithMonster) => {
    const index = tasks.findIndex(t => t.id === task.id)
    setSelectedTaskIndex(index >= 0 ? index : null)
  }

  const handleNavigate = (index: number) => {
    setSelectedTaskIndex(index)
  }

  const selectedTask = selectedTaskIndex !== null ? tasks[selectedTaskIndex] : null

  const monsterCount = tasks.length

  if (authLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Please sign in to view your tasks</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your monster village...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {/* Population counter */}
      <div className="absolute top-4 right-4 z-10 bg-card/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-border">
        <p className="text-sm font-medium text-foreground">
          Monsters: <span className="text-primary">{monsterCount}</span>
        </p>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-4 z-10 bg-card/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-border">
        <p className="text-xs text-muted-foreground">Drag to rotate | Scroll to zoom | Right-click to pan</p>
      </div>

      {/* Empty state */}
      {monsterCount === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-card/90 backdrop-blur-sm rounded-lg px-6 py-4 border border-border text-center">
            <p className="text-lg font-medium text-foreground mb-1">No monsters in the village!</p>
            <p className="text-sm text-muted-foreground">Add some tasks to see them appear as monsters</p>
          </div>
        </div>
      )}

      <Canvas shadows camera={{ position: [12, 10, 12], fov: 50 }} className="!h-full !w-full">
        <Suspense fallback={null}>
          {/* Sky color */}
          <color attach="background" args={["#d7e9ee"]} />
          <VoxelScene
            tasks={tasks}
            onMonsterClick={handleMonsterClick}
          />
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={8}
            maxDistance={30}
            maxPolarAngle={Math.PI / 2.2}
          />
        </Suspense>
      </Canvas>

      <TaskMonsterPopup
        task={selectedTask}
        tasks={tasks}
        currentIndex={selectedTaskIndex ?? 0}
        onClose={() => setSelectedTaskIndex(null)}
        onNavigate={handleNavigate}
      />
    </div>
  )
}
