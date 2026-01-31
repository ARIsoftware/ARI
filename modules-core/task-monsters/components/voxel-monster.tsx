"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

export type MonsterType = "slime" | "cyclops" | "ghost" | "goblin" | "spider" | "mushroom" | "dragon" | "blob"

interface VoxelMonsterProps {
  monsterType: MonsterType
  primaryColor: string
  secondaryColor: string
  initialPosition: [number, number, number]
  onClick?: () => void
}

export default function VoxelMonster({
  monsterType,
  primaryColor,
  secondaryColor,
  initialPosition,
  onClick,
}: VoxelMonsterProps) {
  const groupRef = useRef<THREE.Group>(null)
  const limbRefs = useRef<THREE.Mesh[]>([])

  const [target, setTarget] = useState<THREE.Vector3>(new THREE.Vector3(initialPosition[0], 0, initialPosition[2]))
  const [isWalking, setIsWalking] = useState(false)
  const walkSpeedRef = useRef(0.015 + Math.random() * 0.02)
  const walkCycle = useRef(0)
  const bounceOffset = useRef(Math.random() * Math.PI * 2)

  useEffect(() => {
    const setNewTarget = () => {
      const newX = (Math.random() - 0.5) * 12
      const newZ = (Math.random() - 0.5) * 12
      setTarget(new THREE.Vector3(newX, 0, newZ))
      setIsWalking(true)
    }

    const initialDelay = Math.random() * 2000
    const timeoutId = setTimeout(() => setNewTarget(), initialDelay)

    const intervalId = setInterval(
      () => {
        if (Math.random() > 0.3) {
          setNewTarget()
        } else {
          setIsWalking(false)
          setTimeout(() => setNewTarget(), 1000 + Math.random() * 2000)
        }
      },
      3000 + Math.random() * 4000,
    )

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return

    const currentPos = groupRef.current.position
    const direction = new THREE.Vector3().subVectors(target, currentPos).normalize()
    const distance = currentPos.distanceTo(target)
    const time = state.clock.elapsedTime

    if (distance > 0.1 && isWalking) {
      currentPos.x += direction.x * walkSpeedRef.current
      currentPos.z += direction.z * walkSpeedRef.current

      const angle = Math.atan2(direction.x, direction.z)
      groupRef.current.rotation.y = angle

      walkCycle.current += 0.12

      // Different animations per monster type
      if (monsterType === "slime" || monsterType === "blob") {
        groupRef.current.position.y = Math.abs(Math.sin(walkCycle.current)) * 0.3
        groupRef.current.scale.y = 1 - Math.abs(Math.sin(walkCycle.current)) * 0.2
        groupRef.current.scale.x = 1 + Math.abs(Math.sin(walkCycle.current)) * 0.1
        groupRef.current.scale.z = 1 + Math.abs(Math.sin(walkCycle.current)) * 0.1
      } else if (monsterType === "ghost") {
        groupRef.current.position.y = 0.5 + Math.sin(time * 2 + bounceOffset.current) * 0.2
      } else if (monsterType === "spider") {
        groupRef.current.position.y = Math.abs(Math.sin(walkCycle.current * 2)) * 0.05
        limbRefs.current.forEach((limb, i) => {
          if (limb) limb.rotation.z = Math.sin(walkCycle.current + i * 0.5) * 0.3
        })
      } else {
        groupRef.current.position.y = Math.abs(Math.sin(walkCycle.current * 2)) * 0.08
        limbRefs.current.forEach((limb, i) => {
          if (limb) limb.rotation.x = Math.sin(walkCycle.current + i * Math.PI) * 0.5
        })
      }
    } else {
      // Idle animations
      if (monsterType === "slime" || monsterType === "blob") {
        const squish = Math.sin(time * 3 + bounceOffset.current) * 0.05
        groupRef.current.scale.y = THREE.MathUtils.lerp(groupRef.current.scale.y, 1 + squish, 0.1)
        groupRef.current.scale.x = THREE.MathUtils.lerp(groupRef.current.scale.x, 1 - squish * 0.5, 0.1)
        groupRef.current.scale.z = THREE.MathUtils.lerp(groupRef.current.scale.z, 1 - squish * 0.5, 0.1)
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0, 0.1)
      } else if (monsterType === "ghost") {
        groupRef.current.position.y = 0.5 + Math.sin(time * 1.5 + bounceOffset.current) * 0.15
      } else {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0, 0.1)
        limbRefs.current.forEach((limb) => {
          if (limb) limb.rotation.x = THREE.MathUtils.lerp(limb.rotation.x, 0, 0.1)
        })
      }
    }
  })

  // Render different monster types
  const renderMonster = () => {
    switch (monsterType) {
      case "slime":
        return <SlimeMonster primaryColor={primaryColor} secondaryColor={secondaryColor} />
      case "cyclops":
        return <CyclopsMonster primaryColor={primaryColor} secondaryColor={secondaryColor} limbRefs={limbRefs} />
      case "ghost":
        return <GhostMonster primaryColor={primaryColor} secondaryColor={secondaryColor} />
      case "goblin":
        return <GoblinMonster primaryColor={primaryColor} secondaryColor={secondaryColor} limbRefs={limbRefs} />
      case "spider":
        return <SpiderMonster primaryColor={primaryColor} secondaryColor={secondaryColor} limbRefs={limbRefs} />
      case "mushroom":
        return <MushroomMonster primaryColor={primaryColor} secondaryColor={secondaryColor} limbRefs={limbRefs} />
      case "dragon":
        return <DragonMonster primaryColor={primaryColor} secondaryColor={secondaryColor} limbRefs={limbRefs} />
      case "blob":
        return <BlobMonster primaryColor={primaryColor} secondaryColor={secondaryColor} />
      default:
        return <SlimeMonster primaryColor={primaryColor} secondaryColor={secondaryColor} />
    }
  }

  return (
    <group
      ref={groupRef}
      position={[initialPosition[0], 0, initialPosition[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = "pointer"
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        document.body.style.cursor = "auto"
      }}
    >
      {renderMonster()}
    </group>
  )
}

