"use client"

import { useState, useEffect } from "react"
import { CustomContributionGraph } from "./custom-contribution-graph"
import { useSupabase } from "@/components/providers"

type BoxColor = 'light-grey' | 'dark-grey' | 'black' | 'green' | 'red'

interface BoxData {
  index: number
  color: BoxColor
}

interface WinterArcGoal {
  id: string
  title: string
  completed: boolean
}

interface HDContributionGraphProps {
  goals: WinterArcGoal[]
}

export function HDContributionGraph({ goals }: HDContributionGraphProps) {
  const { session } = useSupabase()
  const [goalColors, setGoalColors] = useState<Record<string, BoxData[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      loadColors()
    }
  }, [session])

  const loadColors = async () => {
    try {
      const response = await fetch('/api/contribution-graph', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()

        // Group colors by goal_id
        const colorsByGoal: Record<string, BoxData[]> = {}
        data.forEach((item: { goal_id: string; box_index: number; color: BoxColor }) => {
          if (!colorsByGoal[item.goal_id]) {
            colorsByGoal[item.goal_id] = []
          }
          colorsByGoal[item.goal_id].push({
            index: item.box_index,
            color: item.color
          })
        })

        setGoalColors(colorsByGoal)
      }
    } catch (error) {
      console.error('Error loading contribution graph:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleColorChange = async (goalId: string, index: number, color: BoxColor) => {
    try {
      await fetch('/api/contribution-graph', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          goal_id: goalId,
          box_index: index,
          color
        })
      })
    } catch (error) {
      console.error('Error saving contribution graph color:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-[10px] text-gray-400 dark:text-gray-500 blueprint:text-white light:text-gray-400">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-6 gap-2">
      {goals.map((goal, index) => (
        <CustomContributionGraph
          key={goal.id}
          goalId={goal.id}
          initialColors={goalColors[goal.id] || []}
          onColorChange={handleColorChange}
          opacity={goal.completed ? 0.3 : 1}
          shimmerIndex={index}
        />
      ))}
    </div>
  )
}
