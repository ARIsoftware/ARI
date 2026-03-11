'use client'

import { useEffect, useState, useRef } from 'react'
import type { FishProps } from '../types'

// Hash function to get consistent fish type from task ID
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

type FishType = 'classic' | 'tropical' | 'puffer' | 'eel' | 'goldfish' | 'betta' | 'clownfish' | 'jellyfish'

const FISH_TYPES: FishType[] = ['classic', 'tropical', 'puffer', 'eel', 'goldfish', 'betta', 'clownfish', 'jellyfish']

// Classic fish - simple oval body
function ClassicFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 60 40" className="w-full h-full drop-shadow-lg">
      <ellipse cx="28" cy="20" rx="20" ry="14" fill={color} opacity="0.9" />
      <path d="M 48 20 Q 58 10 55 20 Q 58 30 48 20" fill={color} opacity="0.8" />
      <path d="M 25 6 Q 30 2 35 6 L 30 12 Z" fill={color} opacity="0.7" />
      <circle cx="16" cy="17" r="4" fill="white" />
      <circle cx="15" cy="17" r="2" fill="#1a1a2e" />
      <ellipse cx="22" cy="15" rx="8" ry="4" fill="white" opacity="0.2" />
      <ellipse cx="28" cy="28" rx="6" ry="3" fill={color} opacity="0.6" transform="rotate(-20 28 28)" />
    </svg>
  )
}

// Tropical angel fish - tall and thin
function TropicalFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 50 60" className="w-full h-full drop-shadow-lg">
      <path d="M 25 5 Q 40 15 40 30 Q 40 45 25 55 Q 10 45 10 30 Q 10 15 25 5" fill={color} opacity="0.9" />
      <path d="M 25 5 Q 30 0 35 8 L 25 15 Z" fill={color} opacity="0.7" />
      <path d="M 25 55 Q 30 60 35 52 L 25 45 Z" fill={color} opacity="0.7" />
      <path d="M 40 30 L 50 25 L 50 35 Z" fill={color} opacity="0.8" />
      {/* Stripes */}
      <path d="M 15 15 Q 25 20 35 15" stroke="white" strokeWidth="2" fill="none" opacity="0.4" />
      <path d="M 13 25 Q 25 30 37 25" stroke="white" strokeWidth="2" fill="none" opacity="0.4" />
      <path d="M 15 35 Q 25 40 35 35" stroke="white" strokeWidth="2" fill="none" opacity="0.4" />
      <circle cx="18" cy="22" r="4" fill="white" />
      <circle cx="17" cy="22" r="2" fill="#1a1a2e" />
    </svg>
  )
}

// Puffer fish - round and spiky
function PufferFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 55 55" className="w-full h-full drop-shadow-lg">
      <circle cx="27" cy="27" r="22" fill={color} opacity="0.9" />
      {/* Spikes */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <circle
          key={angle}
          cx={27 + Math.cos(angle * Math.PI / 180) * 24}
          cy={27 + Math.sin(angle * Math.PI / 180) * 24}
          r="3"
          fill={color}
          opacity="0.7"
        />
      ))}
      <path d="M 49 27 L 55 22 L 55 32 Z" fill={color} opacity="0.8" />
      <ellipse cx="27" cy="22" rx="12" ry="6" fill="white" opacity="0.15" />
      <circle cx="18" cy="22" r="6" fill="white" />
      <circle cx="17" cy="22" r="3" fill="#1a1a2e" />
      <circle cx="36" cy="22" r="6" fill="white" />
      <circle cx="35" cy="22" r="3" fill="#1a1a2e" />
      <ellipse cx="27" cy="35" rx="6" ry="4" fill={color} opacity="0.5" />
    </svg>
  )
}

// Eel - long and wavy
function EelFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 80 30" className="w-full h-full drop-shadow-lg">
      <path
        d="M 5 15 Q 15 5 25 15 Q 35 25 45 15 Q 55 5 65 15 Q 72 15 75 12"
        stroke={color}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M 5 15 Q 15 5 25 15 Q 35 25 45 15 Q 55 5 65 15 Q 72 15 75 12"
        stroke="white"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.15"
        strokeDasharray="0 20 10 20"
      />
      <circle cx="8" cy="12" r="3" fill="white" />
      <circle cx="7" cy="12" r="1.5" fill="#1a1a2e" />
      <path d="M 75 12 L 80 8 L 80 16 Z" fill={color} opacity="0.8" />
    </svg>
  )
}

