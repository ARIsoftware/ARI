/**
 * Helpers for the /health Database tab's per-module "Fetch <module>" probes.
 *
 * Each enabled module gets one probe: a GET against one of its API routes,
 * proving the route authenticates, runs under withRLS() and answers. The page
 * only knows the manifest's route list (path + methods), not which routes
 * need query or path parameters — so instead of guessing one route it walks
 * an ordered candidate list and skips routes that merely ask for input the
 * probe cannot supply.
 */

export interface ProbeRoute {
  /** Route path relative to the module's api/ dir ('' for api/route.ts). */
  path: string
  fullPath: string
  methods: readonly string[]
}

/**
 * GET routes in probe-preference order: static (non-parameterised) routes
 * first, shallowest path first, then by name; parameterised routes last as a
 * final fallback. The runner stops at the first route that does not answer
 * "Invalid query/path parameters".
 */
export function probeCandidates(routes: readonly ProbeRoute[]): string[] {
  const isStatic = (path: string) => !path.includes('[')
  const depth = (path: string) => path.split('/').filter(Boolean).length
  return routes
    .filter((r) => r.methods.includes('GET'))
    .sort(
      (a, b) =>
        Number(isStatic(b.path)) - Number(isStatic(a.path)) ||
        depth(a.path) - depth(b.path) ||
        a.path.localeCompare(b.path),
    )
    .map((r) => r.fullPath)
}

/**
 * A 400 whose body is exactly the validators' "Invalid query parameters" /
 * "Invalid path parameters" — the route ran, authenticated, and wants input
 * the probe did not send. Not a defect; try the next candidate.
 */
export function isParameterValidationError(status: number, body: unknown): boolean {
  if (status !== 400) return false
  const error = (body as { error?: unknown } | null)?.error
  return typeof error === 'string' && /^Invalid (query|path) parameters$/i.test(error)
}
