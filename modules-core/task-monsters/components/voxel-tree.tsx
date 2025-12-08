"use client"

interface VoxelTreeProps {
  position: [number, number, number]
  scale?: number
}

export default function VoxelTree({ position, scale = 1 }: VoxelTreeProps) {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 1, 0.4]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>

      {/* Foliage layers */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
        <meshStandardMaterial color="#4a9c5d" />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.9]} />
        <meshStandardMaterial color="#5ab06a" />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color="#68be76" />
      </mesh>
    </group>
  )
}
