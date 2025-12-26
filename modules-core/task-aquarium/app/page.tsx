'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSupabase } from '@/components/providers'
import type { Task } from '@/lib/supabase'
import { calculatePriorityScore, getTaskColor } from '@/lib/priority-utils'
import type { FishData, FishType } from '../types'
import { Aquarium } from '../components/aquarium'

const FISH_TYPES: FishType[] = ['classic', 'tropical', 'puffer', 'eel', 'goldfish', 'betta', 'clownfish', 'jellyfish']

const FISH_TYPE_NAMES: Record<FishType, string> = {
  classic: 'Classic Fish',
  tropical: 'Angel Fish',
  puffer: 'Puffer Fish',
  eel: 'Eel',
  goldfish: 'Goldfish',
  betta: 'Betta Fish',
  clownfish: 'Clownfish',
  jellyfish: 'Jellyfish',
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function transformTaskToFish(task: Task): FishData {
  // Get priority axes with defaults
  const axes = {
    impact: task.impact || 3,
    severity: task.severity || 3,
    timeliness: task.timeliness || 3,
    effort: task.effort || 3,
    strategic_fit: task.strategic_fit || 3,
  }

  // Calculate priority score (0-~2.2, lower = higher priority)
  const rawScore = task.priority_score || calculatePriorityScore(axes)
  // Normalize to 0-1 range (clamp at 1)
  const priorityScore = Math.min(rawScore / 2.2, 1)

  // Size: higher priority (lower score) = larger fish
  // Base size: 35px minimum, up to 85px for highest priority
  const size = 35 + (1 - priorityScore) * 50

  // Speed: higher priority = faster (0.5-1.5 multiplier)
  const speed = 0.5 + (1 - priorityScore) * 1

  // Use hash to add some randomness to vertical position
  const idHash = hashCode(task.id)
  const randomOffset = (idHash % 20) - 10 // -10 to +10 variation

  // Vertical position: higher priority = higher in tank (5-85% from top)
  // Lower priorityScore = higher priority = lower Y value (higher in tank)
  // Add some random variation so fish don't stack at same level
  const baseYPosition = 5 + priorityScore * 80
  const yPosition = Math.max(5, Math.min(85, baseYPosition + randomOffset))

  // Color based on due date urgency
  const color = getTaskColor(task)

  // Determine fish type based on task ID for consistency
  const fishTypeIndex = hashCode(task.id) % FISH_TYPES.length
  const fishType = FISH_TYPES[fishTypeIndex]

  return {
    id: task.id,
    title: task.title,
    size,
    speed,
    yPosition,
    color,
    task,
    priorityScore,
    fishType,
  }
}

// Mini fish preview SVGs for the popup
function MiniClassicFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 60 40" className="w-full h-full">
      <ellipse cx="28" cy="20" rx="20" ry="14" fill={color} opacity="0.9" />
      <path d="M 48 20 Q 58 10 55 20 Q 58 30 48 20" fill={color} opacity="0.8" />
      <circle cx="16" cy="17" r="4" fill="white" />
      <circle cx="15" cy="17" r="2" fill="#1a1a2e" />
    </svg>
  )
}

function MiniTropicalFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 50 60" className="w-full h-full">
      <path d="M 25 5 Q 40 15 40 30 Q 40 45 25 55 Q 10 45 10 30 Q 10 15 25 5" fill={color} opacity="0.9" />
      <path d="M 40 30 L 50 25 L 50 35 Z" fill={color} opacity="0.8" />
      <circle cx="18" cy="22" r="4" fill="white" />
      <circle cx="17" cy="22" r="2" fill="#1a1a2e" />
    </svg>
  )
}

function MiniPufferFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 55 55" className="w-full h-full">
      <circle cx="27" cy="27" r="22" fill={color} opacity="0.9" />
      <circle cx="18" cy="22" r="5" fill="white" />
      <circle cx="17" cy="22" r="2.5" fill="#1a1a2e" />
      <circle cx="36" cy="22" r="5" fill="white" />
      <circle cx="35" cy="22" r="2.5" fill="#1a1a2e" />
    </svg>
  )
}

function MiniEelFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 30" className="w-full h-full">
      <path d="M 5 15 Q 15 5 25 15 Q 35 25 45 15 Q 55 5 65 15 Q 72 15 75 12" stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.9" />
      <circle cx="8" cy="12" r="3" fill="white" />
      <circle cx="7" cy="12" r="1.5" fill="#1a1a2e" />
    </svg>
  )
}

function MiniGoldfishFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 70 45" className="w-full h-full">
      <ellipse cx="25" cy="22" rx="18" ry="15" fill={color} opacity="0.9" />
      <path d="M 43 22 Q 60 5 65 15 Q 55 22 65 30 Q 60 40 43 22" fill={color} opacity="0.7" />
      <circle cx="14" cy="18" r="5" fill="white" />
      <circle cx="13" cy="18" r="2.5" fill="#1a1a2e" />
    </svg>
  )
}

function MiniBettaFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 70 55" className="w-full h-full">
      <ellipse cx="22" cy="28" rx="16" ry="12" fill={color} opacity="0.9" />
      <path d="M 38 28 Q 50 10 65 5 Q 55 28 65 50 Q 50 45 38 28" fill={color} opacity="0.6" />
      <circle cx="12" cy="25" r="4" fill="white" />
      <circle cx="11" cy="25" r="2" fill="#1a1a2e" />
    </svg>
  )
}

function MiniClownfishFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 60 40" className="w-full h-full">
      <ellipse cx="28" cy="20" rx="20" ry="14" fill={color} opacity="0.9" />
      <path d="M 15 6 L 15 34" stroke="white" strokeWidth="4" opacity="0.9" />
      <path d="M 28 8 L 28 32" stroke="white" strokeWidth="4" opacity="0.9" />
      <circle cx="10" cy="17" r="4" fill="white" />
      <circle cx="9" cy="17" r="2" fill="#1a1a2e" />
    </svg>
  )
}

function MiniJellyfishFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 50 70" className="w-full h-full">
      <path d="M 5 30 Q 5 5 25 5 Q 45 5 45 30 Q 35 35 25 32 Q 15 35 5 30" fill={color} opacity="0.6" />
      <path d="M 10 32 Q 8 45 12 55 Q 10 60 8 65" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M 25 34 Q 25 50 25 60 Q 25 65 25 70" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M 40 32 Q 42 45 38 55 Q 40 60 42 65" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
    </svg>
  )
}

function MiniFishPreview({ fishType, color }: { fishType: FishType; color: string }) {
  switch (fishType) {
    case 'tropical': return <MiniTropicalFish color={color} />
    case 'puffer': return <MiniPufferFish color={color} />
    case 'eel': return <MiniEelFish color={color} />
    case 'goldfish': return <MiniGoldfishFish color={color} />
    case 'betta': return <MiniBettaFish color={color} />
    case 'clownfish': return <MiniClownfishFish color={color} />
    case 'jellyfish': return <MiniJellyfishFish color={color} />
    default: return <MiniClassicFish color={color} />
  }
}

export default function TaskAquariumPage() {
  const { session, isLoading: authLoading } = useSupabase()
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFish, setSelectedFish] = useState<FishData | null>(null)

  const fetchTasks = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const response = await fetch('/api/tasks', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tasks')
      }

      const allTasks: Task[] = await response.json()

      // Filter to only incomplete tasks
      const incompleteTasks = allTasks.filter((task) => !task.completed)
      setTasks(incompleteTasks)
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

  // Transform tasks to fish
  const fish = tasks.map(transformTaskToFish)

  // Sort fish by priority score to show priority order in legend
  const sortedFish = [...fish].sort((a, b) => a.priorityScore - b.priorityScore)

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
        <p className="text-muted-foreground">Filling up the aquarium...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-4rem)] w-full flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={fetchTasks}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full p-4 bg-background">
      <div className="h-full flex flex-col lg:flex-row gap-4">
        {/* Aquarium */}
        <div className="flex-1 min-h-[400px]">
          <Aquarium fish={fish} onFishClick={setSelectedFish} />
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          {/* Stats card */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-lg font-semibold text-foreground mb-2">Aquarium Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold text-primary">{fish.length}</p>
                <p className="text-xs text-muted-foreground">Fish swimming</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500">
                  {fish.filter((f) => f.priorityScore < 0.3).length}
                </p>
                <p className="text-xs text-muted-foreground">High priority</p>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">How to read</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p><span className="inline-block w-4 h-4 rounded-full bg-red-500 mr-2 align-middle" />Red = Overdue</p>
              <p><span className="inline-block w-4 h-4 rounded-full bg-orange-500 mr-2 align-middle" />Orange = Due soon</p>
              <p><span className="inline-block w-4 h-4 rounded-full bg-yellow-500 mr-2 align-middle" />Yellow = Due this week</p>
              <p><span className="inline-block w-4 h-4 rounded-full bg-green-500 mr-2 align-middle" />Green = Not urgent</p>
              <p><span className="inline-block w-4 h-4 rounded-full bg-blue-500 mr-2 align-middle" />Blue = No due date</p>
              <hr className="border-border my-2" />
              <p>Larger + faster fish = higher priority</p>
              <p>Higher swimming = higher priority</p>
            </div>
          </div>

          {/* Task list by priority */}
          <div className="bg-card rounded-xl border border-border p-4 flex-1 overflow-auto">
            <h3 className="text-sm font-semibold text-foreground mb-3">Tasks by Priority</h3>
            {sortedFish.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks to display</p>
            ) : (
              <div className="space-y-2">
                {sortedFish.slice(0, 10).map((f, i) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 rounded p-1 -ml-1"
                    onClick={() => setSelectedFish(f)}
                  >
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="truncate text-foreground">{f.title}</span>
                  </div>
                ))}
                {sortedFish.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    +{sortedFish.length - 10} more fish...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected fish popup */}
      {selectedFish && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedFish(null)}
        >
          <div
            className="bg-card rounded-xl border border-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              {/* Fish preview */}
              <div
                className="w-16 h-16 rounded-lg flex items-center justify-center p-2"
                style={{ backgroundColor: selectedFish.color + '20' }}
              >
                <MiniFishPreview fishType={selectedFish.fishType} color={selectedFish.color} />
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {selectedFish.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {FISH_TYPE_NAMES[selectedFish.fishType]} · Priority: {selectedFish.priorityScore < 0.3 ? 'High' : selectedFish.priorityScore < 0.5 ? 'Medium-High' : selectedFish.priorityScore < 0.7 ? 'Medium' : 'Low'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
              <div>
                <p className="text-muted-foreground">Impact</p>
                <p className="font-semibold">{selectedFish.task.impact || 3}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Severity</p>
                <p className="font-semibold">{selectedFish.task.severity || 3}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Timely</p>
                <p className="font-semibold">{selectedFish.task.timeliness || 3}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Effort</p>
                <p className="font-semibold">{selectedFish.task.effort || 3}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Strategic</p>
                <p className="font-semibold">{selectedFish.task.strategic_fit || 3}</p>
              </div>
            </div>

            {selectedFish.task.due_date && (
              <p className="mt-4 text-sm text-muted-foreground">
                Due: {new Date(selectedFish.task.due_date).toLocaleDateString()}
              </p>
            )}

            <button
              onClick={() => setSelectedFish(null)}
              className="mt-4 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
