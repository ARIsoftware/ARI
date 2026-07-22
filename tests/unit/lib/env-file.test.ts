import { describe, it, expect } from 'vitest'
import { formatEnvValue, upsertEnvVars, renderEnvFile } from '@/lib/env-file'

// ─── formatEnvValue ─────────────────────────────────────────────────────────

describe('formatEnvValue', () => {
  it('returns empty string for empty input', () => {
    expect(formatEnvValue('')).toBe('')
  })

  it('returns bare value for simple alphanumeric strings', () => {
    expect(formatEnvValue('hello123')).toBe('hello123')
  })

  it('returns bare value for URL-safe characters', () => {
    expect(formatEnvValue('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('returns bare value for strings with allowed symbols', () => {
    expect(formatEnvValue('abc_def-ghi.jkl/@')).toBe('abc_def-ghi.jkl/@')
  })

  it('wraps value with spaces in double quotes', () => {
    const result = formatEnvValue('hello world')
    expect(result).toBe('"hello world"')
  })

  it('wraps value with # in double quotes', () => {
    const result = formatEnvValue('abc#def')
    expect(result).toBe('"abc#def"')
  })

  it('escapes backslashes inside quoted values', () => {
    const result = formatEnvValue('path\\to\\file')
    expect(result).toBe('"path\\\\to\\\\file"')
  })

  it('escapes double quotes inside quoted values', () => {
    const result = formatEnvValue('say "hello"')
    expect(result).toBe('"say \\"hello\\""')
  })

  it('wraps unicode values in quotes', () => {
    const result = formatEnvValue('café')
    expect(result).toMatch(/^".*"$/)
  })

  it('wraps value with equals sign in quotes', () => {
    const result = formatEnvValue('key=value')
    expect(result).toBe('"key=value"')
  })
})

// ─── upsertEnvVars ──────────────────────────────────────────────────────────

describe('upsertEnvVars', () => {
  it('updates an existing key in place', () => {
    const src = 'FOO=old\nBAR=keep\n'
    const result = upsertEnvVars(src, { FOO: 'new' })
    expect(result).toContain('FOO=new')
    expect(result).toContain('BAR=keep')
    expect(result).not.toContain('FOO=old')
  })

  it('appends a new key that does not exist', () => {
    const src = 'FOO=old\n'
    const result = upsertEnvVars(src, { NEW_KEY: 'val' })
    expect(result).toContain('FOO=old')
    expect(result).toContain('NEW_KEY=val')
  })

  it('removes a key when value is null', () => {
    const src = 'FOO=old\nBAR=keep\n'
    const result = upsertEnvVars(src, { FOO: null })
    expect(result).not.toContain('FOO')
    expect(result).toContain('BAR=keep')
  })

  it('ignores null for a key that does not exist', () => {
    const src = 'BAR=keep\n'
    const result = upsertEnvVars(src, { MISSING: null })
    expect(result).toBe(src)
  })

  it('handles empty source string', () => {
    const result = upsertEnvVars('', { FOO: 'bar' })
    expect(result).toContain('FOO=bar')
  })

  it('preserves comment lines', () => {
    const src = '# comment\nFOO=old\n'
    const result = upsertEnvVars(src, { FOO: 'new' })
    expect(result).toContain('# comment')
    expect(result).toContain('FOO=new')
  })

  it('formats values that need quoting', () => {
    const src = 'FOO=old\n'
    const result = upsertEnvVars(src, { FOO: 'has space' })
    expect(result).toContain('FOO="has space"')
  })

  it('always ends with a newline', () => {
    const result = upsertEnvVars('FOO=a', { BAR: 'b' })
    expect(result.endsWith('\n')).toBe(true)
  })

  it('handles multiple updates at once', () => {
    const src = 'A=1\nB=2\nC=3\n'
    const result = upsertEnvVars(src, { A: 'new_a', C: null, D: 'new_d' })
    expect(result).toContain('A=new_a')
    expect(result).toContain('B=2')
    expect(result).not.toContain('C=')
    expect(result).toContain('D=new_d')
  })

  it('handles CRLF line endings', () => {
    const src = 'FOO=old\r\nBAR=keep\r\n'
    const result = upsertEnvVars(src, { FOO: 'new' })
    expect(result).toContain('FOO=new')
    expect(result).toContain('BAR=keep')
  })

  it('trims trailing blank lines before appending new keys', () => {
    const src = 'FOO=old\n\n\n'
    const result = upsertEnvVars(src, { NEW: 'val' })
    // Should not have multiple blank lines before the new key
    expect(result).toContain('FOO=old\n\nNEW=val\n')
  })

  it('appends without blank separator when source was only whitespace', () => {
    const result = upsertEnvVars('\n\n', { FOO: 'bar' })
    expect(result).toContain('FOO=bar')
  })
})

// ─── renderEnvFile ───────────────────────────────────────────────────────────

describe('renderEnvFile', () => {
  it('generates postgres mode output', () => {
    const result = renderEnvFile(
      { betterAuthSecret: 'mysecret', databaseUrl: 'postgresql://localhost/ari' },
      { dbMode: 'postgres' },
    )
    expect(result).toContain('ARI_DB_MODE=postgres')
    expect(result).toContain('DATABASE_URL=postgresql://localhost/ari')
    expect(result).not.toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(result).not.toContain('SUPABASE_SECRET_KEY')
  })

  it('generates supabaselocal mode output without DATABASE_URL', () => {
    const result = renderEnvFile({}, { dbMode: 'supabaselocal' })
    expect(result).toContain('ARI_DB_MODE=supabaselocal')
    expect(result).toContain('.env.supabase.local')
    expect(result).not.toContain('DATABASE_URL=')
  })

  it('generates supabaselocal mode output with DATABASE_URL (falls through to cloud branch)', () => {
    // When supabaselocal but dbUrl is provided, it goes to the else (cloud) branch
    const result = renderEnvFile(
      { databaseUrl: 'postgresql://remote/db' },
      { dbMode: 'supabaselocal' },
    )
    expect(result).toContain('DATABASE_URL=postgresql://remote/db')
    expect(result).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('generates supabasecloud mode output', () => {
    const result = renderEnvFile(
      {
        databaseUrl: 'postgresql://cloud/db',
        supabaseUrl: 'https://abc.supabase.co',
        supabaseAnonKey: 'anon-key',
        supabaseSecretKey: 'secret-key',
      },
      { dbMode: 'supabasecloud' },
    )
    expect(result).toContain('ARI_DB_MODE=supabasecloud')
    expect(result).toContain('DATABASE_URL=postgresql://cloud/db')
    expect(result).toContain('NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co')
    expect(result).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=anon-key')
    expect(result).toContain('SUPABASE_SECRET_KEY=secret-key')
  })

  it('generates output without dbMode (fallback to else branch)', () => {
    const result = renderEnvFile({})
    expect(result).not.toContain('ARI_DB_MODE=')
    // Falls through to else (supabasecloud) branch
    expect(result).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('includes admin credentials when both are provided', () => {
    const result = renderEnvFile({
      adminEmail: 'admin@example.com',
      adminPassword: 'supersecretpassword123',
    })
    expect(result).toContain('ARI_FIRST_RUN_ADMIN_EMAIL=admin@example.com')
    expect(result).toContain('ARI_FIRST_RUN_ADMIN_PASSWORD=supersecretpassword123')
  })

  it('omits admin credentials block when only email provided', () => {
    const result = renderEnvFile({ adminEmail: 'admin@example.com' })
    expect(result).not.toContain('ARI_FIRST_RUN_ADMIN_EMAIL')
  })

  it('omits admin credentials block when only password provided', () => {
    const result = renderEnvFile({ adminPassword: 'supersecretpassword123' })
    expect(result).not.toContain('ARI_FIRST_RUN_ADMIN_PASSWORD')
  })

  it('trims whitespace from field values', () => {
    const result = renderEnvFile(
      { betterAuthSecret: '  mysecret  ' },
      { dbMode: 'postgres' },
    )
    expect(result).toContain('BETTER_AUTH_SECRET=mysecret')
  })

  it('treats blank string fields as undefined', () => {
    const result = renderEnvFile({ betterAuthSecret: '   ' }, { dbMode: 'postgres' })
    expect(result).toContain('BETTER_AUTH_SECRET=')
  })

  it('includes resend API key when provided', () => {
    const result = renderEnvFile({ resendApiKey: 're_abc123' })
    expect(result).toContain('RESEND_API_KEY=re_abc123')
  })

  it('includes resend webhook secret when both resend fields provided', () => {
    const result = renderEnvFile({
      resendApiKey: 're_abc123',
      resendWebhookSecret: 'whsec_xyz',
    })
    expect(result).toContain('RESEND_WEBHOOK_SECRET=whsec_xyz')
  })

  it('omits resend block when no API key', () => {
    const result = renderEnvFile({ resendWebhookSecret: 'whsec_xyz' })
    expect(result).not.toContain('RESEND_API_KEY')
    expect(result).not.toContain('RESEND_WEBHOOK_SECRET')
  })

  it('includes standard boilerplate regardless of mode', () => {
    const result = renderEnvFile({}, { dbMode: 'postgres' })
    expect(result).toContain('BETTER_AUTH_URL=http://localhost:3000')
    expect(result).toContain('ALLOW_BACKUP_OPERATIONS=true')
    expect(result).toContain('ARI_LICENSE_KEY=')
    expect(result).toContain('ALLOWED_IPS=')
    expect(result).toContain('devIndicators=false')
  })

  it('uses default postgres DATABASE_URL when not provided', () => {
    const result = renderEnvFile({}, { dbMode: 'postgres' })
    expect(result).toContain('DATABASE_URL=postgresql://localhost:5432/ari')
  })
})
