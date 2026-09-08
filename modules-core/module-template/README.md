# Module Template Module

> **Template Module for ARI Module System**
> Use this as a reference when building your own modules

## Overview

This is a fully-featured example module demonstrating all capabilities of the ARI module system:
- ✅ Main page with authentication + onboarding pattern
- ✅ API routes with Zod validation and OpenAPI registration
- ✅ Database schema with RLS (per-user model, with shared-model instructions)
- ✅ Dashboard widget **and** stat card
- ✅ Settings panel + standalone settings page
- ✅ Sidebar submenu + top bar icon
- ✅ Global provider (app-wide React context)
- ✅ AI provider selection + working `/generate` route
- ✅ File storage (upload route, hooks, example component)
- ✅ Public webhook example (`api/webhook/route.ts.example`)
- ✅ TypeScript types
- ✅ Example unit tests (in `tests/unit/modules-core/module-template/`)
- ✅ Comprehensive documentation

## Features Demonstrated

### 1. **Page Routing**
- Main module page at `/module-template`
- Uses ARI's authentication context
- Follows ARI's design patterns

### 2. **API Routes**
- Full CRUD (`api/data`), settings (`api/settings`), AI generation (`api/generate`), file upload (`api/upload`)
- Authentication validation via `getAuthenticatedUser()`
- Zod schema validation (schemas in `lib/validation.ts`, tagged `.openapi()`)
- One `registry.registerPath()` per verb so every endpoint appears in `/api-docs`, `/settings?tab=api`, and `/health`
- Proper error handling with the shared `{ error, details? }` envelope
- **Do NOT wrap module routes in `withApiLogging`** — that wrapper is for core `app/api/` routes only; the module dispatcher already logs API-key usage
- Every modules-core route is statically checked by `tests/unit/route-security-scan.test.ts`: it must authenticate (or be declared in `publicRoutes`), per-user tables must filter by `user_id`, and inserts must stamp `userId: user.id`

### 3. **Database Integration**
- Custom table: `module_template_entries`
- Drizzle ORM with `withRLS()` helper
- User-specific data isolation at application level
- Table defined in `/lib/db/schema/schema.ts`

### 4. **Dashboard Widget & Stat Card**
- `components/widget.tsx` — larger content-area widget (`dashboard.widgetComponents`)
- `components/stat-card.tsx` — small Quick Overview metric tile (`dashboard.statCards`)
- Both require `"dashboard.widgets": true` in the manifest, share the module's
  TanStack Query cache, and handle loading/error states
- Note: the dashboard deliberately excludes `module-template` from rendering
  (it's a developer demo) — these files are reference implementations

### 5. **Settings Panel**
- Toggle settings
- Text input settings
- Proper state management
- Save/load functionality
- **AI Provider picker** via the shared `AiProviderCard` (see below)
- Rendered by the module's own `app/settings/page.tsx` (linked from the
  sidebar submenu). There is no framework settings registry — a
  `settings.panel` key in `module.json` is ignored, so wire the panel into a
  page yourself as this module does.

### 5a. **AI Provider Selection (shared `AiProviderCard`)**
- The settings panel renders `AiProviderCard` from `@/components/ai-provider-card`
  so the user can choose which AI provider this module should use.
- **Shared, not duplicated:** the card lives once in the core app at
  `components/ai-provider-card.tsx`. Every module imports the same component, so
  updates (new providers, restyling) apply everywhere at once. Do not copy the
  provider grid into a module.
- It is a controlled component — the module stores the choice in its own
  settings as `selectedAiProvider: AiProviderId | null` (see `types/index.ts`).
- It lists only providers configured under Settings → Integrations, and
  auto-selects the provider when exactly one is configured.
- See `docs/MODULES.md` → "AI Providers Card (shared component)" for full usage.

### 6. **File Storage (ARI File Storage System)**
- Example upload endpoint in `api/upload/route.ts`
- Example file upload UI component in `components/file-upload-example.tsx`
- TanStack Query hooks: `useUploadFile()`, `useListFiles()`, `useDeleteFile()`
- Uses the central `/api/storage/` endpoints — no per-module storage setup needed
- See `hooks/use-module-template.ts` for the hook implementations

**Storage configuration:** the active backend is selected by `ARI_STORAGE_PROVIDER`
in `.env.local` (`filesystem` is the default if unset). Provider credentials
(`ARI_S3_*`, `ARI_R2_*`, `ARI_SUPABASE_S3_*`) also live in `.env.local`. Modules
do not configure storage themselves — `getStorageProvider(readStorageConfig())`
returns the right backend automatically. If your module needs provider-aware
behavior, read `process.env.ARI_STORAGE_PROVIDER` directly. (A `storage` block
in `module.json` is inert metadata — enforce size/type limits in your route,
as `api/upload/route.ts` does.)

