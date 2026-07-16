'use client'

import { cn } from '@/lib/utils'
import { advisorInitials } from '@/modules/board-of-advisors/lib/utils'

interface AdvisorAvatarProps {
  name: string
  /** Stored advisor hex color — an intentional per-advisor accent. */
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const

export function AdvisorAvatar({ name, color, size = 'md', className }: AdvisorAvatarProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        SIZE_CLASSES[size],
        className,
      )}
      style={{
        backgroundColor: `${color}1f`,
        color,
        // Tailwind ring-* colors can't take a runtime hex; the ring matches the accent.
        boxShadow: `0 0 0 2px ${color}2e`,
      }}
      aria-hidden="true"
    >
      {advisorInitials(name)}
    </span>
  )
}
