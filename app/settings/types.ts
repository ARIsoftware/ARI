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

// API Key types
export interface ApiKey {
  id: string
  label: string
  key_prefix: string
  expires_at: string | null
  allowed_ips: string[] | null
  last_used_at: string | null
  request_count: number
  revoked: boolean
  created_at: string
}

export interface ApiKeyUsageLog {
  id: string
  endpoint: string
  method: string
  status_code: number
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface ApiKeyCreateResponse {
  key: ApiKey
  raw_key: string
}
