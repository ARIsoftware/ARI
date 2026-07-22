import { describe, it, expect, vi, afterEach } from 'vitest'
import { redactProviderError, withProviderRedaction } from '@/modules-core/documents/lib/providers/errors'

describe('redactProviderError', () => {
  it('builds a stable code from provider + op', () => {
    const result = redactProviderError('s3', 'upload', new Error('some leak'))
    expect(result.code).toBe('s3_upload_failed')
  })

  it('preserves provider and op in log', () => {
    const result = redactProviderError('r2', 'delete', new Error('oops'))
    expect(result.log.provider).toBe('r2')
    expect(result.log.op).toBe('delete')
  })

  it('extracts AWS SDK $metadata.httpStatusCode as status', () => {
    const err = { $metadata: { httpStatusCode: 403 }, name: 'AccessDenied' }
    const result = redactProviderError('s3', 'download', err)
    expect(result.log.status).toBe(403)
    expect(result.log.name).toBe('AccessDenied')
  })

  it('extracts statusCode as status when $metadata is absent', () => {
    const err = { statusCode: 404, name: 'NotFound' }
    const result = redactProviderError('r2', 'exists', err)
    expect(result.log.status).toBe(404)
    expect(result.log.name).toBe('NotFound')
  })

  it('prefers $metadata.httpStatusCode over statusCode', () => {
    const err = { $metadata: { httpStatusCode: 500 }, statusCode: 404, name: 'Error' }
    const result = redactProviderError('supabase', 'sign', err)
    expect(result.log.status).toBe(500)
  })

  it('status is undefined when no status fields present', () => {
    const result = redactProviderError('local', 'upload', new Error('plain error'))
    expect(result.log.status).toBeUndefined()
  })

  it('name is undefined when error has no name', () => {
    const result = redactProviderError('local', 'delete', { message: 'no name field' })
    expect(result.log.name).toBeUndefined()
  })

  it('handles null/undefined error gracefully', () => {
    const result = redactProviderError('s3', 'upload', null)
    expect(result.code).toBe('s3_upload_failed')
    expect(result.log.status).toBeUndefined()
  })

  it('works for all provider + op combos', () => {
    const providers = ['supabase', 'r2', 's3', 'local'] as const
    const ops = ['upload', 'download', 'sign', 'delete', 'exists'] as const
    for (const p of providers) {
      for (const op of ops) {
        const result = redactProviderError(p, op, new Error('x'))
        expect(result.code).toBe(`${p}_${op}_failed`)
      }
    }
  })
})

describe('withProviderRedaction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the fn result on success', async () => {
    const result = await withProviderRedaction('s3', 'upload', async () => 'success')
    expect(result).toBe('success')
  })

  it('logs redacted error and rethrows stable code on failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      withProviderRedaction('r2', 'delete', async () => {
        throw Object.assign(new Error('leak: bucket/user/file'), { name: 'NoSuchKey', statusCode: 404 })
      })
    ).rejects.toThrow('r2_delete_failed')

    expect(consoleSpy).toHaveBeenCalledOnce()
    const [, logObj] = consoleSpy.mock.calls[0]
    expect(logObj.provider).toBe('r2')
    expect(logObj.op).toBe('delete')
    expect(logObj.name).toBe('NoSuchKey')
    // The raw message (with the "leak") should NOT appear in the log object
    expect(JSON.stringify(logObj)).not.toContain('leak')
  })

  it('passes through the resolved value type correctly', async () => {
    const result = await withProviderRedaction('local', 'download', async () => Buffer.from('data'))
    expect(result).toBeInstanceOf(Buffer)
  })
})
