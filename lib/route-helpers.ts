export const PUBLIC_ROUTE_PREFIXES = ['/sign-in', '/welcome', '/database-error'] as const

export function isPublicPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
