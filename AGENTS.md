# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router routes (`page.tsx`, `layout.tsx`) and feature folders (e.g., `tasks/`, `dashboard/`).
- `components/`: Reusable React components; `components/ui/` contains shadcn-style primitives.
- `lib/`: Domain and data helpers (Supabase clients, feature services like `tasks.ts`, `fitness.ts`).
- `hooks/`: Reusable React hooks.
- `public/`: Static assets.
- `styles/`: Global styles; Tailwind configured via `tailwind.config.ts`.
- `scripts/` and `supabase/migrations/`: SQL utilities and RLS migrations.
- Root config: `next.config.mjs`, `middleware.ts`, `tsconfig.json`.

## Build, Test, and Development Commands
- Install: `pnpm install` (pnpm is preferred; lockfile present).
- Develop: `pnpm dev` (runs Next.js locally).
- Lint: `pnpm lint` (Next.js ESLint rules).
- Build: `pnpm build` (production bundle).
- Start: `pnpm start` (serve the build).
- Node: use Node 18+.

## Coding Style & Naming Conventions
- Language: TypeScript with React Server Components by default. Add `"use client"` when needed.
- Files: kebab-case for filenames (`focus-timer.tsx`), PascalCase for component names.
- Imports: prefer relative within a feature; shared logic lives in `lib/`.
- Styling: Tailwind CSS utility-first; keep classes readable and grouped by function.
- Linting: fix warnings before opening a PR.

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