// Slime Monster - bouncy blob
function SlimeMonster({ primaryColor, secondaryColor }: { primaryColor: string; secondaryColor: string }) {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial color={primaryColor} transparent opacity={0.85} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 0.4, 0.3]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.12, 0.4, 0.3]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.12, 0.4, 0.35]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.12, 0.4, 0.35]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Mouth */}
      <mesh position={[0, 0.25, 0.35]}>
        <boxGeometry args={[0.15, 0.05, 0.02]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
    </group>
  )
}

// Cyclops Monster - one big eye
function CyclopsMonster({
  primaryColor,
  secondaryColor,
  limbRefs,
}: { primaryColor: string; secondaryColor: string; limbRefs: React.MutableRefObject<THREE.Mesh[]> }) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.4]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.55, 0.5, 0.45]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Single Big Eye */}
      <mesh position={[0, 1.1, 0.23]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#ffffee" />
      </mesh>
      <mesh position={[0, 1.1, 0.35]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#ff3333" />
      </mesh>
      <mesh position={[0, 1.1, 0.42]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Horns */}
      <mesh position={[-0.2, 1.35, 0]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.08, 0.25, 4]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      <mesh position={[0.2, 1.35, 0]} rotation={[0, 0, 0.3]}>
        <coneGeometry args={[0.08, 0.25, 4]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      {/* Legs */}
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[0] = el
        }}
        position={[-0.15, 0.1, 0]}
        castShadow
      >
        <boxGeometry args={[0.18, 0.3, 0.18]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[1] = el
        }}
        position={[0.15, 0.1, 0]}
        castShadow
      >
        <boxGeometry args={[0.18, 0.3, 0.18]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
    </group>
  )
}

