/**
 * Tests for lib/openapi/app-schemas.ts
 *
 * These schemas are pure Zod definitions — we test their validation behaviour
 * (valid input passes, invalid input fails) to ensure every schema is wired
 * correctly and every constraint is exercised.
 */
import { describe, it, expect } from 'vitest'
import {
  SuccessSchema,
  SuccessMessageSchema,
  appIdParamSchema,
  ApiKeySchema,
  ApiKeyListResponseSchema,
  createApiKeySchema,
  updateApiKeySchema,
  ApiKeyCreatedResponseSchema,
  CurrentUserResponseSchema,
  BetterAuthRequestSchema,
  BetterAuthResponseSchema,
  BootstrapStatusSchema,
  BackupExportRequestSchema,
  BackupExportResponseSchema,
  BackupImportRequestSchema,
  BackupImportResponseSchema,
  BackupVerifyResponseSchema,
  SaveEnvSuccessSchema,
  HealthAuthConfigSchema,
  HealthAiProvidersSchema,
  HealthModuleStatusSchema,
  HealthStorageFilesystemSchema,
  HealthRlsTestSchema,
  HealthMultiUserSchema,
  HealthCheckSchema,
  LicenseStatusSchema,
  validateLicenseSchema,
  ValidateLicenseResponseSchema,
  ModuleSummarySchema,
  ListEnabledModulesResponseSchema,
  toggleModuleSchema,
  ToggleModuleResponseSchema,
  batchModulesSchema,
  BatchModulesResponseSchema,
  downloadModuleSchema,
  githubSyncSchema,
  GithubSyncResponseSchema,
  GithubSyncStatusSchema,
  orderRecordSchema,
  updateOrderSchema,
  OrderResponseSchema,
  ModuleRefreshResponseSchema,
  ModuleLibraryResponseSchema,
  settingsApiKeyBodySchema,
  SettingsApiKeyStatusSchema,
  SettingsApiKeySaveResponseSchema,
  settingsProviderModelsQuerySchema,
  SettingsProviderModelsSchema,
  SettingsGithubStatusSchema,
  settingsGithubBodySchema,
  SettingsStorageInfoSchema,
  storageUploadFormSchema,
  StorageUploadResponseSchema,
  storageListQuerySchema,
  StorageListResponseSchema,
  storageDeleteSchema,
  DbModeResponseSchema,
  TelemetryResponseSchema,
  updateTelemetrySchema,
  TestConnectionResponseSchema,
  ProjectDirResponseSchema,
  themeColorsSchema,
  customThemeSchema,
  ThemeSettingsSchema,
  updateThemeSchema,
  UserPreferencesSchema,
  updateUserPreferencesSchema,
} from '@/lib/openapi/app-schemas'

// ── helpers ──────────────────────────────────────────────────────────────────

function pass(schema: { parse: (v: unknown) => unknown }, value: unknown) {
  expect(() => schema.parse(value)).not.toThrow()
}

function fail(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false)
}

// ─── SuccessSchema ───────────────────────────────────────────────────────────

describe('SuccessSchema', () => {
  it('accepts { success: true }', () => pass(SuccessSchema, { success: true }))
  it('rejects { success: false }', () => fail(SuccessSchema, { success: false }))
  it('rejects missing success', () => fail(SuccessSchema, {}))
})

describe('SuccessMessageSchema', () => {
  it('accepts with optional message', () => {
    pass(SuccessMessageSchema, { success: true, message: 'done' })
  })
  it('accepts without message', () => pass(SuccessMessageSchema, { success: true }))
  it('rejects when success is false', () => fail(SuccessMessageSchema, { success: false }))
})

describe('appIdParamSchema', () => {
  it('accepts { id: "abc" }', () => pass(appIdParamSchema, { id: 'abc' }))
  it('rejects missing id', () => fail(appIdParamSchema, {}))
})

// ─── ApiKey schemas ──────────────────────────────────────────────────────────

const validApiKey = {
  id: 'key-1',
  label: 'My Key',
  key_prefix: 'ak_',
  expires_at: null,
  allowed_ips: null,
  last_used_at: null,
  request_count: 0,
  revoked: false,
  created_at: null,
}

