// Session type from Better Auth
export interface Session {
  id: string
  token: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  userAgent?: string | null
  ipAddress?: string | null
}

export interface NotificationSettings {
  taskReminders: boolean
  productUpdates: boolean
  securityAlerts: boolean
  weeklySummary: boolean
}

export interface BetaFeatureSettings {
  smartPriorities: boolean
  predictiveScheduling: boolean
  aiMeetingNotes: boolean
}

export interface FeaturePreference {
  id: string
  user_id: string
  feature_name: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface BackupStats {
  tables: number
  totalRows: number
  discoveryMethod?: string
  warnings?: number
}

export interface BackupMessage {
  type: "success" | "error" | "warning"
  text: string
}

export interface ImportProgress {
  current: number
  total: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  metadata?: Record<string, unknown>
}

export interface VerificationResult {
  status: "ok" | "warning" | "critical"
  timestamp: string
  discoveryMethod: string
  tablesFound: number
  expectedTables: number
  totalRows: number
  warnings: string[]
  missingTables: string[]
  extraTables: string[]
}

export interface FontOption {
  value: string
  label: string
  css: string
}

export const FONT_OPTIONS: FontOption[] = [
  { value: "Overpass Mono", label: "Overpass Mono", css: '"Overpass Mono", monospace' },
  { value: "Outfit", label: "Outfit", css: '"Outfit", sans-serif' },
  { value: "Open Sans", label: "Open Sans", css: '"Open Sans", sans-serif' },
  { value: "Science Gothic", label: "Science Gothic", css: '"Science Gothic", sans-serif' },
]
