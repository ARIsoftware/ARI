/**
 * Tests for lib/health/module-probe.ts — candidate ordering and the
 * "this route just wants parameters" classifier used by the /health
 * per-module fetch probes.
 */
import { describe, it, expect } from 'vitest'
import { isParameterValidationError, probeCandidates } from '@/lib/health/module-probe'

const route = (path: string, methods: string[] = ['GET']) => ({
  path,
  fullPath: `/api/modules/m/${path}`.replace(/\/$/, ''),
  methods,
})

describe('probeCandidates', () => {
  it('lists static GET routes first (shallowest, then by name), parameterised ones last', () => {
    const candidates = probeCandidates([
      route('tickers/[id]'),
      route('tickers'),
      route('settings'),
      route('quotes'),
      route('deep/nested/list'),
      route('[id]'),
    ])
    expect(candidates).toEqual([
      '/api/modules/m/quotes',
      '/api/modules/m/settings',
      '/api/modules/m/tickers',
      '/api/modules/m/deep/nested/list',
      '/api/modules/m/[id]',
      '/api/modules/m/tickers/[id]',
    ])
  })

  it('puts the module root route (api/route.ts) first', () => {
    expect(probeCandidates([route('data'), route('')])).toEqual([
      '/api/modules/m',
      '/api/modules/m/data',
    ])
  })

  it('ignores routes without GET and returns [] when none qualify', () => {
    expect(probeCandidates([route('sync', ['POST']), route('upload', ['PUT', 'DELETE'])])).toEqual(
      [],
    )
    expect(probeCandidates([])).toEqual([])
    expect(probeCandidates([route('a', ['POST']), route('b', ['GET', 'POST'])])).toEqual([
      '/api/modules/m/b',
    ])
  })

  it('does not mutate the input', () => {
    const routes = [route('b'), route('a')]
    probeCandidates(routes)
    expect(routes.map((r) => r.path)).toEqual(['b', 'a'])
  })
})

describe('isParameterValidationError', () => {
  it("matches the validators' 400 bodies only", () => {
    expect(isParameterValidationError(400, { error: 'Invalid query parameters' })).toBe(true)
    expect(isParameterValidationError(400, { error: 'Invalid path parameters', details: {} })).toBe(
      true,
    )
    expect(isParameterValidationError(400, { error: 'invalid QUERY parameters' })).toBe(true)
  })

  it('is false for other statuses, other 400s, and non-JSON bodies', () => {
    expect(isParameterValidationError(200, { error: 'Invalid query parameters' })).toBe(false)
    expect(isParameterValidationError(422, { error: 'Invalid query parameters' })).toBe(false)
    expect(isParameterValidationError(400, { error: 'Invalid request body' })).toBe(false)
    expect(isParameterValidationError(400, { error: 'Invalid query parameters: symbols' })).toBe(
      false,
    )
    expect(isParameterValidationError(400, { message: 'Invalid query parameters' })).toBe(false)
    expect(isParameterValidationError(400, null)).toBe(false)
    expect(isParameterValidationError(400, 'Invalid query parameters')).toBe(false)
    expect(isParameterValidationError(400, { error: 42 })).toBe(false)
  })
})