### 7. **Sidebar Submenu & Top Bar Icon**
- `components/sidebar-submenu.tsx` (manifest `submenu.component`) — sliding
  submenu shown when the sidebar item is clicked; uses `next/link` soft
  navigation so the query cache survives
- `topBarIcon` in `module.json` — declarative form (`icon` + `route` +
  `tooltip`, optional `order`, lower = further left). For an interactive icon
  (like tasks/notepad/focus-timer/music-player), use the alternative
  `topBarIcon.component` form pointing at a custom client component

### 8. **Global Provider (app-wide context)**
- `components/global-provider.tsx` (manifest `globalProvider`) wraps the whole
  app in a React context provider — for state that must outlive the module's
  own pages (e.g. music keeps playing while browsing other routes)
- Receives `{ children, isAuthenticated }`; only mounts for users who have the
  module enabled. The manifest path must exist — a missing file fails the build.

### 9. **Public Webhook (example)**
- `api/webhook/route.ts.example` shows an unauthenticated endpoint with HMAC
  signature verification + rate limiting, and the `publicRoutes` manifest
  declaration it requires. The `.example` suffix keeps it out of the route
  scan — rename to `route.ts` to activate.

### 10. **Unit Tests**
- Example tests in `tests/unit/modules-core/module-template/lib/utils.test.ts`
- Tests always live centrally under `tests/unit/modules-core/<module-id>/`,
  mirroring source paths — never inside the module folder
- Every core module's `lib/**` is inside the ratcheted coverage scope
  (module-template itself is excluded as a scaffold)

## Multi-User: Per-User vs Shared Data

ARI is multi-user. When you create a module, decide whether its content is
**per-user (private)** or **shared (collaborative)** — this template is
**per-user** (each user only sees their own entries), which is the safe default.

| | Per-user (private) — *default* | Shared (collaborative) |
|---|---|---|
| Examples | fitness, health, journal, notes | tasks, contacts, documents |
| `schema.sql` SELECT/UPDATE/DELETE | `USING (user_id = current_setting('app.current_user_id'))` | `USING (app.can_access_shared())` |
| `schema.sql` INSERT | `WITH CHECK (user_id = current_setting(...))` | *same* — always stamp the owner |
| API reads/writes | **filter every query by `user_id = user.id`** | **no `user_id` filter** |
| API INSERT | `userId: user.id` | *same* — record the creator |

**The API-layer filter is the real boundary, not RLS.** The default database
role has `BYPASSRLS`, so the RLS policies are defense-in-depth only (see
`docs/SECURITY.md`). A per-user module that forgets a `user_id` filter will
leak other users' rows; a shared module that keeps one will hide shared rows.
Keep `schema.sql` and your API queries consistent.

**To convert this template to shared:** switch the SELECT/UPDATE/DELETE policies
in `database/schema.sql` to `app.can_access_shared()`, and remove the
`eq(...userId, user.id)` filters from `api/data/route.ts` (GET/PUT/DELETE) —
both are marked with inline comments. Leave INSERT stamping the owner.

**Gating on permissions:** to restrict an endpoint (e.g. an admin-only action),
use `requirePermission(user, 'manage_modules')` or `requireAdmin(user)` from
`@/lib/api-helpers` after the auth check — see `docs/MODULES.md`.

**Per-record privacy on shared tables:** a shared table may carry an
`is_private BOOLEAN DEFAULT FALSE` column so a record's owner can carve it out
of the shared view. Every read **and** write must AND in
`(is_private IS NOT TRUE OR user_id = user.id)`, only the owner may flip the
flag, and paths that miss a masked record must 404 (never 403). The reference
implementation is the tasks module — see
`modules-core/tasks/lib/task-query.ts` (`visibleTo()`), which centralizes the
predicate so no endpoint can forget it.

## Installation

This module ships with ARI. To use it:

1. **Enable the module** on the `/modules` page (Modules in the sidebar)
2. **Navigate to** `/module-template` to see it in action

The database table is created automatically on enable — see below.

## Database Setup

### Required Tables

This module requires one database table: `module_template_entries`

### Automatic install on enable

