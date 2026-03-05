# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router routes (`page.tsx`, `layout.tsx`) and feature folders (e.g., `tasks/`, `dashboard/`); key flows live in `assist/` (AI copilot), `backups/` (admin backup tooling), and `tests/` (Supabase diagnostics).
- `components/`: Reusable React components; `components/ui/` contains shadcn-style primitives.
- `lib/`: Domain and data helpers (Supabase clients, feature services like `tasks.ts`, `fitness.ts`).
- `hooks/`: Reusable React hooks.
- `public/`: Static assets.
- `styles/`: Global styles; Tailwind configured via `tailwind.config.ts`.
- `scripts/` and `supabase/migrations/`: SQL utilities and RLS migrations.
- Root config: `next.config.mjs`, `middleware.ts`, `tsconfig.json`.
- `src/`: Server-only helpers that should not ship to the client bundle (e.g., `src/lib/locks.ts`).

## Key Features & Services
- `app/assist` + `app/api/chat`: Chat interface that streams completions through OpenAI (`gpt-4o-mini`) using `lib/task-context.ts` for personalized task/shipment context.
- `app/backups` + `app/api/backup/*`: Backup management UI backed by service-role Supabase calls; guarded by `lib/admin-helpers.ts` and requires `ALLOW_BACKUP_OPERATIONS` in production.
- `app/tests`: Client-only diagnostic suite that exercises Supabase connectivity, auth, and core data endpoints for rapid troubleshooting.

## Build, Test, and Development Commands
- Install: `pnpm install` (pnpm is preferred; lockfile present).
- Develop: `pnpm dev` (runs Next.js locally).
- Turbo Development: Enable Next.js Turbopack for faster local development `pnpm next dev --turbo`
- Lint: `pnpm lint` (Next.js ESLint rules).
- Build: `pnpm build` (production bundle).
- Start: `pnpm start` (serve the build).
- Node: use Node 18+.

## Coding Style & Naming Conventions
- Language: TypeScript with React Server Components by default. Add `"use client"` when needed.
- Files: kebab-case for filenames (`focus-timer.tsx`), PascalCase for component names.
- Imports: prefer relative within a feature; shared logic lives in `lib/`; project-wide alias `@/*` resolves from the repo root (see `tsconfig.json`).
- Styling: Tailwind CSS utility-first; keep classes readable and grouped by function.
- Linting: fix warnings before opening a PR.

## Tooling Notes
- `next.config.mjs` ignores TypeScript and ESLint errors during builds; run `pnpm lint` and address type errors locally before pushing.
- Node 18+ required; Supabase SDK usage assumes edge-compatible fetch implementations.

## Testing Guidelines
- No test runner is configured yet. Prefer Vitest + React Testing Library for unit/UI tests; Playwright for E2E.
- Name tests `*.test.ts` or `*.test.tsx` colocated with source or under `__tests__/`.
- Aim for critical-path coverage (auth flows, RLS-sensitive data ops).

## Commit & Pull Request Guidelines
- Commits: short, imperative summaries (e.g., "Add task reorder logic"). Use emojis sparingly; tag critical security fixes with "🔒" (seen in history).
- PRs: include a clear description, linked issues, screenshots for UI changes, and notes for SQL migrations (include rollback path if applicable).
- Pre-submit: run `pnpm lint` and ensure the app boots with `pnpm dev`.

## Security & Configuration Tips
- Secrets: keep in `.env.local`; never commit real keys. Use `.env.example` as a template.
- Supabase: maintain RLS. When changing policies, include scripts under `supabase/migrations/` and consider `scripts/check-all-rls-policies.sql` for validation.

## Environment & Secrets
- Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use new publishable key format `sb_publishable_...`), and `OPENAI_API_KEY` (chat route); server-only `SUPABASE_SECRET_KEY` powers backup exports/imports.
- Optional: `ADMIN_USER_IDS` (comma-separated UUIDs) extends admin access; `ALLOW_BACKUP_OPERATIONS=true` must be set to run backups in production.
- Keep service-role keys server-side—client code should rely on authenticated Supabase clients created via `lib/auth-helpers.ts` or `lib/supabase-auth.ts`.
- **Note**: Use Supabase's new publishable key format (`sb_publishable_...`) instead of legacy JWT anon keys.

## API & Data Access Patterns
- Use `lib/auth-helpers.ts` to obtain authenticated Supabase clients with cookie-based session handling for RSC/API routes.
- Validate requests with `lib/api-helpers.ts` and schema definitions in `lib/validation.ts` before touching the database.
- Favor API routes for privileged workflows; avoid exposing service-role credentials to the browser and lean on RLS to scope data per user.


## Template .env.local file for local development:
To run this app locally, you must setup a .env.local file and store it in your root directory. .env.local files typically should not be commited to GIT. Here is a .env.local file template you can use. Fill in the environment variables:

### Start of .env.local file

OPENAI_API_KEY=
POSTGRES_URL=
POSTGRES_PRISMA_URL=
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
POSTGRES_URL_NON_POOLING=
SUPABASE_JWT_SECRET=
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Use new publishable key format: sb_publishable_...
POSTGRES_PASSWORD=
POSTGRES_DATABASE=
SUPABASE_ANON_KEY=  # Use new publishable key format: sb_publishable_...
POSTGRES_HOST=
SUPABASE_SECRET_KEY=  # Service role key for server-side operations

### End of .env.local file