describe('ApiKeySchema', () => {
  it('accepts a valid API key row', () => pass(ApiKeySchema, validApiKey))
  it('rejects missing required fields', () => fail(ApiKeySchema, { id: 'x' }))
  it('accepts non-null expires_at string', () => {
    pass(ApiKeySchema, { ...validApiKey, expires_at: '2030-01-01' })
  })
})

describe('ApiKeyListResponseSchema', () => {
  it('accepts an array of API key rows', () => pass(ApiKeyListResponseSchema, [validApiKey]))
  it('accepts an empty array', () => pass(ApiKeyListResponseSchema, []))
})

describe('createApiKeySchema', () => {
  it('accepts a valid create body', () => {
    pass(createApiKeySchema, { label: 'My Key' })
  })
  it('accepts all optional fields', () => {
    pass(createApiKeySchema, {
      label: 'K',
      expiresAt: '2030-01-01T00:00:00.000Z',
      allowedIps: ['1.2.3.4'],
    })
  })
  it('rejects empty label', () => fail(createApiKeySchema, { label: '' }))
  it('rejects label longer than 255 chars', () => {
    fail(createApiKeySchema, { label: 'a'.repeat(256) })
  })
  it('rejects too many allowed IPs (> 20)', () => {
    fail(createApiKeySchema, {
      label: 'K',
      allowedIps: Array.from({ length: 21 }, (_, i) => `10.0.0.${i}`),
    })
  })
})

describe('updateApiKeySchema', () => {
  it('accepts an empty object (all optional)', () => pass(updateApiKeySchema, {}))
  it('accepts partial updates', () => pass(updateApiKeySchema, { label: 'New Label' }))
})

describe('ApiKeyCreatedResponseSchema', () => {
  it('accepts a valid response', () => {
    pass(ApiKeyCreatedResponseSchema, { key: validApiKey, raw_key: 'secret' })
  })
})

// ─── CurrentUser ─────────────────────────────────────────────────────────────

describe('CurrentUserResponseSchema', () => {
  it('accepts a valid current user', () => {
    pass(CurrentUserResponseSchema, {
      id: 'u1',
      email: 'a@b.com',
      name: null,
      first_name: null,
      last_name: null,
      image: null,
      role: 'user',
      permissions: { access_settings: true },
    })
  })
  it('accepts role = admin', () => {
    pass(CurrentUserResponseSchema, {
      id: 'u1',
      email: 'a@b.com',
      name: null,
      first_name: null,
      last_name: null,
      image: null,
      role: 'admin',
      permissions: {},
    })
  })
  it('rejects an unknown role', () => {
    fail(CurrentUserResponseSchema, {
      id: 'u1',
      email: 'a@b.com',
      name: null,
      first_name: null,
      last_name: null,
      image: null,
      role: 'superuser',
      permissions: {},
    })
  })
})

// ─── BetterAuth schemas (z.unknown) ──────────────────────────────────────────

describe('BetterAuthRequestSchema / BetterAuthResponseSchema', () => {
  it('accepts anything', () => {
    pass(BetterAuthRequestSchema, { anything: true })
    pass(BetterAuthResponseSchema, 'string')
    pass(BetterAuthRequestSchema, null)
  })
})

// ─── BootstrapStatusSchema ───────────────────────────────────────────────────

describe('BootstrapStatusSchema', () => {
  const validStatuses = [
    'already_initialized', 'no_database', 'install_failed',
    'no_users', 'installed', 'created', 'error',
  ] as const

  for (const status of validStatuses) {
    it(`accepts status "${status}"`, () => pass(BootstrapStatusSchema, { status }))
  }

  it('accepts optional error and pgCode', () => {
    pass(BootstrapStatusSchema, { status: 'error', error: 'oops', pgCode: '42501' })
  })

  it('rejects unknown status', () => fail(BootstrapStatusSchema, { status: 'unknown' }))
})

// ─── Backup schemas (z.unknown) ──────────────────────────────────────────────

describe('Backup schemas (z.unknown)', () => {
  it('BackupExportRequestSchema accepts anything', () => pass(BackupExportRequestSchema, {}))
  it('BackupExportResponseSchema accepts anything', () => pass(BackupExportResponseSchema, null))
  it('BackupImportRequestSchema accepts anything', () => pass(BackupImportRequestSchema, 'x'))
  it('BackupImportResponseSchema accepts anything', () => pass(BackupImportResponseSchema, 1))
  it('BackupVerifyResponseSchema accepts anything', () => pass(BackupVerifyResponseSchema, []))
})