`database/schema.sql` is executed automatically every time the module is enabled (by `lib/modules/schema-installer.ts`, invoked from `lib/modules/module-registry.ts`). The script is fully idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`), so re-enabling is a safe no-op. You do not need to paste the SQL into Supabase manually.

To ship a schema change in a module update, edit `schema.sql` additively (`ALTER TABLE … ADD COLUMN IF NOT EXISTS …`) and update `schema.ts` to match, then re-run `pnpm generate-module-registry` so the new file hash lands in the manifest. **No re-enable is needed:** ARI compares that hash against the one recorded for each user and re-runs `schema.sql` automatically on their next page load or module API request. The whole file runs in one transaction and the recorded hash only advances on success, so a single broken statement blocks every additive change in the file until it is fixed.

### Manual uninstall

`database/uninstall.sql` is **never** run automatically by ARI — not on enable, not on disable, and not from any API route. It exists only as a manual teardown script — open it in your SQL client of choice (Supabase Studio, pgweb, or `psql`) and run it yourself if you want to permanently drop this module's tables.

## File Structure

```
modules-core/module-template/
├── module.json                 # Module manifest (required)
├── README.md                   # This file
├── .gitignore                  # Module-local ignore rules
│
├── app/                        # Module pages (Next.js App Router)
│   ├── page.tsx               # Main module page at /module-template (default export!)
│   └── settings/
│       └── page.tsx           # Standalone settings page at /module-template/settings
│
├── components/                 # Module components
│   ├── widget.tsx             # Dashboard widget (dashboard.widgetComponents)
│   ├── stat-card.tsx          # Dashboard stat card (dashboard.statCards)
│   ├── settings-panel.tsx     # Settings UI (rendered by app/settings/page.tsx)
│   ├── sidebar-submenu.tsx    # Sidebar submenu (submenu.component)
│   ├── global-provider.tsx    # App-wide context provider (globalProvider)
│   ├── file-upload-example.tsx        # File storage UI example
│   └── unsaved-changes-dialog-example.tsx  # Unsaved-changes dialog pattern
│
├── api/                        # API routes at /api/modules/module-template/*
│   ├── data/route.ts          # CRUD reference (GET/POST/PUT/DELETE)
│   ├── settings/route.ts      # Settings GET + JSONB-merge PUT
│   ├── generate/route.ts      # AI generation via the selected provider
│   ├── upload/route.ts        # File upload via the storage system
│   └── webhook/route.ts.example  # Public webhook pattern (inert until renamed)
│
├── hooks/                      # TanStack Query hooks
│   └── use-module-template.ts # CRUD + settings + storage hooks
│
├── lib/                        # Module utilities
│   ├── validation.ts          # Zod schemas (+ .openapi() tags) — required home
│   ├── utils.ts               # Pure helper functions
│   ├── provider-keys.ts       # AI provider credential resolution
│   └── llm-clients.ts         # Minimal multi-provider LLM client
│
├── database/                   # Database schemas
│   ├── schema.sql             # Auto-run on enable + on hash change (idempotent)
│   ├── schema.ts              # Drizzle ORM definitions (auto-barrelled)
│   └── uninstall.sql          # MANUAL ONLY — never auto-runs
│
└── types/                      # TypeScript types
    └── index.ts               # Module type definitions

tests/unit/modules-core/module-template/   # Unit tests live HERE, not in the module
└── lib/utils.test.ts
```

Optional conventions not used by this template: `database/relations.ts`
(Drizzle relations, auto-barrelled — see knowledge-manager) and a module-root
`styles.css` imported from `app/page.tsx` (see morning-brief, timezones).

## Usage Examples

### Using the Module Page

Navigate to `/module-template` in your browser. The page shows:
- User information
- List of entries (from database)
- Form to create new entries

### Using the API

Authentication is handled via HTTP-only cookies (Better Auth), so no Authorization header is needed for browser requests.

```typescript
// From a React component - cookies are sent automatically
const response = await fetch('/api/modules/module-template/data')
const { entries } = await response.json()

// Create new entry
const response = await fetch('/api/modules/module-template/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello from API' })
})
```

### Using TanStack Query Hooks (Recommended)

```typescript
import {
  useModuleTemplateEntries,
  useCreateModuleTemplateEntry,
  useDeleteModuleTemplateEntry,
} from '@/modules/module-template/hooks/use-module-template'

// In your component
const { data: entries = [], isLoading } = useModuleTemplateEntries()
const createEntry = useCreateModuleTemplateEntry()

// Create with optimistic updates
createEntry.mutate('My message')
```

### Using from Another Module

```typescript
// Import types
import { ModuleTemplateEntry } from '@/modules/module-template/types'

// Call the API (cookies handle auth automatically)
const response = await fetch('/api/modules/module-template/data')
const data = await response.json()
```

## Customization Guide

### Changing the Module Name

1. Update `id` in `module.json` (must be kebab-case)
2. Update `name` in `module.json` (display name)
3. Update route paths to match new ID
4. Rename database table prefix if desired
5. Update this README

### Adding More Pages

Create new pages in `/app`:
```
app/
├── page.tsx                    # Main page at /module-template
└── settings/
    └── page.tsx               # Sub-page at /module-template/settings
```

Update `module.json` routes:
```json
{
  "routes": [
    {
      "path": "/module-template",
      "label": "Module Template",
      "icon": "Package",
      "sidebarPosition": "main",
      "children": [
        {
          "path": "/module-template/settings",
          "label": "Settings",
          "icon": "Settings"
        }
      ]
    }
  ]
}
```

### Adding More API Endpoints

Create new route handlers in `/api`:
```
api/
├── data/
│   └── route.ts               # /api/modules/module-template/data
└── stats/
    └── route.ts               # /api/modules/module-template/stats