// Ghost Monster - floaty spooky
function GhostMonster({ primaryColor, secondaryColor }: { primaryColor: string; secondaryColor: string }) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
        <meshStandardMaterial color={primaryColor} transparent opacity={0.7} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 0.6, 0.25]}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.12, 0.6, 0.25]}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Mouth */}
      <mesh position={[0, 0.4, 0.28]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      {/* Tail wisp */}
      <mesh position={[0, 0.1, 0]}>
        <coneGeometry args={[0.25, 0.4, 6]} />
        <meshStandardMaterial color={primaryColor} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

// Goblin Monster - small and mischievous
function GoblinMonster({
  primaryColor,
  secondaryColor,
  limbRefs,
}: { primaryColor: string; secondaryColor: string; limbRefs: React.MutableRefObject<THREE.Mesh[]> }) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.35, 0.4, 0.25]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.4, 0.35, 0.35]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Big Ears */}
      <mesh position={[-0.28, 0.9, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.2, 0.25, 0.05]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh position={[0.28, 0.9, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.2, 0.25, 0.05]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.1, 0.85, 0.18]}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#ffff00" />
      </mesh>
      <mesh position={[0.1, 0.85, 0.18]}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#ffff00" />
      </mesh>
      {/* Nose */}
      <mesh position={[0, 0.75, 0.2]}>
        <boxGeometry args={[0.12, 0.1, 0.1]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      {/* Arms */}
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[0] = el
        }}
        position={[-0.25, 0.35, 0]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.35, 0.12]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[1] = el
        }}
        position={[0.25, 0.35, 0]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.35, 0.12]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Legs */}
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[2] = el
        }}
        position={[-0.1, 0.1, 0]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.25, 0.12]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[3] = el
        }}
        position={[0.1, 0.1, 0]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.25, 0.12]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
    </group>
  )
}

// Spider Monster - 8 legs
function SpiderMonster({
  primaryColor,
  secondaryColor,
  limbRefs,
}: { primaryColor: string; secondaryColor: string; limbRefs: React.MutableRefObject<THREE.Mesh[]> }) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.25, -0.15]} castShadow>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.25, 0.15]} castShadow>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Eyes (8 of them!) */}
      {[
        [-0.08, 0.32, 0.3],
        [0.08, 0.32, 0.3],
        [-0.12, 0.28, 0.28],
        [0.12, 0.28, 0.28],
        [-0.05, 0.22, 0.32],
        [0.05, 0.22, 0.32],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.03, 6, 6]} />
          <meshStandardMaterial color={secondaryColor} emissive={secondaryColor} emissiveIntensity={0.5} />
        </mesh>
      ))}
      {/* Legs */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2
        const side = i < 4 ? -1 : 1
        return (
          <mesh
            key={i}
            ref={(el) => {
              if (el) limbRefs.current[i] = el
            }}
            position={[Math.cos(angle) * 0.25, 0.15, Math.sin(angle) * 0.15 - 0.1]}
            rotation={[0, angle, side * 0.8]}
            castShadow
          >
            <boxGeometry args={[0.35, 0.06, 0.06]} />
            <meshStandardMaterial color={secondaryColor} />
          </mesh>
        )
      })}
    </group>
  )
}

// Mushroom Monster - cute fungus
function MushroomMonster({
  primaryColor,
  secondaryColor,
  limbRefs,
}: { primaryColor: string; secondaryColor: string; limbRefs: React.MutableRefObject<THREE.Mesh[]> }) {
  return (
    <group>
      {/* Stem */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.5, 8]} />
        <meshStandardMaterial color="#f5f5dc" />
      </mesh>
      {/* Cap */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.4, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Spots */}
      {[
        [0, 0.85, 0.2],
        [-0.2, 0.75, 0.25],
        [0.25, 0.72, 0.1],
        [0, 0.75, -0.25],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.08, 6, 6]} />
          <meshStandardMaterial color={secondaryColor} />
        </mesh>
      ))}
      {/* Eyes */}
      <mesh position={[-0.08, 0.35, 0.15]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.08, 0.35, 0.15]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Feet */}
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[0] = el
        }}
        position={[-0.1, 0.05, 0.05]}
        castShadow
      >
        <boxGeometry args={[0.1, 0.1, 0.15]} />
        <meshStandardMaterial color="#f5f5dc" />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[1] = el
        }}
        position={[0.1, 0.05, 0.05]}
        castShadow
      >
        <boxGeometry args={[0.1, 0.1, 0.15]} />
        <meshStandardMaterial color="#f5f5dc" />
      </mesh>
    </group>
  )
}

