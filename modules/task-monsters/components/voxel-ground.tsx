"use client"

import { useMemo } from "react"

interface VoxelGroundProps {
  size?: number // Allow dynamic sizing based on task count
}

// Seeded random number generator for consistent results
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export default function VoxelGround({ size = 16 }: VoxelGroundProps) {
  // Generate stable random positions using useMemo
  const grassPatches = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      x: (seededRandom(i * 100 + 1) - 0.5) * (size - 2),
      z: (seededRandom(i * 100 + 2) - 0.5) * (size - 2),
    }))
  }, [size])

  const flowers = useMemo(() => {
    const colors = ["#F44336", "#FFEB3B", "#E91E63", "#FF9800"]
    return Array.from({ length: 8 }).map((_, i) => ({
      x: (seededRandom(i * 200 + 1) - 0.5) * (size - 4),
      z: (seededRandom(i * 200 + 2) - 0.5) * (size - 4),
      color: colors[Math.floor(seededRandom(i * 200 + 3) * colors.length)],
    }))
  }, [size])

  return (
    <group>
      {/* Main grass platform */}
      <mesh receiveShadow position={[0, -0.25, 0]}>
        <boxGeometry args={[size, 0.5, size]} />
        <meshBasicMaterial color="#68be76" />
      </mesh>

      {/* Dirt layer */}
      <mesh position={[0, -0.75, 0]}>
        <boxGeometry args={[size, 0.5, size]} />
        <meshStandardMaterial color="#8D6E63" />
      </mesh>

      {/* Stone layer */}
      <mesh position={[0, -1.25, 0]}>
        <boxGeometry args={[size, 0.5, size]} />
        <meshStandardMaterial color="#757575" />
      </mesh>

      {/* Path blocks */}
      {[
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
        [2, 2],
        [1, 2],
        [0, 2],
        [-1, 2],
        [-2, 2],
        [-2, 1],
        [-2, 0],
        [-2, -1],
        [-1, -1],
        [0, -1],
        [1, -1],
        [2, -1],
        [3, -1],
        [3, 0],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.01, z]} receiveShadow>
          <boxGeometry args={[0.9, 0.05, 0.9]} />
          <meshStandardMaterial color="#D7CCC8" />
        </mesh>
      ))}

      {/* Decorative grass patches */}
      {grassPatches.map((patch, i) => (
        <mesh key={`grass-${i}`} position={[patch.x, 0.02, patch.z]}>
          <boxGeometry args={[0.1, 0.15, 0.1]} />
          <meshStandardMaterial color="#7ed68a" />
        </mesh>
      ))}

      {/* Flowers */}
      {flowers.map((flower, i) => (
        <group key={`flower-${i}`} position={[flower.x, 0.1, flower.z]}>
          <mesh>
            <boxGeometry args={[0.05, 0.2, 0.05]} />
            <meshStandardMaterial color="#4a9c5d" />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.15, 0.1, 0.15]} />
            <meshStandardMaterial color={flower.color} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
