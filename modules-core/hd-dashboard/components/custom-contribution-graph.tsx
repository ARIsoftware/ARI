"use client"

import { useState } from "react"

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
      return 'bg-gray-200 dark:bg-gray-600 blueprint:bg-white/30 light:bg-gray-200'
    case 'dark-grey':
      return 'bg-gray-400 dark:bg-gray-500 blueprint:bg-white/50 light:bg-gray-400'
    case 'black':
      return 'bg-black dark:bg-gray-900 blueprint:bg-white/80 light:bg-black'
    case 'green':
      return 'bg-green-500 dark:bg-green-600 blueprint:bg-green-400 light:bg-green-500'
    case 'red':
      return 'bg-red-500 dark:bg-red-600 blueprint:bg-red-400 light:bg-red-500'
  }
}

export function CustomContributionGraph({
  goalId,
  onColorChange,
  initialColors = [],
  opacity = 1,
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
    </div>
  )
}