// Goldfish - fancy tail
function GoldfishFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 70 45" className="w-full h-full drop-shadow-lg">
      <ellipse cx="25" cy="22" rx="18" ry="15" fill={color} opacity="0.9" />
      {/* Fancy double tail */}
      <path d="M 43 22 Q 60 5 65 15 Q 55 22 65 30 Q 60 40 43 22" fill={color} opacity="0.7" />
      <path d="M 43 22 Q 55 10 58 18 Q 50 22 58 26 Q 55 34 43 22" fill={color} opacity="0.5" />
      {/* Dorsal fin */}
      <path d="M 18 7 Q 25 0 32 7 Q 28 12 22 12 Z" fill={color} opacity="0.7" />
      {/* Ventral fin */}
      <path d="M 20 37 Q 25 45 30 37" fill={color} opacity="0.6" />
      <ellipse cx="22" cy="18" rx="10" ry="5" fill="white" opacity="0.2" />
      <circle cx="14" cy="18" r="5" fill="white" />
      <circle cx="13" cy="18" r="2.5" fill="#1a1a2e" />
      {/* Scales pattern */}
      <ellipse cx="25" cy="22" rx="8" ry="6" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3" />
      <ellipse cx="32" cy="22" rx="6" ry="5" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3" />
    </svg>
  )
}

// Betta fish - flowing fins
function BettaFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 70 55" className="w-full h-full drop-shadow-lg">
      <ellipse cx="22" cy="28" rx="16" ry="12" fill={color} opacity="0.9" />
      {/* Dramatic flowing tail */}
      <path d="M 38 28 Q 50 10 65 5 Q 55 28 65 50 Q 50 45 38 28" fill={color} opacity="0.6" />
      <path d="M 38 28 Q 48 15 58 12 Q 52 28 58 42 Q 48 40 38 28" fill={color} opacity="0.4" />
      {/* Large dorsal fin */}
      <path d="M 15 16 Q 10 2 25 5 Q 35 8 32 16 Q 25 14 15 16" fill={color} opacity="0.6" />
      {/* Ventral fins */}
      <path d="M 18 40 Q 12 52 20 50 Q 25 45 22 40" fill={color} opacity="0.5" />
      <path d="M 25 40 Q 22 50 28 48 Q 32 44 28 40" fill={color} opacity="0.5" />
      <ellipse cx="18" cy="25" rx="8" ry="4" fill="white" opacity="0.2" />
      <circle cx="12" cy="25" r="4" fill="white" />
      <circle cx="11" cy="25" r="2" fill="#1a1a2e" />
    </svg>
  )
}

// Clownfish - striped
function ClownfishFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 60 40" className="w-full h-full drop-shadow-lg">
      <ellipse cx="28" cy="20" rx="20" ry="14" fill={color} opacity="0.9" />
      <path d="M 48 20 Q 55 12 53 20 Q 55 28 48 20" fill={color} opacity="0.8" />
      {/* White stripes */}
      <path d="M 15 6 L 15 34" stroke="white" strokeWidth="4" opacity="0.9" />
      <path d="M 28 8 L 28 32" stroke="white" strokeWidth="4" opacity="0.9" />
      <path d="M 40 10 L 40 30" stroke="white" strokeWidth="3" opacity="0.9" />
      {/* Black outlines on stripes */}
      <path d="M 13 6 L 13 34" stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
      <path d="M 17 6 L 17 34" stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
      <path d="M 26 8 L 26 32" stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
      <path d="M 30 8 L 30 32" stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
      <path d="M 10 6 Q 15 2 20 6" fill={color} opacity="0.7" />
      <path d="M 35 6 Q 40 2 45 8" fill={color} opacity="0.7" />
      <circle cx="10" cy="17" r="4" fill="white" />
      <circle cx="9" cy="17" r="2" fill="#1a1a2e" />
    </svg>
  )
}

// Jellyfish - translucent and flowy
function JellyfishFish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 50 70" className="w-full h-full drop-shadow-lg">
      {/* Bell/dome */}
      <path d="M 5 30 Q 5 5 25 5 Q 45 5 45 30 Q 35 35 25 32 Q 15 35 5 30" fill={color} opacity="0.6" />
      <ellipse cx="25" cy="15" rx="12" ry="6" fill="white" opacity="0.3" />
      {/* Tentacles */}
      <path d="M 10 32 Q 8 45 12 55 Q 10 60 8 65" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M 18 33 Q 20 48 16 58 Q 18 63 15 68" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M 25 34 Q 25 50 25 60 Q 25 65 25 70" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M 32 33 Q 30 48 34 58 Q 32 63 35 68" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M 40 32 Q 42 45 38 55 Q 40 60 42 65" stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      {/* Inner glow */}
      <ellipse cx="25" cy="22" rx="10" ry="8" fill="white" opacity="0.2" />
    </svg>
  )
}