// ─── SaveEnvSuccessSchema ────────────────────────────────────────────────────

describe('SaveEnvSuccessSchema', () => {
  it('accepts valid response', () => {
    pass(SaveEnvSuccessSchema, { success: true, path: '/etc/.env' })
  })
  it('rejects missing path', () => fail(SaveEnvSuccessSchema, { success: true }))
})

// ─── HealthAuthConfigSchema ──────────────────────────────────────────────────

describe('HealthAuthConfigSchema', () => {
  it('accepts a valid config', () => {
    pass(HealthAuthConfigSchema, {
      isProduction: false,
      secretConfigured: true,
      databaseConfigured: true,
      sslEnabled: false,
      hasProductionOrigin: false,
      rateLimitEnabled: true,
      trustedOriginsCount: 0,
      environment: {
        NODE_ENV: 'test',
        NEXT_PUBLIC_APP_URL: 'http://localhost',
        DATABASE_URL: 'postgres://localhost/db',
        BETTER_AUTH_SECRET: 'secret',
      },
    })
  })
})

// ─── HealthAiProvidersSchema ─────────────────────────────────────────────────

describe('HealthAiProvidersSchema', () => {
  it('accepts ok status', () => {
    pass(HealthAiProvidersSchema, {
      status: 'ok',
      configuredCount: 1,
      providers: [{ id: 'openai', name: 'OpenAI', configured: true, source: 'env' }],
    })
  })
  it('accepts none status with empty providers', () => {
    pass(HealthAiProvidersSchema, { status: 'none', configuredCount: 0, providers: [] })
  })
  it('accepts provider with null source', () => {
    pass(HealthAiProvidersSchema, {
      status: 'none',
      configuredCount: 0,
      providers: [{ id: 'x', name: 'X', configured: false, source: null }],
    })
  })
  it('rejects invalid source enum', () => {
    fail(HealthAiProvidersSchema, {
      status: 'ok',
      configuredCount: 1,
      providers: [{ id: 'x', name: 'X', configured: true, source: 'file' }],
    })
  })
})

// ─── HealthModuleStatusSchema ────────────────────────────────────────────────

describe('HealthModuleStatusSchema', () => {
  it('accepts authenticated true only', () => {
    pass(HealthModuleStatusSchema, { authenticated: true })
  })
  it('accepts full object', () => {
    pass(HealthModuleStatusSchema, {
      authenticated: true,
      userId: 'u1',
      allModules: [{ id: 'tasks', enabled: true }],
      userSettings: [],
      moduleChecks: { tasks: { exists: true, enabled: true } },
    })
  })
  it('accepts error case', () => {
    pass(HealthModuleStatusSchema, { authenticated: false, error: 'db error' })
  })
})

// ─── HealthStorageFilesystemSchema ───────────────────────────────────────────

describe('HealthStorageFilesystemSchema', () => {
  it('accepts minimal form', () => {
    pass(HealthStorageFilesystemSchema, { provider: 'filesystem', applicable: true })
  })
  it('accepts full form', () => {
    pass(HealthStorageFilesystemSchema, {
      provider: 'filesystem',
      applicable: true,
      basePath: '/data',
      exists: true,
      writable: true,
      isEphemeral: false,
    })
  })
  it('accepts error form', () => {
    pass(HealthStorageFilesystemSchema, {
      provider: 's3',
      applicable: false,
      error: 'not configured',
    })
  })
})

// ─── HealthRlsTestSchema ─────────────────────────────────────────────────────

describe('HealthRlsTestSchema', () => {
  it('accepts an authenticated success', () => {
    pass(HealthRlsTestSchema, {
      authenticated: true,
      userId: 'u1',
      success: true,
      bypassRls: true,
    })
  })
  it('accepts unauthenticated', () => {
    pass(HealthRlsTestSchema, { authenticated: false })
  })
})

// ─── HealthMultiUserSchema ───────────────────────────────────────────────────

