import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POLAR_API_VERSION,
  POLAR_ORGANIZATION_ID,
  isPolarVersionRejected,
  validatePolarLicenseKey,
} from '@/lib/polar'

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response('{}', { status, headers })

describe('isPolarVersionRejected', () => {
  it('is true only for a 404 without the polar-version echo header', () => {
    expect(isPolarVersionRejected(res(404))).toBe(true)
    expect(isPolarVersionRejected(res(404, { 'polar-version': POLAR_API_VERSION }))).toBe(false)
    expect(isPolarVersionRejected(res(200))).toBe(false)
    expect(isPolarVersionRejected(res(500))).toBe(false)
  })
})

describe('validatePolarLicenseKey', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the pinned version and returns the response', async () => {
    const ok = res(200, { 'polar-version': POLAR_API_VERSION })
    fetchMock.mockResolvedValueOnce(ok)

    await expect(validatePolarLicenseKey('KEY')).resolves.toBe(ok)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.polar.sh/v1/customer-portal/license-keys/validate')
    expect(init.headers['Polar-Version']).toBe(POLAR_API_VERSION)
    expect(JSON.parse(init.body)).toEqual({ key: 'KEY', organization_id: POLAR_ORGANIZATION_ID })
  })

  it('does not retry a genuine key-not-found 404', async () => {
    const notFound = res(404, { 'polar-version': POLAR_API_VERSION })
    fetchMock.mockResolvedValueOnce(notFound)

    await expect(validatePolarLicenseKey('KEY')).resolves.toBe(notFound)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries unpinned when the pinned version is rejected', async () => {
    const ok = res(200, { 'polar-version': '2027-01' })
    fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(ok)

    await expect(validatePolarLicenseKey('KEY')).resolves.toBe(ok)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('Polar-Version')
    expect(console.warn).toHaveBeenCalledOnce()
  })
})
