/**
 * Connection derivation for the non-BYPASSRLS app role (`ari_app`).
 *
 * The app role never gets its own connection string: its host / port /
 * database / TLS settings are derived from the privileged `DATABASE_URL`
 * (which stays untouched — `.env.supabase.local` is regenerated on every
 * `./ari start` and the installers rewrite it), and only the login name and
 * password differ. Everything here is pure — no I/O, no env reads — so the
 * derivation is exhaustively unit-testable.
 *
 * Why a discrete config object instead of a rewritten URL: pg's
 * ConnectionParameters does `Object.assign({}, config, parse(connectionString))`,
 * so any `user` / `password` passed alongside a `connectionString` is silently
 * overridden by the URL's own credentials. Building the fields explicitly is
 * the only reliable way to swap the login.
 *
 * Supavisor (Supabase's pooler, `*.pooler.supabase.com`, port 6543 in
 * transaction mode) encodes the tenant in the username — `postgres.<ref>` —
 * so the app role must present itself as `ari_app.<ref>` there while the
 * Postgres role itself is still plain `ari_app`.
 */
import { parse } from 'pg-connection-string'
import type { PoolConfig } from 'pg'
import { sslConfigFor } from '@/lib/db/pool'

/** The Postgres role name. Constant — grants and health checks key on it. */
export const APP_ROLE_NAME = 'ari_app'

/** Supavisor's transaction-mode port. Direct connections use 5432. */
const SUPAVISOR_PORT = 6543

/** Supavisor presents the tenant as `<role>.<projectref>`. */
const TENANT_USER_RE = /^([^.]+)\.([A-Za-z0-9]+)$/

export function isSupavisorPooler(
  host: string | null | undefined,
  port: number | undefined,
): boolean {
  return (host ?? '').includes('pooler.supabase.com') || port === SUPAVISOR_PORT
}

/**
 * Login name the app role must present: plain `ari_app`, or `ari_app.<ref>`
 * when the privileged login is tenant-suffixed AND the endpoint is Supavisor.
 * A dotted username on a non-pooler host is left alone — that is somebody's
 * actual role name, not a tenant encoding.
 */
export function deriveAppLoginName(
  privilegedUser: string | null | undefined,
  host: string | null | undefined,
  port: number | undefined,
): string {
  const tenant = TENANT_USER_RE.exec(privilegedUser ?? '')
  if (tenant && isSupavisorPooler(host, port)) return `${APP_ROLE_NAME}.${tenant[2]}`
  return APP_ROLE_NAME
}

export interface AppConnectionConfig {
  host: string | undefined
  port: number | undefined
  database: string | undefined
  user: string
  password: string
  ssl: false | { rejectUnauthorized: false }
}

/**
 * Discrete pg config for the app role, derived from the privileged URL.
 * Throws (like pg itself would) when the URL cannot be parsed.
 */
export function buildAppPoolConfig(
  databaseUrl: string,
  password: string,
): AppConnectionConfig & PoolConfig {
  const parsed = parse(databaseUrl)
  const rawPort = parsed.port ? Number(parsed.port) : Number.NaN
  const port = Number.isFinite(rawPort) ? rawPort : undefined
  const host = parsed.host ?? undefined
  return {
    host,
    port,
    database: parsed.database ?? undefined,
    user: deriveAppLoginName(parsed.user, host, port),
    password,
    ssl: sslConfigFor(databaseUrl),
  }
}
