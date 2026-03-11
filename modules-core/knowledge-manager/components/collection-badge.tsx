'use client'

import { Badge } from '@/components/ui/badge'

interface CollectionBadgeProps {
  name: string
  color: string
  size?: 'sm' | 'default'
  onClick?: () => void
}

export function CollectionBadge({ name, color, size = 'default', onClick }: CollectionBadgeProps) {
  // Calculate contrasting text color
  const getContrastColor = (hexColor: string): string => {
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#1f2937' : '#ffffff'
  }

  const textColor = getContrastColor(color)

  return (
    <Badge
      variant="outline"
      className={`
        ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs'}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
        border-0
      `}
      style={{
        backgroundColor: color,
        color: textColor
      }}
      onClick={onClick}
    >
      {name}
    </Badge>
  )
}

export default CollectionBadge