// Dragon Monster - friendly winged creature (larger)
function DragonMonster({
  primaryColor,
  secondaryColor,
  limbRefs,
}: { primaryColor: string; secondaryColor: string; limbRefs: React.MutableRefObject<THREE.Mesh[]> }) {
  return (
    <group scale={[1.4, 1.4, 1.4]}>
      {/* Body */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.45, 0.5, 0.65]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.9, 0.28]} castShadow>
        <boxGeometry args={[0.38, 0.38, 0.42]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.82, 0.58]} castShadow>
        <boxGeometry args={[0.25, 0.2, 0.25]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Nostrils */}
      <mesh position={[-0.06, 0.85, 0.72]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.06, 0.85, 0.72]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 1.0, 0.42]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.12, 1.0, 0.42]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.12, 1.0, 0.47]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.12, 1.0, 0.47]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Horns */}
      <mesh position={[-0.15, 1.18, 0.2]} rotation={[0.3, 0, -0.3]}>
        <coneGeometry args={[0.05, 0.22, 4]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      <mesh position={[0.15, 1.18, 0.2]} rotation={[0.3, 0, 0.3]}>
        <coneGeometry args={[0.05, 0.22, 4]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      {/* Wings */}
      <mesh position={[-0.38, 0.65, -0.08]} rotation={[0.2, -0.3, 0.6]}>
        <boxGeometry args={[0.5, 0.45, 0.03]} />
        <meshStandardMaterial color={secondaryColor} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0.38, 0.65, -0.08]} rotation={[0.2, 0.3, -0.6]}>
        <boxGeometry args={[0.5, 0.45, 0.03]} />
        <meshStandardMaterial color={secondaryColor} transparent opacity={0.9} />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0.4, -0.45]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.14, 0.14, 0.4]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh position={[0, 0.35, -0.72]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.28]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Tail fin */}
      <mesh position={[0, 0.38, -0.9]} rotation={[1.2, 0, 0]}>
        <coneGeometry args={[0.1, 0.16, 3]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      {/* Legs */}
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[0] = el
        }}
        position={[-0.15, 0.12, 0.15]}
        castShadow
      >
        <boxGeometry args={[0.15, 0.3, 0.15]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[1] = el
        }}
        position={[0.15, 0.12, 0.15]}
        castShadow
      >
        <boxGeometry args={[0.15, 0.3, 0.15]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Back legs */}
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[2] = el
        }}
        position={[-0.15, 0.12, -0.2]}
        castShadow
      >
        <boxGeometry args={[0.15, 0.3, 0.15]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh
        ref={(el) => {
          if (el) limbRefs.current[3] = el
        }}
        position={[0.15, 0.12, -0.2]}
        castShadow
      >
        <boxGeometry args={[0.15, 0.3, 0.15]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
    </group>
  )
}

// Blob Monster - amorphous cute creature
function BlobMonster({ primaryColor, secondaryColor }: { primaryColor: string; secondaryColor: string }) {
  return (
    <group>
      {/* Main body */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <sphereGeometry args={[0.35, 8, 8]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Bumps */}
      <mesh position={[-0.2, 0.45, 0.15]}>
        <sphereGeometry args={[0.12, 6, 6]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh position={[0.15, 0.5, -0.1]}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      {/* Eyes on stalks */}
      <mesh position={[-0.1, 0.55, 0.2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.15, 6]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh position={[0.1, 0.6, 0.18]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>
      <mesh position={[-0.1, 0.65, 0.2]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.1, 0.72, 0.18]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.1, 0.65, 0.24]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
      <mesh position={[0.1, 0.72, 0.22]}>
        <sphereGeometry args={[0.03, 6, 6]} />
        <meshStandardMaterial color={secondaryColor} />
      </mesh>
    </group>
  )
}