describe('HealthMultiUserSchema', () => {
  it('accepts all fields', () => {
    pass(HealthMultiUserSchema, {
      ok: true,
      columnsPresent: true,
      missingColumns: [],
      sharedAccessFunction: true,
      activeAdminCount: 1,
      hasActiveAdmin: true,
    })
  })
  it('accepts null activeAdminCount', () => {
    pass(HealthMultiUserSchema, {
      ok: false,
      columnsPresent: false,
      missingColumns: ['role'],
      sharedAccessFunction: false,
      activeAdminCount: null,
      hasActiveAdmin: false,
      error: 'db failure',
    })
  })
})

// ─── HealthCheckSchema ───────────────────────────────────────────────────────

describe('HealthCheckSchema', () => {
  it('accepts ok status with checks', () => {
    pass(HealthCheckSchema, {
      status: 'ok',
      checks: { db: { status: 'ok', message: 'connected' } },
    })
  })
  it('accepts error status', () => {
    pass(HealthCheckSchema, {
      status: 'error',
      checks: { db: { status: 'error' } },
    })
  })
  it('rejects unknown status', () => {
    fail(HealthCheckSchema, { status: 'warning', checks: {} })
  })
})

// ─── License schemas ─────────────────────────────────────────────────────────

describe('LicenseStatusSchema', () => {
  it('accepts minimal form', () => {
    pass(LicenseStatusSchema, { active: true })
  })
  it('accepts full form', () => {
    pass(LicenseStatusSchema, {
      active: true,
      status: 'active',
      masked_key: 'sk_****',
      customer_email: 'a@b.com',
      expires_at: '2030-01-01',
      validated_at: '2025-01-01',
      env_key: 'LICENSE_KEY',
    })
  })
  it('accepts null nullable fields', () => {
    pass(LicenseStatusSchema, { active: false, status: null })
  })
})

describe('validateLicenseSchema', () => {
  it('accepts a non-empty key', () => pass(validateLicenseSchema, { key: 'abc' }))
  it('rejects an empty key', () => fail(validateLicenseSchema, { key: '' }))
})

describe('ValidateLicenseResponseSchema', () => {
  it('accepts a valid response', () => {
    pass(ValidateLicenseResponseSchema, {
      success: true,
      status: 'active',
      customer_email: null,
      expires_at: null,
    })
  })
})

// ─── Module schemas ───────────────────────────────────────────────────────────

describe('ModuleSummarySchema', () => {
  it('accepts minimal { id }', () => pass(ModuleSummarySchema, { id: 'tasks' }))
  it('accepts with optional fields', () => {
    pass(ModuleSummarySchema, { id: 'tasks', name: 'Tasks', enabled: true, isEnabled: true })
  })
  it('passes through extra keys', () => {
    const result = ModuleSummarySchema.parse({ id: 'tasks', extra: 'data' })
    expect((result as Record<string, unknown>).extra).toBe('data')
  })
})

describe('ListEnabledModulesResponseSchema', () => {
  it('accepts a list with count', () => {
    pass(ListEnabledModulesResponseSchema, { modules: [{ id: 'tasks' }], count: 1 })
  })
  it('accepts a list without count', () => {
    pass(ListEnabledModulesResponseSchema, { modules: [] })
  })
})

describe('toggleModuleSchema', () => {
  it('accepts valid toggle', () => {
    pass(toggleModuleSchema, { moduleId: 'tasks', enabled: true })
  })
  it('rejects missing enabled', () => {
    fail(toggleModuleSchema, { moduleId: 'tasks' })
  })
})

describe('ToggleModuleResponseSchema', () => {
  it('accepts valid response', () => {
    pass(ToggleModuleResponseSchema, { success: true, moduleId: 'tasks', enabled: true })
  })
})

describe('batchModulesSchema', () => {
  it('accepts one or more changes', () => {
    pass(batchModulesSchema, { changes: [{ moduleId: 'tasks', enabled: true }] })
  })
  it('rejects empty changes array', () => {
    fail(batchModulesSchema, { changes: [] })
  })
})

describe('BatchModulesResponseSchema', () => {
  it('accepts minimal form', () => {
    pass(BatchModulesResponseSchema, { success: true, results: [] })
  })
  it('accepts full form', () => {
    pass(BatchModulesResponseSchema, {
      success: true,
      results: [{ moduleId: 'tasks', success: true, warning: 'slow' }],
      updated: 1,
      warnings: ['slow'],
    })
  })
})

