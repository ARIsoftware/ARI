'use client'

import { useEffect, useState } from 'react'
import type { AquariumProps } from '../types'
import { Fish } from './fish'

// Bubble component for ambient animation
function Bubble({ delay, x }: { delay: number; x: number }) {
  const [y, setY] = useState(100)
  const size = 4 + Math.random() * 8

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animate = () => {
        setY((prev) => {
          if (prev < -10) return 110
          return prev - 0.3 - Math.random() * 0.2
        })
      }
      const interval = setInterval(animate, 50)
      return () => clearInterval(interval)
    }, delay * 1000)

    return () => clearTimeout(timeout)
  }, [delay])

  return (
    <div
      className="absolute rounded-full bg-white/20 backdrop-blur-sm"
      style={{
        width: size,
        height: size,
        left: `${x}%`,
        top: `${y}%`,
        boxShadow: 'inset 0 0 4px rgba(255,255,255,0.4)',
      }}
    />
  )
}

// Seaweed component
function Seaweed({ x, height, delay }: { x: number; height: number; delay: number }) {
  return (
    <div
      className="absolute bottom-0"
      style={{
        left: `${x}%`,
        animation: `sway 3s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <svg width="20" height={height} viewBox={`0 0 20 ${height}`}>
        <path
          d={`M 10 ${height} Q 5 ${height * 0.7} 10 ${height * 0.5} Q 15 ${height * 0.3} 10 0`}
          stroke="hsl(140, 60%, 35%)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M 10 ${height} Q 15 ${height * 0.8} 10 ${height * 0.6} Q 5 ${height * 0.4} 12 ${height * 0.15}`}
          stroke="hsl(140, 50%, 40%)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

// Rock component
function Rock({ x, width, height }: { x: number; width: number; height: number }) {
  return (
    <div
      className="absolute bottom-0"
      style={{ left: `${x}%` }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <ellipse
          cx={width / 2}
          cy={height - 5}
          rx={width / 2}
          ry={height / 3}
          fill="hsl(30, 20%, 30%)"
        />
        <ellipse
          cx={width / 2}
          cy={height - 15}
          rx={width / 2.5}
          ry={height / 4}
          fill="hsl(30, 20%, 35%)"
        />
      </svg>
    </div>
  )
}

export function Aquarium({ fish, onFishClick }: AquariumProps) {
  const [bubbles] = useState(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      delay: Math.random() * 5,
      x: 5 + Math.random() * 90,
    }))
  )

  const [seaweeds] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 5 + i * 12 + Math.random() * 5,
      height: 60 + Math.random() * 80,
      delay: Math.random() * 2,
    }))
  )

  const [rocks] = useState(() =>
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      x: 10 + i * 20 + Math.random() * 10,
      width: 40 + Math.random() * 30,
      height: 25 + Math.random() * 20,
    }))
  )

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl border-4 border-slate-700/50">
      {/* Water gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg,
            hsl(200, 80%, 25%) 0%,
            hsl(200, 70%, 20%) 30%,
            hsl(200, 60%, 15%) 60%,
            hsl(200, 50%, 10%) 100%)`,
        }}
      />

      {/* Light rays from top */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{
              left: `${15 + i * 18}%`,
              width: '30px',
              background: `linear-gradient(180deg,
                rgba(255,255,255,0.4) 0%,
                rgba(255,255,255,0.1) 50%,
                transparent 100%)`,
              transform: `rotate(${-5 + i * 2}deg)`,
              transformOrigin: 'top center',
            }}
          />
        ))}
      </div>

      {/* Sandy bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16"
        style={{
          background: `linear-gradient(180deg,
            transparent 0%,
            hsl(40, 40%, 25%) 20%,
            hsl(40, 35%, 30%) 100%)`,
        }}
      />

      {/* Rocks */}
      {rocks.map((rock) => (
        <Rock key={rock.id} {...rock} />
      ))}

      {/* Seaweed */}
      {seaweeds.map((seaweed) => (
        <Seaweed key={seaweed.id} {...seaweed} />
      ))}

      {/* Bubbles */}
      {bubbles.map((bubble) => (
        <Bubble key={bubble.id} {...bubble} />
      ))}

      {/* Fish */}
      {fish.map((f, i) => (
        <Fish
          key={f.id}
          fish={f}
          index={i}
          onClick={() => onFishClick?.(f)}
        />
      ))}

      {/* Glass reflection overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(135deg,
            rgba(255,255,255,0.1) 0%,
            transparent 50%,
            rgba(0,0,0,0.1) 100%)`,
        }}
      />

      {/* Keyframes for seaweed sway animation */}
      <style jsx>{`
        @keyframes sway {
          0%, 100% {
            transform: rotate(-3deg);
          }
          50% {
            transform: rotate(3deg);
          }
        }
      `}</style>
    </div>
  )
}

export default Aquarium
