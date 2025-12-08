"use client"

interface VoxelHouseProps {
  position: [number, number, number]
  rotation?: [number, number, number]
}

export default function VoxelHouse({ position, rotation = [0, 0, 0] }: VoxelHouseProps) {
  return (
    <group position={position} rotation={rotation}>
      {/* Base/Foundation */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.2, 1.5]} />
        <meshStandardMaterial color="#757575" />
      </mesh>

      {/* Walls */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[1.8, 1, 1.3]} />
        <meshStandardMaterial color="#FFECB3" />
      </mesh>

      {/* Roof */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[2.1, 0.3, 1.6]} />
        <meshStandardMaterial color="#D84315" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[1.6, 0.2, 1.2]} />
        <meshStandardMaterial color="#BF360C" />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <boxGeometry args={[1, 0.15, 0.8]} />
        <meshStandardMaterial color="#8D6E63" />
      </mesh>

      {/* Door */}
      <mesh position={[0, 0.5, 0.66]} castShadow>
        <boxGeometry args={[0.4, 0.7, 0.05]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>

      {/* Windows */}
      <mesh position={[-0.5, 0.75, 0.66]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.05]} />
        <meshStandardMaterial color="#64B5F6" />
      </mesh>
      <mesh position={[0.5, 0.75, 0.66]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.05]} />
        <meshStandardMaterial color="#64B5F6" />
      </mesh>

      {/* Chimney */}
      <mesh position={[0.6, 1.9, -0.3]} castShadow>
        <boxGeometry args={[0.3, 0.4, 0.3]} />
        <meshStandardMaterial color="#795548" />
      </mesh>
    </group>
  )
}