describe('downloadModuleSchema', () => {
  it('accepts valid module and version', () => {
    pass(downloadModuleSchema, { module: 'my-module', version: '1.0.0' })
  })
  it('rejects module with uppercase chars', () => {
    fail(downloadModuleSchema, { module: 'MyModule', version: '1.0.0' })
  })
  it('rejects malformed version', () => {
    fail(downloadModuleSchema, { module: 'tasks', version: '1.0' })
  })
})

describe('githubSyncSchema', () => {
  it('accepts valid body', () => {
    pass(githubSyncSchema, { moduleId: 'tasks', moduleDir: 'modules-core/tasks' })
  })
})

describe('GithubSyncResponseSchema', () => {
  it('accepts valid response', () => {
    pass(GithubSyncResponseSchema, {
      success: true,
      message: 'synced',
      commitSha: 'abc123',
      filesCommitted: 3,
    })
  })
})

describe('GithubSyncStatusSchema', () => {
  it('accepts minimal form', () => {
    pass(GithubSyncStatusSchema, { configured: false, isVercel: false })
  })
  it('accepts full form', () => {
    pass(GithubSyncStatusSchema, {
      configured: true,
      isVercel: true,
      owner: 'me',
      repo: 'ari',
      branch: 'main',
      hint: 'ok',
    })
  })
})

describe('orderRecordSchema', () => {
  it('accepts a string→number record', () => {
    pass(orderRecordSchema, { tasks: 0, contacts: 1 })
  })
  it('accepts empty object', () => pass(orderRecordSchema, {}))
})

describe('updateOrderSchema', () => {
  it('accepts empty (all optional)', () => pass(updateOrderSchema, {}))
  it('accepts partial', () => {
    pass(updateOrderSchema, { moduleOrder: { tasks: 0 } })
  })
  it('accepts all order fields', () => {
    pass(updateOrderSchema, {
      moduleOrder: { tasks: 0 },
      iconOrder: { bell: 1 },
      statCardOrder: { steps: 2 },
      widgetOrder: { weather: 3 },
    })
  })
})

describe('OrderResponseSchema', () => {
  it('accepts all nulls', () => {
    pass(OrderResponseSchema, {
      iconOrder: null,
      moduleOrder: null,
      statCardOrder: null,
      widgetOrder: null,
    })
  })
  it('accepts mix of null and records', () => {
    pass(OrderResponseSchema, {
      iconOrder: { bell: 0 },
      moduleOrder: null,
      statCardOrder: null,
      widgetOrder: null,
    })
  })
})

describe('ModuleRefreshResponseSchema', () => {
  it('accepts minimal form', () => {
    pass(ModuleRefreshResponseSchema, { success: true, message: 'refreshed' })
  })
  it('accepts with optional output and warnings', () => {
    pass(ModuleRefreshResponseSchema, {
      success: true,
      message: 'done',
      output: 'compiled',
      warnings: 'none',
    })
  })
})

describe('ModuleLibraryResponseSchema', () => {
  it('accepts anything (z.unknown)', () => {
    pass(ModuleLibraryResponseSchema, [])
    pass(ModuleLibraryResponseSchema, { modules: [] })
  })
})

// ─── Settings schemas ─────────────────────────────────────────────────────────

describe('settingsApiKeyBodySchema', () => {
  it('accepts valid body', () => {
    pass(settingsApiKeyBodySchema, { key: 'OPENAI_API_KEY', value: 'sk-xxx' })
  })
})

describe('SettingsApiKeyStatusSchema', () => {
  it('accepts a record of statuses', () => {
    pass(SettingsApiKeyStatusSchema, {
      OPENAI_API_KEY: { configured: true, masked: 'sk-****' },
    })
  })
  it('accepts null masked', () => {
    pass(SettingsApiKeyStatusSchema, {
      OPENAI_API_KEY: { configured: false, masked: null },
    })
  })
})

describe('SettingsApiKeySaveResponseSchema', () => {
  it('accepts minimal form', () => pass(SettingsApiKeySaveResponseSchema, { success: true }))
  it('accepts with deleted and masked', () => {
    pass(SettingsApiKeySaveResponseSchema, { success: true, deleted: true, masked: 'sk-****' })
  })
})

describe('settingsProviderModelsQuerySchema', () => {
  it('accepts valid provider', () => {
    pass(settingsProviderModelsQuerySchema, { provider: 'openai' })
  })
})

