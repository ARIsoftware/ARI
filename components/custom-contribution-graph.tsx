"use client"

import { useState, useEffect } from "react"

type BoxColor = 'light-grey' | 'dark-grey' | 'black' | 'green' | 'red'

interface BoxData {
  index: number
  color: BoxColor
}

interface CustomContributionGraphProps {
  goalId: string
  onColorChange?: (goalId: string, index: number, color: BoxColor) => void
  initialColors?: BoxData[]
  opacity?: number
  shimmerIndex?: number
}

const COLOR_CYCLE: BoxColor[] = ['light-grey', 'dark-grey', 'black', 'green', 'red']

const getColorClasses = (color: BoxColor): string => {
  switch (color) {
    case 'light-grey':
      return 'bg-gray-200 dark:bg-gray-600 blue:bg-white/30 clean:bg-gray-200'
    case 'dark-grey':
      return 'bg-gray-400 dark:bg-gray-500 blue:bg-white/50 clean:bg-gray-400'
    case 'black':
      return 'bg-black dark:bg-gray-900 blue:bg-white/80 clean:bg-black'
    case 'green':
      return 'bg-green-500 dark:bg-green-600 blue:bg-green-400 clean:bg-green-500'
    case 'red':
      return 'bg-red-500 dark:bg-red-600 blue:bg-red-400 clean:bg-red-500'
  }
}

export function CustomContributionGraph({
  goalId,
  onColorChange,
  initialColors = [],
  opacity = 1,
  shimmerIndex = 0
}: CustomContributionGraphProps) {
  const [boxes, setBoxes] = useState<BoxData[]>(() => {
    // Initialize 28 boxes (4 rows x 7 columns)
    const initialBoxes: BoxData[] = []
    for (let i = 0; i < 28; i++) {
      const existingBox = initialColors.find(b => b.index === i)
      initialBoxes.push({
        index: i,
        color: existingBox?.color || 'light-grey'
      })
    }
    return initialBoxes
  })

  const handleBoxClick = (index: number) => {
    setBoxes(prevBoxes => {
      const newBoxes = [...prevBoxes]
      const currentBox = newBoxes[index]
      if (!currentBox) return prevBoxes

      const currentColorIndex = COLOR_CYCLE.indexOf(currentBox.color)
      const nextColorIndex = (currentColorIndex + 1) % COLOR_CYCLE.length
      const nextColor = COLOR_CYCLE[nextColorIndex] as BoxColor

      newBoxes[index] = {
        index,
        color: nextColor
      }

      // Call the callback with the goalId and new color
      if (onColorChange) {
        onColorChange(goalId, index, nextColor)
      }

      return newBoxes
    })
  }

  return (
    <>
      {/* SHIMMER EFFECT - TEMPORARILY DISABLED */}
      {/* <style jsx>{`
        @keyframes shimmer-sweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .shimmer-container {
          animation: shimmer-sweep 1.2s ease-in-out infinite;
          animation-delay: ${shimmerIndex === 0 ? 0 : 0.5 + shimmerIndex * 0.5}s;
          animation-iteration-count: infinite;
          animation-duration: 6s;
          animation-timing-function: linear;
        }
        @keyframes shimmer-animation {
          0%, 12% {
            transform: translateX(-100%);
          }
          24%, 100% {
            transform: translateX(200%);
          }
        }
        .shimmer-overlay {
          animation: shimmer-animation 6s ease-in-out infinite;
          animation-delay: ${shimmerIndex === 0 ? 0 : 0.5 + shimmerIndex * 0.5}s;
        }
      `}</style> */}
      <div className="w-full relative" style={{ opacity }}>
        <div className="grid grid-cols-7 gap-1 w-full">
          {boxes.map((box) => (
            <button
              key={box.index}
              onClick={() => handleBoxClick(box.index)}
              className={`h-[25px] rounded transition-all hover:opacity-80 ${getColorClasses(box.color)}`}
              aria-label={`Box ${box.index + 1}, current color: ${box.color}`}
            />
          ))}
        </div>
        {/* Shimmer overlay - TEMPORARILY DISABLED */}
        {/* <div
          className="shimmer-overlay absolute inset-0 pointer-events-none overflow-hidden rounded"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%)',
            width: '50%',
            transform: 'translateX(-100%)',
          }}
        /> */}
      </div>
    </>
  )
}
