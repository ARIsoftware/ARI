export const POLAR_ORGANIZATION_ID = 'b1e4ddc2-774b-4bfb-aedd-5ffb0f67e8e3'

/**
 * Pinned Polar API version (https://polar.sh/docs/api-reference/versioning).
 * Bump after checking the release notes for the fields the license route reads.
 */
export const POLAR_API_VERSION = '2026-04'

const VALIDATE_URL = 'https://api.polar.sh/v1/customer-portal/license-keys/validate'

function postValidate(key: string, version?: string): Promise<Response> {
  return fetch(VALIDATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(version ? { 'Polar-Version': version } : {}),
    },
    body: JSON.stringify({ key, organization_id: POLAR_ORGANIZATION_ID }),
  })
}

/**
 * Polar echoes the version it served in a `polar-version` response header — including on a
 * genuine key-not-found 404. A 404 without that header means the version itself was rejected.
 */
export function isPolarVersionRejected(response: Response): boolean {
  return response.status === 404 && !response.headers.get('polar-version')
}

/**
 * Validates a license key against Polar on the pinned API version. Polar removes old versions
 * (~9 months after release), and self-hosted installs may not update in time — so when the
 * pinned version is gone, retry once unpinned rather than reporting every key as invalid.
 */
export async function validatePolarLicenseKey(key: string): Promise<Response> {
  const response = await postValidate(key, POLAR_API_VERSION)
  if (!isPolarVersionRejected(response)) return response

  console.warn(
    `[polar] API version ${POLAR_API_VERSION} was rejected — retrying unpinned. Update ARI to pick up a supported version.`,
  )
  return postValidate(key)
}
