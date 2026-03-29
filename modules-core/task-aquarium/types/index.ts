import type { Task } from '@/lib/supabase'

export type FishType = 'classic' | 'tropical' | 'puffer' | 'eel' | 'goldfish' | 'betta' | 'clownfish' | 'jellyfish'

export interface FishData {
  id: string
  title: string
  // Size based on impact (1-5 scale -> fish size)
  size: number
  // Speed based on priority score (higher score = higher priority = faster)
  speed: number
  // Vertical position based on priority score (higher score = higher position)
  yPosition: number
  // Color based on due date urgency
  color: string
  // Original task data
  task: Task
  // Priority score (0-10, higher = higher priority)
  priorityScore: number
  // Fish type/species
  fishType: FishType
}

export interface AquariumProps {
  fish: FishData[]
  onFishClick?: (fish: FishData) => void
}

export interface FishProps {
  fish: FishData
  index: number
  onClick?: () => void
}
