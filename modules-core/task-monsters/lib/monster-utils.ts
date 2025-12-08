import type { Task } from "@/lib/supabase"

export const MONSTER_TYPES = ['slime', 'cyclops', 'ghost', 'goblin', 'spider', 'mushroom', 'demon', 'blob'] as const

export type MonsterType = typeof MONSTER_TYPES[number]

export const DEFAULT_MONSTER_COLORS: Record<MonsterType, { primary: string; secondary: string }> = {
  slime: { primary: "#4CAF50", secondary: "#2E7D32" },
  cyclops: { primary: "#7E57C2", secondary: "#4A148C" },
  ghost: { primary: "#E0E0E0", secondary: "#1a1a1a" },
  goblin: { primary: "#558B2F", secondary: "#33691E" },
  spider: { primary: "#37474F", secondary: "#ff1744" },
  mushroom: { primary: "#E53935", secondary: "#FFEB3B" },
  demon: { primary: "#C62828", secondary: "#FF6F00" },
  blob: { primary: "#00BCD4", secondary: "#006064" },
}

export const MONSTER_INFO: Record<MonsterType, { name: string; description: string }> = {
  slime: {
    name: "Slime",
    description: "Slimes are bouncy, gelatinous creatures that ooze through the village leaving a faint sparkly trail behind them. Despite their gooey appearance, they are surprisingly friendly and enjoy bobbing up and down when they meet new friends.",
  },
  cyclops: {
    name: "Cyclops",
    description: "The Cyclops is a towering one-eyed creature with impressive curved horns that it polishes every morning. Its single eye can see in complete darkness and is said to perceive things invisible to others.",
  },
  ghost: {
    name: "Ghost",
    description: "Ghosts are ethereal beings that float gracefully through the village, phasing through walls and trees as they please. They emit a soft, calming glow that intensifies when they are happy or excited.",
  },
  goblin: {
    name: "Goblin",
    description: "Goblins are small, mischievous creatures with oversized ears that can hear a whisper from across the village. Their glowing yellow eyes dart around constantly, always searching for something interesting.",
  },
  spider: {
    name: "Spider",
    description: "These eight-legged arachnids may look creepy, but they are the village's most dedicated weavers and artists. Their multiple glowing eyes allow them to see in all directions at once.",
  },
  mushroom: {
    name: "Mushroom",
    description: "Mushroom creatures are adorable fungal beings that waddle through the village on their tiny stem-feet. Their colorful spotted caps release tiny spores that smell like fresh rain and forest flowers.",
  },
  demon: {
    name: "Demon",
    description: "Despite their fearsome appearance with horns, wings, and a pointed tail, village Demons are surprisingly well-mannered creatures. Their glowing eyes and fiery coloring come from their ability to regulate their own body temperature.",
  },
  blob: {
    name: "Blob",
    description: "Blobs are adorable amorphous creatures with wobbly bodies and eyes perched on cute stalks that swivel independently. Their squishy form allows them to squeeze through tiny spaces and reshape themselves at will.",
  },
}

// Generate a hash from task ID for consistent monster assignment
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

export function getMonsterTypeForTask(taskId: string): MonsterType {
  const hash = hashString(taskId)
  return MONSTER_TYPES[hash % MONSTER_TYPES.length]
}

export function assignMonsterToTask(task: Task): { type: MonsterType; colors: { primary: string; secondary: string } } {
  if (task.monster_type && task.monster_colors) {
    return {
      type: task.monster_type as MonsterType,
      colors: task.monster_colors
    }
  }

  // Deterministic assignment based on task ID (same task = same monster)
  const type = getMonsterTypeForTask(task.id)
  return { type, colors: DEFAULT_MONSTER_COLORS[type] }
}

export function getMonsterInfo(type: MonsterType) {
  return MONSTER_INFO[type]
}

export function getMonsterColors(type: MonsterType) {
  return DEFAULT_MONSTER_COLORS[type]
}
