'use client'

import { Badge } from '@/components/ui/badge'
import type { ArticleStatus } from '../types'

interface StatusBadgeProps {
  status: ArticleStatus
  size?: 'sm' | 'default'
}

export function StatusBadge({ status, size = 'default' }: StatusBadgeProps) {
  const isPublished = status === 'published'

  return (
    <Badge
      variant={isPublished ? 'default' : 'secondary'}
      className={`
        ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs'}
        ${isPublished
          ? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400'
        }
      `}
    >
      {status}
    </Badge>
  )
}

export default StatusBadge
