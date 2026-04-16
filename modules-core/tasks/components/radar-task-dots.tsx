"use client"

import type { Task } from "@/modules/tasks/types"
import { transformTaskForRadar } from "../lib/priority-utils"

interface RadarTaskDotsProps {
  tasks: Task[]
  hoveredTask: string | null
  onTaskHover: (taskId: string | null) => void
  onTaskClick: (task: Task) => void
  limit?: number
}

export function RadarTaskDots({
  tasks,
  hoveredTask,
  onTaskHover,
  onTaskClick,
  limit = 5
}: RadarTaskDotsProps) {
  // Transform tasks (parent already provides sorted + sliced data)
  const transformedTasks = tasks
    .map(transformTaskForRadar)
    .slice(0, limit)

  // Convert polar coordinates to cartesian for positioning
  const getPosition = (task: ReturnType<typeof transformTaskForRadar>, taskIndex: number) => {
    // Map score to distance from center (0-1 range, where 0 is center)
    // Higher score = closer to center = higher priority
    const maxRadius = 140 // Maximum radius in pixels
    const radius = Math.max(0, 1 - task.score / 10) * maxRadius

    // Distribute tasks around different angles to avoid overlap
    const angleStep = 360 / Math.min(transformedTasks.length, 5)
    const angle = (taskIndex * angleStep - 90) * Math.PI / 180

    const x = radius * Math.cos(angle)
    const y = radius * Math.sin(angle)

    return { x, y }
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        className="w-full h-full pointer-events-auto"
        viewBox="0 0 400 400"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <g transform="translate(200, 200)">
          {/* Priority zones */}
          <circle cx={0} cy={0} r={35} fill="rgba(239, 68, 68, 0.1)" strokeWidth={1} stroke="rgba(239, 68, 68, 0.3)" strokeDasharray="2 2" />
          <circle cx={0} cy={0} r={70} fill="rgba(251, 146, 60, 0.05)" strokeWidth={1} stroke="rgba(251, 146, 60, 0.2)" strokeDasharray="2 2" />
          <circle cx={0} cy={0} r={105} fill="rgba(250, 204, 21, 0.05)" strokeWidth={1} stroke="rgba(250, 204, 21, 0.2)" strokeDasharray="2 2" />

          {/* Task dots */}
          {transformedTasks.map((task, index) => {
            const fullTask = tasks.find(t => t.id === task.id)
            if (!fullTask) return null

            const { x, y } = getPosition(task, index)
            const isHovered = hoveredTask === task.id

            return (
              <g key={task.id}>
                {/* Connection line to center for hovered task */}
                {isHovered && (
                  <line
                    x1={0}
                    y1={0}
                    x2={x}
                    y2={y}
                    stroke={task.color}
                    strokeWidth={1}
                    strokeOpacity={0.3}
                    strokeDasharray="3 3"
                  />
                )}

                {/* Task dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={task.size}
                  fill={task.color}
                  fillOpacity={isHovered ? 1 : 0.8}
                  stroke="white"
                  strokeWidth={2}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    filter: isHovered ? 'drop-shadow(0 0 8px rgba(0,0,0,0.3))' : 'none'
                  }}
                  onMouseEnter={() => onTaskHover(task.id)}
                  onMouseLeave={() => onTaskHover(null)}
                  onClick={() => onTaskClick(fullTask)}
                />

                {/* Priority number */}
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill="white"
                  style={{ pointerEvents: 'none' }}
                >
                  {index + 1}
                </text>

                {/* Task title on hover */}
                {isHovered && (
                  <foreignObject
                    x={x + task.size + 5}
                    y={y - 10}
                    width="150"
                    height="40"
                    style={{ pointerEvents: 'none' }}
                  >
                    <div className="bg-white/95 backdrop-blur shadow-lg rounded px-2 py-1 text-xs">
                      <div className="font-medium truncate">{task.title}</div>
                      <div className="text-gray-500">Score: {typeof task.score === 'number' ? task.score.toFixed(1) : 'N/A'}</div>
                    </div>
                  </foreignObject>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
