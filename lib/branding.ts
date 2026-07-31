// Shared login-screen branding constraints — imported by BOTH the server route
// (app/api/settings/branding) and the client card (settings → Themes) so the
// 8MB size cap and the accepted image types can never drift between the two.

export const LOGIN_LOGO_MAX_MB = 8
export const LOGIN_LOGO_MAX_BYTES = LOGIN_LOGO_MAX_MB * 1024 * 1024

export const LOGIN_LOGO_ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

/** Human-readable list for UI copy and error messages. */
export const LOGIN_LOGO_TYPE_LABEL = 'PNG, JPEG, WebP, or GIF'

/** Value for an <input type="file" accept="..."> attribute. */
export const LOGIN_LOGO_ACCEPT = LOGIN_LOGO_ALLOWED_TYPES.join(',')

/** True when a (lower-cased) MIME type is an accepted logo format. */
export function isAllowedLogoType(mimeType: string): boolean {
  return (LOGIN_LOGO_ALLOWED_TYPES as readonly string[]).includes(mimeType.toLowerCase())
}
