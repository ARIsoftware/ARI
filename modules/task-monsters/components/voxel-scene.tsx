"use client"

import { useRef, useMemo } from "react"
import VoxelMonster from "./voxel-monster"
import type { MonsterType } from "./voxel-monster"
import VoxelGround from "./voxel-ground"
import VoxelTree from "./voxel-tree"
import VoxelHouse from "./voxel-house"
import type { Task } from "@/lib/supabase"

interface TaskWithMonster extends Task {
  monster_type: string
  monster_colors: { primary: string; secondary: string }
}

interface VoxelSceneProps {
  tasks: TaskWithMonster[]
  onMonsterClick?: (task: TaskWithMonster) => void
}

export default function VoxelScene({ tasks, onMonsterClick }: VoxelSceneProps) {
  const groupRef = useRef(null)

  // Calculate ground size based on number of tasks
  const groundSize = useMemo(() => {
    const baseSize = 16
    const sizePerTask = 2
    return Math.max(baseSize, Math.sqrt(tasks.length) * sizePerTask + 10)
  }, [tasks.length])

  // Generate stable positions for each task based on their ID
  const taskPositions = useMemo(() => {
    const positions: Record<string, [number, number, number]> = {}
    const halfSize = (groundSize - 4) / 2

    tasks.forEach((task, index) => {
      // Use task ID to generate a somewhat stable position
      // This ensures the same task gets roughly the same position
      const hash = task.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const angle = (hash % 360) * (Math.PI / 180)
      const radius = (hash % 100) / 100 * halfSize * 0.8

      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius

      positions[task.id] = [x, 0, z]
    })

    return positions
  }, [tasks, groundSize])

  // Generate tree positions based on ground size
  const treePositions = useMemo(() => {
    const halfSize = groundSize / 2 - 1
    return [
      { position: [-halfSize + 2, 0, -halfSize + 2] as [number, number, number], scale: 1.2 },
      { position: [halfSize - 2, 0, -halfSize + 3] as [number, number, number], scale: 0.9 },
      { position: [-halfSize + 3, 0, halfSize - 2] as [number, number, number], scale: 1 },
      { position: [halfSize - 2, 0, halfSize - 2] as [number, number, number], scale: 1.1 },
      { position: [-halfSize / 2, 0, halfSize - 3] as [number, number, number], scale: 0.8 },
    ]
  }, [groundSize])

  return (
    <group ref={groupRef}>
      {/* Lighting - bright to show true colors */}
      <ambientLight intensity={1.2} />
      <hemisphereLight args={["#ffffff", "#68be76", 0.6]} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />

      {/* Ground */}
      <VoxelGround size={groundSize} />

      {/* Trees */}
      {treePositions.map((tree, index) => (
        <VoxelTree key={`tree-${index}`} position={tree.position} scale={tree.scale} />
      ))}

      {/* Houses */}
      <VoxelHouse position={[-5, 0, 0]} rotation={[0, Math.PI / 4, 0]} />
      <VoxelHouse position={[5, 0, -2]} rotation={[0, -Math.PI / 3, 0]} />

      {/* Task Monsters */}
      {tasks.map((task) => (
        <VoxelMonster
          key={task.id}
          monsterType={task.monster_type as MonsterType}
          primaryColor={task.monster_colors.primary}
          secondaryColor={task.monster_colors.secondary}
          initialPosition={taskPositions[task.id] || [0, 0, 0]}
          onClick={() => onMonsterClick?.(task)}
        />
      ))}
    </group>
  )
}