describe('SettingsProviderModelsSchema', () => {
  it('accepts live source', () => {
    pass(SettingsProviderModelsSchema, {
      provider: 'openai',
      source: 'live',
      models: [{ id: 'gpt-4', label: 'GPT-4' }],
    })
  })
  it('accepts unavailable source with empty models', () => {
    pass(SettingsProviderModelsSchema, { provider: 'anthropic', source: 'unavailable', models: [] })
  })
  it('rejects unknown source', () => {
    fail(SettingsProviderModelsSchema, { provider: 'x', source: 'cached', models: [] })
  })
})

describe('SettingsGithubStatusSchema', () => {
  it('accepts valid status', () => {
    pass(SettingsGithubStatusSchema, { hasToken: true, repoOwner: 'me', repoName: 'ari' })
  })
})

describe('settingsGithubBodySchema', () => {
  it('accepts empty body (all optional)', () => pass(settingsGithubBodySchema, {}))
  it('accepts full body', () => {
    pass(settingsGithubBodySchema, {
      githubToken: 'ghp_xxx',
      githubRepoOwner: 'me',
      githubRepoName: 'ari',
      clearToken: false,
    })
  })
})

describe('SettingsStorageInfoSchema', () => {
  it('accepts valid info', () => {
    pass(SettingsStorageInfoSchema, {
      provider: 'filesystem',
      providerLabel: 'Local Filesystem',
      source: 'default',
      envVars: [{ name: 'ARI_STORAGE_PROVIDER', set: false, required: false }],
    })
  })
  it('rejects unknown source', () => {
    fail(SettingsStorageInfoSchema, {
      provider: 's3',
      providerLabel: 'S3',
      source: 'config',
      envVars: [],
    })
  })
})

// ─── Storage schemas ──────────────────────────────────────────────────────────

describe('storageUploadFormSchema', () => {
  it('accepts bucket and file', () => {
    pass(storageUploadFormSchema, { bucket: 'avatars', file: new Uint8Array() })
  })
})

describe('StorageUploadResponseSchema', () => {
  it('accepts path and name', () => {
    pass(StorageUploadResponseSchema, { path: 'avatars/1234-photo.jpg', name: '1234-photo.jpg' })
  })
})

describe('storageListQuerySchema', () => {
  it('accepts bucket only', () => pass(storageListQuerySchema, { bucket: 'docs' }))
  it('accepts with limit and offset', () => {
    pass(storageListQuerySchema, { bucket: 'docs', limit: '50', offset: '0' })
  })
  it('rejects limit below 1', () => fail(storageListQuerySchema, { bucket: 'docs', limit: '0' }))
  it('rejects limit above 500', () => {
    fail(storageListQuerySchema, { bucket: 'docs', limit: '501' })
  })
  it('rejects negative offset', () => {
    fail(storageListQuerySchema, { bucket: 'docs', offset: '-1' })
  })
})

describe('StorageListResponseSchema', () => {
  it('accepts files and total', () => {
    pass(StorageListResponseSchema, { files: [], total: 0 })
  })
})

describe('storageDeleteSchema', () => {
  it('accepts bucket and filename', () => {
    pass(storageDeleteSchema, { bucket: 'docs', filename: 'report.pdf' })
  })
})

// ─── System / telemetry schemas ───────────────────────────────────────────────

describe('DbModeResponseSchema', () => {
  it('accepts known modes', () => {
    for (const mode of ['postgres', 'supabaselocal', 'supabasecloud']) {
      pass(DbModeResponseSchema, { mode })
    }
  })
  it('accepts arbitrary string (union with z.string())', () => {
    pass(DbModeResponseSchema, { mode: 'custom-mode' })
  })
})

describe('TelemetryResponseSchema', () => {
  it('accepts true and false', () => {
    pass(TelemetryResponseSchema, { telemetryEnabled: true })
    pass(TelemetryResponseSchema, { telemetryEnabled: false })
  })
})

describe('updateTelemetrySchema', () => {
  it('accepts enabled: true', () => pass(updateTelemetrySchema, { enabled: true }))
  it('rejects missing enabled', () => fail(updateTelemetrySchema, {}))
})

