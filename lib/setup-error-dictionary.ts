import type { BootstrapStatus } from "@/lib/types/bootstrap"

export type SetupErrorCode =
  | "role_missing"
  | "connection_refused"
  | "auth_failed"
  | "permission_denied"
  | "no_database"
  | "transient"
  | "unknown"

export interface SetupErrorAction {
  heading: string
  body: string
}

export interface SetupErrorExplanation {
  code: SetupErrorCode
  title: string
  summary: string
  diagnosis: string
  actions: SetupErrorAction[]
  retryable: boolean
  reconfigurable: boolean
}

const COMMON_TITLE = "Database setup didn't finish"
const SAFE_SUMMARY = "ARI couldn't install its schema into your database. Your data is safe — nothing was changed."

const ROLE_MISSING: SetupErrorExplanation = {
  code: "role_missing",
  title: COMMON_TITLE,
  summary: SAFE_SUMMARY,
  diagnosis:
    "A SQL statement referenced a database role that doesn't exist on this server — typically `anon`, `authenticated`, or `service_role` (Supabase-managed roles). " +
    "ARI supports plain Postgres, local Supabase, and Supabase Cloud, so this usually means a module's SQL assumes Supabase roles and is running on plain Postgres. " +
    "The core schema may still be installed correctly; clicking Retry often succeeds.",
  actions: [
    {
      heading: "Try again",
      body: "Click Retry — the failing statement may be the only one left, and the rest of the install likely committed.",
    },
    {
      heading: "Switch database modes",
      body: "If retrying keeps failing, you can move to a Supabase backend by updating `ARI_DB_MODE` and `DATABASE_URL` in `.env.local`, then restarting the dev server.",
    },
    {
      heading: "Report it",
      body: "If neither works, copy the raw error below and open an issue — the offending SQL statement should be made mode-agnostic.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

const CONNECTION_REFUSED: SetupErrorExplanation = {
  code: "connection_refused",
  title: "Can't reach the database",
  summary: "ARI couldn't connect to the database at the address in `DATABASE_URL`.",
  diagnosis:
    "The host might be down, the port might be wrong, or the connection string in `.env.local` might be incorrect. " +
    "If you're using the bundled local Supabase, it might not be running.",
  actions: [
    {
      heading: "Check Supabase status",
      body: "Run `./ari status` to see whether the local Supabase containers are up. If not, run `./ari start`.",
    },
    {
      heading: "Verify your connection string",
      body: "Open `.env.local` and confirm `DATABASE_URL` points at the right host and port. Restart the dev server after edits.",
    },
    {
      heading: "Try again",
      body: "Once the database is reachable, click Retry.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

const AUTH_FAILED: SetupErrorExplanation = {
  code: "auth_failed",
  title: "Database rejected the credentials",
  summary: "Postgres refused the username or password in your `DATABASE_URL`.",
  diagnosis:
    "The connection string in `.env.local` reached the database, but the credentials were rejected. " +
    "This usually means a wrong password, a wrong username, or that the database expects different authentication.",
  actions: [
    {
      heading: "Double-check `DATABASE_URL`",
      body: "Confirm the username and password in `.env.local` match what your database expects.",
    },
    {
      heading: "Restart the dev server",
      body: "Env vars are read at startup — changes to `.env.local` only take effect after a restart.",
    },
    {
      heading: "Try again",
      body: "After fixing the credentials, click Retry.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

const PERMISSION_DENIED: SetupErrorExplanation = {
  code: "permission_denied",
  title: COMMON_TITLE,
  summary: "The database user doesn't have permission to install ARI's schema.",
  diagnosis:
    "The role ARI is connecting as can't create tables, schemas, or grant privileges. " +
    "ARI's setup script needs broad permissions — typically a superuser-equivalent role like `postgres` or Supabase's `service_role`.",
  actions: [
    {
      heading: "Connect as a superuser",
      body: "Update `DATABASE_URL` in `.env.local` to use a role with sufficient privileges (e.g. `postgres`).",
    },
    {
      heading: "Run setup SQL manually",
      body: "If you can't change roles, run `lib/db/setup.sql` directly against the database with admin credentials, then click Retry.",
    },
    {
      heading: "Try again",
      body: "Once permissions are sorted, click Retry.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

const NO_DATABASE: SetupErrorExplanation = {
  code: "no_database",
  title: "No database is configured",
  summary: "ARI couldn't find a `DATABASE_URL` to connect to.",
  diagnosis:
    "Either `DATABASE_URL` is missing from `.env.local`, or it's set but the dev server hasn't picked it up yet. " +
    "Env vars are read at startup, so changes require a restart.",
  actions: [
    {
      heading: "Set `DATABASE_URL`",
      body: "Use Reconfigure to walk through the setup wizard, or edit `.env.local` directly.",
    },
    {
      heading: "Restart the dev server",
      body: "After editing `.env.local`, restart `pnpm dev` so the new env vars are picked up.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

const TRANSIENT: SetupErrorExplanation = {
  code: "transient",
  title: COMMON_TITLE,
  summary: SAFE_SUMMARY,
  diagnosis:
    "Setup failed for an unrecognized reason. This sometimes happens when the database is briefly unavailable or under heavy load. " +
    "The raw error is available below.",
  actions: [
    {
      heading: "Try again",
      body: "Click Retry — transient errors usually clear on a second attempt.",
    },
    {
      heading: "If it keeps failing",
      body: "Copy the raw error below and report it. The Postgres error code and message help us add a more specific explanation.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

const UNKNOWN: SetupErrorExplanation = {
  code: "unknown",
  title: "Something went wrong",
  summary: "We don't have details about what failed.",
  diagnosis:
    "This page was reached without a specific error context. If you got here by mistake, head back to sign in. " +
    "Otherwise, click Retry to attempt setup again.",
  actions: [
    {
      heading: "Try setup again",
      body: "Click Retry to re-run the install.",
    },
    {
      heading: "Reconfigure",
      body: "Open the setup wizard to update database settings.",
    },
  ],
  retryable: true,
  reconfigurable: true,
}

export function classifyBootstrapError(
  status: BootstrapStatus | string | undefined,
  rawMessage: string | undefined,
  pgCode: string | undefined,
): SetupErrorExplanation {
  if (status === "no_database") return NO_DATABASE

  const message = (rawMessage ?? "").toLowerCase()

  if (
    pgCode === "42704" &&
    message.includes("role") &&
    message.includes("does not exist")
  ) {
    return ROLE_MISSING
  }

  if (pgCode === "42501" || message.includes("permission denied")) {
    return PERMISSION_DENIED
  }

  if (
    pgCode === "28P01" ||
    pgCode === "28000" ||
    message.includes("password authentication failed") ||
    message.includes("authentication failed")
  ) {
    return AUTH_FAILED
  }

  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("etimedout") ||
    message.includes("connection refused") ||
    message.includes("could not connect") ||
    message.includes("connection terminated")
  ) {
    return CONNECTION_REFUSED
  }

  if (status === "install_failed" || status === "error") {
    return TRANSIENT
  }

  return UNKNOWN
}
