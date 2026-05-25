import { z } from 'zod'
import '@/lib/openapi/registry'

// ────────────────────────────────────────────────────────────
// Shared response primitives
// ────────────────────────────────────────────────────────────

export const SuccessSchema = z.object({
  success: z.literal(true),
}).openapi('AppSuccess')

export const SuccessMessageSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
}).openapi('AppSuccessMessage')

export const appIdParamSchema = z.object({
  id: z.string(),
})

// ────────────────────────────────────────────────────────────
// /api/api-keys
// ────────────────────────────────────────────────────────────

export const ApiKeySchema = z.object({
  id: z.string(),
  label: z.string(),
  key_prefix: z.string(),
  expires_at: z.string().nullable(),
  allowed_ips: z.array(z.string()).nullable(),
  last_used_at: z.string().nullable(),
  request_count: z.number().int(),
  revoked: z.boolean(),
  created_at: z.string().nullable(),
}).openapi('ApiKeyRow')

export const ApiKeyListResponseSchema = z.array(ApiKeySchema).openapi('ApiKeyList')

export const createApiKeySchema = z.object({
  label: z.string().min(1).max(255),
  expiresAt: z.string().datetime().nullable().optional(),
  allowedIps: z.array(z.string().max(45)).max(20).nullable().optional(),
}).openapi('CreateApiKeyBody')

export const updateApiKeySchema = z.object({
  label: z.string().min(1).max(255).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  allowedIps: z.array(z.string().max(45)).max(20).nullable().optional(),
}).openapi('UpdateApiKeyBody')

export const ApiKeyCreatedResponseSchema = z.object({
  key: ApiKeySchema,
  raw_key: z.string(),
}).openapi('ApiKeyCreatedResponse')

// ────────────────────────────────────────────────────────────
// /api/auth — Better Auth catch-all (documented as opaque proxy)
// ────────────────────────────────────────────────────────────

export const BetterAuthRequestSchema = z.unknown().openapi('BetterAuthRequest')
export const BetterAuthResponseSchema = z.unknown().openapi('BetterAuthResponse')

// /api/auth/bootstrap

export const BootstrapStatusSchema = z.object({
  status: z.enum(['already_initialized', 'no_database', 'install_failed', 'no_users', 'installed', 'created', 'error']),
  error: z.string().optional(),
  pgCode: z.string().optional(),
}).openapi('BootstrapStatus')

// ────────────────────────────────────────────────────────────
// /api/backup
// ────────────────────────────────────────────────────────────

export const BackupExportRequestSchema = z.unknown().openapi('BackupExportRequest')
export const BackupExportResponseSchema = z.unknown().openapi('BackupExportResponse')
export const BackupImportRequestSchema = z.unknown().openapi('BackupImportRequest')
export const BackupImportResponseSchema = z.unknown().openapi('BackupImportResponse')
export const BackupVerifyResponseSchema = z.unknown().openapi('BackupVerifyResponse')

// ────────────────────────────────────────────────────────────
// /api/download-env, /api/onboarding/save-env
// ────────────────────────────────────────────────────────────

export const SaveEnvSuccessSchema = z.object({
  success: z.literal(true),
  path: z.string(),
}).openapi('SaveEnvSuccess')

// ────────────────────────────────────────────────────────────
// /api/health/* (auth-config, module-status, rls-test, root)
// ────────────────────────────────────────────────────────────

export const HealthAuthConfigSchema = z.object({
  isProduction: z.boolean(),
  secretConfigured: z.boolean(),
  databaseConfigured: z.boolean(),
  sslEnabled: z.boolean(),
  hasProductionOrigin: z.boolean(),
  rateLimitEnabled: z.boolean(),
  trustedOriginsCount: z.number().int(),
  environment: z.object({
    NODE_ENV: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string(),
    DATABASE_URL: z.string(),
    BETTER_AUTH_SECRET: z.string(),
  }),
}).openapi('HealthAuthConfig')

export const HealthModuleStatusSchema = z.object({
  authenticated: z.boolean(),
  userId: z.string().optional(),
  allModules: z.array(z.object({ id: z.string(), enabled: z.boolean().optional() })).optional(),
  userSettings: z.array(z.unknown()).optional(),
  moduleChecks: z.record(z.string(), z.object({ exists: z.literal(true), enabled: z.boolean() })).optional(),
  error: z.string().optional(),
}).openapi('HealthModuleStatus')