export function Fish({ fish, index, onClick }: FishProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [direction, setDirection] = useState(1)
  const [wiggle, setWiggle] = useState(0)
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Determine fish type based on task ID for consistency
  const fishTypeIndex = hashCode(fish.id) % FISH_TYPES.length
  const fishType = FISH_TYPES[fishTypeIndex]

  // Use hash to get consistent random values for this fish
  const idHash = hashCode(fish.id)
  const idHash2 = hashCode(fish.id + 'salt')

  // Starting X position spread across tank (15% to 85% to leave room for swimming)
  const startingXPercent = 15 + (idHash % 70)

  // Calculate fish properties based on priority
  // Higher priority (lower score) = LARGER fish
  // Base size: 35px minimum, up to 85px for highest priority
  const baseSize = 35 + (1 - fish.priorityScore) * 50
  const speed = 0.3 + (1 - fish.priorityScore) * 0.7

  // Adjust size based on fish type
  const sizeMultiplier = fishType === 'eel' ? 1.6 :
                          fishType === 'jellyfish' ? 1.1 :
                          fishType === 'tropical' ? 0.9 :
                          fishType === 'betta' ? 1.2 : 1

  const fishWidth = baseSize * sizeMultiplier * 1.5
  const fishHeight = baseSize * sizeMultiplier

  // Unique swimming pattern per fish
  const swimOffset = (idHash2 % 100) * 0.1

  // Calculate safe amplitude to keep fish within tank
  // Fish at edges get smaller amplitude, fish in center get larger
  const distanceFromEdge = Math.min(startingXPercent - 5, 95 - startingXPercent)
  const maxHorizontalPercent = Math.min(distanceFromEdge * 0.8, 25) // Max 25% movement from center

  // Vertical amplitude (in pixels, constrained)
  const verticalAmplitude = fishType === 'jellyfish' ? 30 + (idHash % 20) : 25 + (idHash % 20)

  // Different swim speeds to prevent fish from moving in sync
  const swimSpeedX = 0.25 + (idHash % 20) * 0.01
  const swimSpeedY = 0.35 + (idHash2 % 20) * 0.01

  useEffect(() => {
    const animate = () => {
      timeRef.current += 0.016 * speed

      const t = timeRef.current + swimOffset

      // Different movement patterns based on fish type
      // X is now in percentage units to keep fish in bounds
      let xPercent, y
      if (fishType === 'jellyfish') {
        // Jellyfish drift more vertically with gentle horizontal sway
        xPercent = Math.sin(t * swimSpeedX) * maxHorizontalPercent
        y = Math.sin(t * swimSpeedY) * verticalAmplitude
      } else if (fishType === 'eel') {
        // Eels have more sinuous movement
        xPercent = Math.sin(t * swimSpeedX) * maxHorizontalPercent
        y = Math.sin(t * swimSpeedY * 2) * verticalAmplitude * 0.5
      } else {
        // Standard fish movement - figure-8 pattern
        xPercent = Math.sin(t * swimSpeedX) * maxHorizontalPercent
        y = Math.sin(t * swimSpeedY) * verticalAmplitude + Math.cos(t * swimSpeedX * 0.7) * (verticalAmplitude * 0.3)
      }

      // Determine direction based on horizontal velocity
      const velocity = Math.cos(t * swimSpeedX)
      const newDirection = fishType === 'jellyfish' ? 1 : (velocity > 0 ? 1 : -1)

      // Wiggle animation for swimming effect
      setWiggle(Math.sin(t * 8) * 3)

      setPosition({ x: xPercent, y })
      setDirection(newDirection)

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [speed, swimOffset, verticalAmplitude, maxHorizontalPercent, fishType, swimSpeedX, swimSpeedY])

  // Render the appropriate fish type
  const renderFish = () => {
    switch (fishType) {
      case 'tropical':
        return <TropicalFish color={fish.color} />
      case 'puffer':
        return <PufferFish color={fish.color} />
      case 'eel':
        return <EelFish color={fish.color} />
      case 'goldfish':
        return <GoldfishFish color={fish.color} />
      case 'betta':
        return <BettaFish color={fish.color} />
      case 'clownfish':
        return <ClownfishFish color={fish.color} />
      case 'jellyfish':
        return <JellyfishFish color={fish.color} />
      default:
        return <ClassicFish color={fish.color} />
    }
  }

  // Calculate final X position (startingX + movement, clamped to 2%-98%)
  const finalXPercent = Math.max(2, Math.min(98, startingXPercent + position.x))

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className="absolute cursor-pointer transition-transform hover:scale-110 group"
      style={{
        left: `${finalXPercent}%`,
        top: `calc(${fish.yPosition}% + ${position.y}px)`,
        transform: `translateX(-50%) scaleX(${direction}) rotate(${fishType !== 'jellyfish' ? wiggle * direction : 0}deg)`,
        zIndex: Math.round(fish.yPosition),
        width: fishWidth,
        height: fishHeight,
      }}
      title={fish.title}
    >
      {renderFish()}

      {/* Tooltip on hover */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background/90 backdrop-blur-sm px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-border z-50">
        {fish.title}
      </div>
    </div>
  )
}

export default Fish