```

### Adding Database Tables

1. Add idempotent SQL to `database/schema.sql` (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
2. Mirror it in `database/schema.ts` (Drizzle)
3. List the table name in `module.json` under `database.tables`
4. Run `pnpm generate-module-registry` — the new schema hash triggers an
   automatic re-run of `schema.sql` for every user on their next load. There
   are no migration files (`database.migrations` is a legacy no-op field).

### Adding npm Packages

If your module imports npm packages that aren't already in the host project's `package.json` (e.g., a charting library, a 3D engine), declare them in `module.json` under `npmDependencies`:

```json
{
  "npmDependencies": {
    "lodash": "^4.17.21",
    "three": "^0.184.0"
  }
}
```

When a user installs your module from `/modules`, the install flow:

- **Locally**: runs `pnpm add <pkg>@<ver> ...` against the host project root
- **On Vercel**: merges the entries into the user's root `package.json` and commits the update alongside your module files via GitHub. Vercel auto-rebuilds.

If a declared dep conflicts with a different version already in the host's `package.json` (e.g., your module wants `react@^18` but the host has `react@^19`), the install aborts safely before changing anything. Do **not** declare framework deps like `react`, `next`, or `react-dom` — those come from the host project.

The build-time validator (`scripts/generate-module-registry.js`, runs on `predev`/`prebuild`) warns when declared deps are missing from the host `package.json`, so authors notice drift early.

For the full spec — Vercel flow, conflict policy, security validation — see `docs/MODULES.md` § npm Dependencies.

## Development Workflow

### Testing Locally

```bash
# Start dev server
pnpm dev

# Visit http://localhost:3000/module-template
# Changes to files will hot-reload automatically
```

### Making Changes

1. **Code changes**: Hot-reload automatically
2. **Manifest changes**: Run `pnpm generate-module-registry` (or restart dev — it runs on `predev`)
3. **Database changes**: Edit `schema.sql` additively + regenerate the registry (hash-based auto-reapply)

### Debugging

Check browser console for:
- Authentication errors
- API request/response
- Component render errors

Check terminal for:
- Server-side errors
- API route logs
- Database query errors

## Best Practices Demonstrated

### ✅ Security
- All API routes validate authentication via `getAuthenticatedUser()`
- User data isolation via `withRLS()` helper (application-level RLS)
- Input validation with Zod
- Better Auth cookies (no token exposure in JavaScript)

### ✅ Performance
- TanStack Query for caching and deduplication
- Optimistic updates for instant UI feedback
- Lazy loading for components
- Loading states for async operations

### ✅ Code Quality
- TypeScript for type safety
- Comprehensive error handling
- Clear code comments
- Consistent naming conventions

### ✅ User Experience
- Loading indicators
- Error messages
- Empty states
- Responsive design

## Common Issues

### Module Not Showing in Sidebar
- Check `module.json` syntax (use JSON validator)
- Verify `routes` array is defined
- Restart dev server
- Check browser console for errors

### API Routes Returning 404
- Verify file path: `api/[route]/route.ts`
- Check `permissions.api: true` in manifest
- Clear `.next` folder: `rm -rf .next && pnpm dev`

### Database Errors
- Ensure the module has been enabled at least once (schema auto-applies on enable)
- Check the server log for a schema-install error — one broken statement in
  `schema.sql` blocks the whole file until fixed
- Check RLS policies are enabled
- Verify the database is running and check user authentication

### Widget Not Appearing
- Check `dashboard.widgets: true` in manifest
- Verify widget component exports correctly
- Check dashboard code includes module widgets
- Restart dev server

## Testing Checklist

Before publishing your module, test:

- [ ] Module appears in sidebar
- [ ] Main page loads without errors
- [ ] Authentication redirects work
- [ ] API endpoints require auth
- [ ] API endpoints validate input
- [ ] Database tables created successfully
- [ ] RLS policies enforce user isolation
- [ ] Dashboard widget appears and loads data
- [ ] Settings panel saves/loads correctly
- [ ] Module can be disabled and re-enabled
- [ ] No console errors in browser or terminal

## Publishing Your Module

When ready to share:

1. Remove this module's specific content
2. Update README with your module's purpose
3. Add LICENSE file (MIT recommended)
4. Create git repository
5. Tag version (e.g., v1.0.0)
6. Share repository URL

## Support

For module development questions:
- See `/docs/MODULES.md` for the complete technical specification
- See `/docs/SECURITY.md` for the layered security model (middleware, withRLS, database RLS)
- Open issue in ARI repository

## License

This template is part of the ARI project and follows the same license.

---

**Happy Module Building! 🚀**