export const HealthRlsTestSchema = z.object({
  authenticated: z.boolean(),
  userId: z.string().optional(),
  success: z.boolean().optional(),
  positiveTest: z.unknown().optional(),
  negativeTest: z.unknown().optional(),
  tableTested: z.string().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
}).openapi('HealthRlsTestResult')

export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.record(z.string(), z.object({
    status: z.enum(['ok', 'error']),
    message: z.string().optional(),
  })),
}).openapi('HealthCheck')

// ────────────────────────────────────────────────────────────
// /api/license
// ────────────────────────────────────────────────────────────

export const LicenseStatusSchema = z.object({
  active: z.boolean(),
  status: z.string().nullable().optional(),
  masked_key: z.string().optional(),
  customer_email: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  validated_at: z.string().nullable().optional(),
  env_key: z.string().optional(),
}).openapi('LicenseStatus')

export const validateLicenseSchema = z.object({
  key: z.string().min(1),
}).openapi('ValidateLicenseBody')

export const ValidateLicenseResponseSchema = z.object({
  success: z.literal(true),
  status: z.string(),
  customer_email: z.string().nullable(),
  expires_at: z.string().nullable(),
}).openapi('ValidateLicenseResponse')

// ────────────────────────────────────────────────────────────
// /api/modules
// ────────────────────────────────────────────────────────────

export const ModuleSummarySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
}).passthrough().openapi('ModuleSummary')

export const ListEnabledModulesResponseSchema = z.object({
  modules: z.array(ModuleSummarySchema),
  count: z.number().int().optional(),
}).openapi('ListEnabledModulesResponse')

export const toggleModuleSchema = z.object({
  moduleId: z.string(),
  enabled: z.boolean(),
}).openapi('ToggleModuleBody')

export const ToggleModuleResponseSchema = z.object({
  success: z.literal(true),
  moduleId: z.string(),
  enabled: z.boolean(),
}).openapi('ToggleModuleResponse')

export const batchModulesSchema = z.object({
  changes: z.array(z.object({
    moduleId: z.string(),
    enabled: z.boolean(),
  })).min(1),
}).openapi('BatchModulesBody')

export const BatchModulesResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(z.object({
    moduleId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    warning: z.string().optional(),
  })),
  updated: z.number().int().optional(),
  warnings: z.array(z.string()).optional(),
  error: z.string().optional(),
}).openapi('BatchModulesResponse')

export const downloadModuleSchema = z.object({
  module: z.string().regex(/^[a-z0-9-]{1,64}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
}).openapi('DownloadModuleBody')

export const githubSyncSchema = z.object({
  moduleId: z.string(),
  moduleDir: z.string(),
}).openapi('GithubSyncBody')

export const GithubSyncResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  commitSha: z.string(),
  filesCommitted: z.number().int(),
}).openapi('GithubSyncResponse')

export const GithubSyncStatusSchema = z.object({
  configured: z.boolean(),
  isVercel: z.boolean(),
  owner: z.string().optional(),
  repo: z.string().optional(),
  branch: z.string().optional(),
  hint: z.string().optional(),
}).openapi('GithubSyncStatus')

export const orderRecordSchema = z.record(z.string(), z.number())

export const updateOrderSchema = z.object({
  moduleOrder: orderRecordSchema.optional(),
  iconOrder: orderRecordSchema.optional(),
  statCardOrder: orderRecordSchema.optional(),
  widgetOrder: orderRecordSchema.optional(),
}).openapi('UpdateOrderBody')

export const OrderResponseSchema = z.object({
  iconOrder: orderRecordSchema.nullable(),
  moduleOrder: orderRecordSchema.nullable(),
  statCardOrder: orderRecordSchema.nullable(),
  widgetOrder: orderRecordSchema.nullable(),
}).openapi('OrderResponse')

export const ModuleRefreshResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  output: z.string().optional(),
  warnings: z.string().optional(),
}).openapi('ModuleRefreshResponse')

export const ModuleLibraryResponseSchema = z.unknown().openapi('ModuleLibraryResponse')

// ────────────────────────────────────────────────────────────
// /api/settings
// ────────────────────────────────────────────────────────────

export const settingsApiKeyBodySchema = z.object({
  key: z.string(),
  value: z.string(),
}).openapi('SettingsApiKeyBody')