describe('TestConnectionResponseSchema', () => {
  it('accepts { success: true }', () => pass(TestConnectionResponseSchema, { success: true }))
  it('accepts with optional fields', () => {
    pass(TestConnectionResponseSchema, {
      success: false,
      status: 503,
      statusText: 'Service Unavailable',
      error: 'timeout',
    })
  })
})

describe('ProjectDirResponseSchema', () => {
  it('accepts a valid response', () => {
    pass(ProjectDirResponseSchema, {
      dir: '/app',
      dbMode: 'postgres',
      envFileExists: true,
      hasDatabaseUrl: true,
      localSupabase: {
        detected: false,
        envFileExists: false,
        hasUrl: false,
        hasKeys: false,
        hasDatabaseUrl: false,
      },
    })
  })
})

// ─── Theme schemas ────────────────────────────────────────────────────────────

describe('themeColorsSchema', () => {
  it('accepts the required color keys', () => {
    pass(themeColorsSchema, { background: '0 0% 100%', foreground: '0 0% 0%' })
  })
  it('passes through extra color keys', () => {
    const result = themeColorsSchema.parse({
      background: '0 0% 100%',
      foreground: '0 0% 0%',
      custom: 'extra',
    })
    expect((result as Record<string, unknown>).custom).toBe('extra')
  })
})

const validCustomTheme = {
  id: 'my-theme',
  name: 'My Theme',
  category: 'dark' as const,
  colors: { background: '0 0% 4%', foreground: '0 0% 95%' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

describe('customThemeSchema', () => {
  it('accepts a valid custom theme', () => pass(customThemeSchema, validCustomTheme))
  it('rejects unknown category', () => {
    fail(customThemeSchema, { ...validCustomTheme, category: 'system' })
  })
})

describe('ThemeSettingsSchema', () => {
  it('accepts valid theme settings', () => {
    pass(ThemeSettingsSchema, {
      activeThemeId: 'dark',
      activeFont: 'dm-sans',
      customThemes: [],
      sidebarView: 'default',
    })
  })
  it('rejects unknown sidebarView', () => {
    fail(ThemeSettingsSchema, {
      activeThemeId: 'dark',
      activeFont: 'dm-sans',
      customThemes: [],
      sidebarView: 'mini',
    })
  })
})

describe('updateThemeSchema', () => {
  it('accepts empty body', () => pass(updateThemeSchema, {}))
  it('accepts partial update', () => {
    pass(updateThemeSchema, { activeThemeId: 'dark' })
  })
  it('accepts sidebarView compressed', () => {
    pass(updateThemeSchema, { sidebarView: 'compressed' })
  })
})

// ─── User preferences schemas ─────────────────────────────────────────────────

describe('UserPreferencesSchema', () => {
  it('accepts a valid user preferences row', () => {
    pass(UserPreferencesSchema, {
      id: 'pref-1',
      user_id: 'u1',
      name: 'Alice',
      email: 'a@b.com',
      title: 'Engineer',
      company_name: 'Acme',
      country: 'US',
      city: 'NYC',
      linkedin_url: 'https://linkedin.com/in/alice',
      timezone: 'America/New_York',
    })
  })
  it('accepts nullable fields as null', () => {
    pass(UserPreferencesSchema, {
      id: null,
      user_id: 'u1',
      name: null,
      email: null,
      title: null,
      company_name: null,
      country: null,
      city: null,
      linkedin_url: null,
      timezone: 'UTC',
    })
  })
  it('passes through extra keys', () => {
    const result = UserPreferencesSchema.parse({
      id: null,
      user_id: 'u1',
      name: null,
      email: null,
      title: null,
      company_name: null,
      country: null,
      city: null,
      linkedin_url: null,
      timezone: 'UTC',
      extra_field: 'kept',
    })
    expect((result as Record<string, unknown>).extra_field).toBe('kept')
  })
})

describe('updateUserPreferencesSchema', () => {
  it('accepts empty body (all optional)', () => pass(updateUserPreferencesSchema, {}))
  it('accepts partial update', () => {
    pass(updateUserPreferencesSchema, { name: 'Bob', city: null })
  })
  it('rejects timezone longer than 50 chars', () => {
    fail(updateUserPreferencesSchema, { timezone: 'a'.repeat(51) })
  })
  it('accepts timezone at max length', () => {
    pass(updateUserPreferencesSchema, { timezone: 'a'.repeat(50) })
  })
})