export const SettingsApiKeyStatusSchema = z.record(z.string(), z.object({
  configured: z.boolean(),
  masked: z.string().nullable(),
})).openapi('SettingsApiKeyStatus')

export const SettingsApiKeySaveResponseSchema = z.object({
  success: z.literal(true),
  deleted: z.boolean().optional(),
  masked: z.string().optional(),
}).openapi('SettingsApiKeySaveResponse')

export const SettingsGithubStatusSchema = z.object({
  hasToken: z.boolean(),
  repoOwner: z.string(),
  repoName: z.string(),
}).openapi('SettingsGithubStatus')

export const settingsGithubBodySchema = z.object({
  githubToken: z.string().optional(),
  githubRepoOwner: z.string().optional(),
  githubRepoName: z.string().optional(),
  clearToken: z.boolean().optional(),
}).openapi('SettingsGithubBody')

export const SettingsStorageInfoSchema = z.object({
  provider: z.string(),
  providerLabel: z.string(),
  source: z.enum(['env', 'default']),
  envVars: z.array(z.object({
    name: z.string(),
    set: z.boolean(),
    required: z.boolean(),
  })),
}).openapi('SettingsStorageInfo')

// ────────────────────────────────────────────────────────────
// /api/storage
// ────────────────────────────────────────────────────────────

export const storageUploadFormSchema = z.object({
  bucket: z.string(),
  file: z.any().openapi({ type: 'string', format: 'binary' }),
}).openapi('StorageUploadForm')

export const StorageUploadResponseSchema = z.object({
  path: z.string(),
  name: z.string(),
}).openapi('StorageUploadResponse')

export const storageListQuerySchema = z.object({
  bucket: z.string(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const StorageListResponseSchema = z.object({
  files: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
}).openapi('StorageListResponse')

export const storageDeleteSchema = z.object({
  bucket: z.string(),
  filename: z.string(),
}).openapi('StorageDeleteBody')

// ────────────────────────────────────────────────────────────
// /api/system, /api/telemetry, /api/test-connection, /api/project-dir
// ────────────────────────────────────────────────────────────

export const DbModeResponseSchema = z.object({
  mode: z.enum(['postgres', 'supabaselocal', 'supabasecloud']).or(z.string()),
}).openapi('DbModeResponse')

export const TelemetryResponseSchema = z.object({
  telemetryEnabled: z.boolean(),
}).openapi('TelemetryStatus')

export const updateTelemetrySchema = z.object({
  enabled: z.boolean(),
}).openapi('UpdateTelemetryBody')

export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  status: z.number().int().optional(),
  statusText: z.string().optional(),
  error: z.unknown().optional(),
}).openapi('TestConnectionResponse')

export const ProjectDirResponseSchema = z.object({
  dir: z.string(),
  dbMode: z.string(),
  envFileExists: z.boolean(),
  hasDatabaseUrl: z.boolean(),
  localSupabase: z.object({
    detected: z.boolean(),
    envFileExists: z.boolean(),
    hasUrl: z.boolean(),
    hasKeys: z.boolean(),
    hasDatabaseUrl: z.boolean(),
  }),
}).openapi('ProjectDirResponse')

// ────────────────────────────────────────────────────────────
// /api/theme
// ────────────────────────────────────────────────────────────

export const themeColorsSchema = z.object({
  background: z.string(),
  foreground: z.string(),
}).passthrough().openapi('ThemeColors')

export const customThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['light', 'dark']),
  colors: themeColorsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi('CustomTheme')

export const ThemeSettingsSchema = z.object({
  activeThemeId: z.string(),
  activeFont: z.string(),
  customThemes: z.array(customThemeSchema),
  sidebarView: z.enum(['default', 'compressed']),
}).openapi('ThemeSettings')

export const updateThemeSchema = z.object({
  activeThemeId: z.string().optional(),
  activeFont: z.string().optional(),
  customThemes: z.array(customThemeSchema).optional(),
  sidebarView: z.enum(['default', 'compressed']).optional(),
}).openapi('UpdateThemeBody')

// ────────────────────────────────────────────────────────────
// /api/user-preferences
// ────────────────────────────────────────────────────────────

export const UserPreferencesSchema = z.object({
  id: z.string().nullable(),
  user_id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  company_name: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  timezone: z.string(),
}).passthrough().openapi('UserPreferences')

export const updateUserPreferencesSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  timezone: z.string().max(50).optional(),
}).openapi('UpdateUserPreferencesBody')
