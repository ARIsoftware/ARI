# ARI Module System - Technical Reference

> **For Claude/AI**: This document provides the complete technical specification for creating and managing ARI modules.
> **For Humans**: See `/modules-core/module-template/README.md` for a high-level overview.

**Version**: 5.1
**Last Updated**: April 2026
**Status**: Production Ready

> **Important Change in v5.0**: This document now reflects **Better Auth** + **Drizzle ORM** patterns.
> - API routes use `withRLS()` helper instead of Supabase client
> - Database RLS policies using `auth.uid()` do NOT work with Better Auth
> - Client components use `useAuth()` for auth context
> - Module tables must be defined in `database/schema.ts` within the module folder (auto-generated barrel re-exports them)

---

## Table of Contents

1. [Module System Architecture](#1-module-system-architecture)
2. [Module Self-Containment Rule](#2-module-self-containment-rule)
3. [Module Manifest Reference](#3-module-manifest-reference)
4. [Checklist: Creating a New Module](#4-checklist-creating-a-new-module)
5. [Checklist: Migrating Existing Feature](#5-checklist-migrating-existing-feature)
6. [Database Integration](#6-database-integration)
7. [API Routes](#7-api-routes)
    - [7.5 Public Routes](#75-public-routes)
    - [7.6 OpenAPI Spec & API Keys](#76-openapi-spec--api-keys)
8. [Components](#8-components)
9. [Data Fetching with TanStack Query](#9-data-fetching-with-tanstack-query)
10. [Module Utility Functions](#10-module-utility-functions)
11. [QA Verification Steps](#11-qa-verification-steps)
12. [Troubleshooting](#12-troubleshooting)
13. [Reference](#13-reference)

---

## 1. Module System Architecture

### How Modules Work

```
┌─────────────────────────────────────────────────────────────┐
│  Core App (/app)                                             │
│                                                               │
│  ┌──────────────────────────────────────┐                   │
│  │ Catch-All Route                       │                   │
│  │ /app/(app)/[module]/[[...slug]]/     │                   │
│  │   page.tsx                            │                   │
│  │                                        │                   │
│  │ 1. Validates module is enabled        │                   │
│  │ 2. Checks MODULE_PAGES registry       │                   │
│  │ 3. Dynamically imports module page    │                   │
│  │ 4. Wraps in ErrorBoundary            │                   │
│  │ 5. Applies layout (fullscreen/normal) │                   │
│  └──────────────────────────────────────┘                   │
│                      ↓                                        │
│  ┌──────────────────────────────────────┐                   │
│  │ Module Registry                       │                   │
│  │ /lib/modules/module-registry.ts      │                   │
│  │                                        │                   │
│  │ • Reads the generated manifest        │                   │
│  │ • Checks per-user enablement (DB)     │                   │
│  │ • Runs the schema self-heal gate      │                   │
│  │ • Provides query functions            │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  Your Module (/modules-custom/your-module)                   │
│                                                               │
│  module.json         ← Required manifest file               │
│  /app/page.tsx       ← Your module's main page              │
│  /api/data/route.ts  ← API endpoints                        │
│  /components/        ← React components                      │
│  /database/          ← SQL schemas                          │
└─────────────────────────────────────────────────────────────┘
```

The module API catch-all (`/app/api/modules/[module]/[[...path]]/route.ts`)
applies the same enablement rule to API traffic: it verifies the credential
(session or API key) and checks per-user module enablement on **every
request** before dispatching — a disabled module's API routes return
`403 {"error":"Module '<id>' is disabled"}`, effective immediately on toggle.
See [section 7](#7-api-routes).

### Registry-Based Routing

**Why**: Next.js cannot dynamically discover pages outside `/app` at build time.

**Solution**: `scripts/generate-module-registry.js` scans `modules-custom/` and
`modules-core/` and writes `MODULE_PAGES` into
`/lib/generated/module-pages-registry.ts`. The file is **auto-generated —
never edit it manually**. It regenerates automatically before every
`pnpm dev` / `pnpm build` (via `predev`/`prebuild`), or on demand with
`pnpm generate-module-registry` (or `POST /api/modules/refresh` at runtime):

```typescript
// AUTO-GENERATED — DO NOT EDIT
export const MODULE_PAGES: Record<string, any> = {
  'module-template': () => import('@/modules/module-template/app/page'),
  'my-module': () => import('@/modules/my-module/app/page'),
}
```

### API Route Proxying

Module API routes are proxied through `/app/api/modules/[module]/[[...path]]/route.ts`,
which dispatches via the auto-generated `MODULE_API_ROUTES` map in
`/lib/generated/module-api-registry.ts`. The generator discovers every
`api/**/route.ts` in each module automatically — there is nothing to register
by hand:

```typescript
// AUTO-GENERATED — DO NOT EDIT
export const MODULE_API_ROUTES: Record<string, Record<string, any>> = {
  'module-template': {
    'data': () => import('@/modules/module-template/api/data/route')
  },
}
```

### URL Structure

| Type | URL Pattern | Maps To |
|------|------------|---------|
| Page | `/module-template` | `/modules-core/module-template/app/page.tsx` |
| Page | `/module-template/settings` | `/modules-core/module-template/app/settings/page.tsx` |
| API | `/api/modules/module-template/data` | `/modules-core/module-template/api/data/route.ts` |

### Module Discovery Process

1. **Build/predev time**: `scripts/generate-module-registry.js` scans
   `/modules-custom` then `/modules-core`, validates each `module.json`, and
   writes the generated artifacts under `/lib/generated/` (module manifest,
   page/API/submenu/top-bar/provider/dashboard registries, Drizzle schema
   barrels, OpenAPI input). Nothing scans the filesystem at runtime — the
   app reads the pre-generated manifest (required for serverless deploys).
2. Runtime checks per-user enablement in the `module_settings` table
3. Renders module in sidebar if routes defined
4. Routes requests to module pages/APIs (both gated on enablement)

### What the Generator Validates

The generator is the only path from a module folder into the running app, so
its checks act as gates — a module that fails one is skipped rather than
half-loaded. Re-run it with `pnpm generate-module-registry` (or
`POST /api/modules/refresh`) after any manifest, schema, or route change.

| Check | Effect on failure |
|---|---|
| `module.json` exists and parses as JSON | Module skipped, warning logged |
| `module.json` declares an `id` | Module skipped, warning logged |
| A module that declares `routes` has an `app/page.tsx` | Module skipped, warning logged. A module with no routes *and* no pages is valid (e.g. a top-bar-only module) |
| `npmDependencies` are present in the root `package.json` at a compatible range | Warning only — the build still succeeds. (The hard limits — 25-package cap, package-name pattern, forbidden `git:`/`file:`/`link:`/`workspace:`/`npm:`/`..` specs — are enforced separately by `lib/modules/npm-installer.ts` at install time, not here.) |
| `database/schema.sql` hashed into the manifest as `schemaSha256` | Omitted when the file is absent — the self-heal gate ([section 6](#6-database-integration)) then has nothing to compare and never re-runs |
| A route exporting `isPublic = true` must not also import `getAuthenticatedUser` | Warning — flagged as a likely contradiction |
| `database/relations.ts` may only reference tables that exist | File skipped with a warning; the build still succeeds but those relations are unavailable at runtime |
| Submenu / dashboard widget / stat-card component paths resolve | Warning |
| Top-bar icon / provider component paths resolve | **Throws — the build fails** |

Duplicate module ids are handled separately by `scanForDuplicateModuleIds()`
(`lib/modules/scanner.ts`): two modules sharing an id *within the same root*
is an error, while the same id in `modules-custom` and `modules-core` is an
intentional override — the custom copy wins and the core copy is marked
`isOverridden`.

For the install-time gates that run after this (archive extraction, npm
installation, and the destructive-SQL scan), see `docs/SECURITY.md` →
"Layer 5: Module Supply Chain".

---

## 2. Module Self-Containment Rule

### CRITICAL: Module Portability - Always Use `@/modules/` Alias

**When importing from modules, ALWAYS use the `@/modules/` alias** (not `@/modules-custom/` or `@/modules-core/`).

```typescript
// ✅ CORRECT - Use @/modules/ alias
import type { MyType } from '@/modules/my-module/types'
import { MyComponent } from '@/modules/my-module/components/my-component'

// ❌ WRONG - Hardcoded directory paths
import type { MyType } from '@/modules-custom/my-module/types'
import type { MyType } from '@/modules-core/my-module/types'
```

**Why?** The `@/modules/` alias (defined in `tsconfig.json`) resolves to `modules-custom` first, then `modules-core`. This allows:
- Modules to be freely moved between `modules-custom` and `modules-core` without code changes
- Override modules in `modules-custom` to automatically take precedence
- Consistent import paths across the entire codebase

**Module Directory Priority:**
1. `modules-custom/` - User-created or override modules (highest priority)
2. `modules-core/` - Core system modules (lower priority)

If a module exists in both directories with the same ID, `modules-custom` wins.

### CRITICAL: All Module Code Must Be Self-Contained

**ALL module code MUST live in `/modules/[module-id]/`**. This is essential for:
- Easy installation (drop folder into `/modules`)
- Easy removal (delete folder)
- No conflicts between modules
- Independent versioning

### Required Module Structure

```
modules/[module-id]/
├── module.json              ← REQUIRED: Module manifest
├── README.md                ← Recommended: Documentation
│
├── app/                     ← Module pages
│   └── page.tsx            ← REQUIRED: Main page (must export default)
│   └── settings/
│       └── page.tsx        ← Optional: Sub-pages
│
├── api/                     ← Module API routes
│   └── data/
│       └── route.ts        ← API handler
│   └── [id]/
│       └── route.ts        ← Dynamic API routes
│
├── components/              ← React components
│   ├── widget.tsx          ← Dashboard widget
│   └── settings-panel.tsx  ← Settings panel
│
├── lib/                     ← Utilities
│   └── utils.ts            ← Helper functions
│
├── types/                   ← TypeScript types
│   └── index.ts            ← Type definitions
│
└── database/                ← Database schemas
    ├── schema.sql          ← Idempotent table definitions + RLS (auto-run on enable)
    ├── schema.ts           ← Drizzle ORM definitions (runtime source of truth)
    └── uninstall.sql       ← Manual-only teardown (never auto-run)
```

### External Registration Points: None

There are **zero manual registration touchpoints** outside the module folder.
Everything is discovered and wired automatically by
`pnpm generate-module-registry` (auto-run before every `pnpm dev` /
`pnpm build`): pages, API routes, Drizzle schema/relations barrels, submenu,
top-bar icons, dashboard widgets, providers, and public routes.

The files under `/lib/generated/` (and the barrels `/lib/db/schema/schema.ts`
+ `relations.ts`) are auto-generated — **never edit them manually**; your
changes would be overwritten on the next dev/build run.

---

## 3. Module Manifest Reference

### module.json - Required Fields

```json
{
  "id": "my-module",
  "name": "My Module",
  "description": "What this module does (max 200 chars)",
  "version": "1.0.0",
  "author": "Your Name <email@example.com>",
  "icon": "Package",
  "enabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (kebab-case, **must match folder name**) |
| `name` | `string` | Display name in UI |
| `description` | `string` | Brief description (max 200 chars) |
| `version` | `string` | Semantic version (e.g., "1.0.0") |
| `author` | `string` | Your name and email |
| `icon` | `string` | [Lucide icon name](https://lucide.dev) (e.g., "Package", "Zap") |
| `enabled` | `boolean` | Default enabled state for new users — **core modules only**. Custom modules (`modules-custom/`) are always seeded disabled regardless of this value; the user must explicitly enable them at `/modules` (which also runs the module's `schema.sql`). |

### module.json - Optional Fields

```json
{
  "group": "Section Name",
  "fullscreen": false,
  "menuPriority": 50,
  "permissions": {
    "database": true,
    "api": true,
    "dashboard": true
  },
  "routes": [
    {
      "path": "/my-module",
      "label": "My Module",
      "icon": "Zap",
      "sidebarPosition": "main"
    }
  ],
  "dependencies": {
    "modules": ["tasks"],
    "coreFeatures": ["contacts"]
  },
  "database": {
    "tables": ["my_module_data"]
  },
  "dashboard": {
    "widgets": true,
    "statCards": ["./components/stat-card.tsx"],
    "widgetComponents": ["./components/widget.tsx"]
  },
  "settings": {
    "panel": "./components/settings-panel.tsx"
  },
  "submenu": {
    "component": "./components/submenu.tsx"
  },
  "topBarIcon": {
    "icon": "Zap",
    "route": "/my-module",
    "tooltip": "Quick Access"
  },
  "npmDependencies": {
    "lodash": "^4.17.21",
    "three": "^0.184.0"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `group` | `string` | Group name for sidebar organization. Modules with the same group appear together under a shared header. |
| `fullscreen` | `boolean` | Hide sidebar/header when `true` (default: `false`) |
| `menuPriority` | `number` | Sort order in sidebar (1-100, lower = higher, default: 50). Users can override via drag-and-drop (Cmd+D), which saves to `module_settings.settings.menuPriority` |
| `permissions` | `object` | Metadata about module capabilities (informational) |
| `routes` | `array` | Navigation items for sidebar |
| `dependencies` | `object` | `{ modules?: string[], coreFeatures?: string[] }` — declares what this module reads from. **Informational only — not enforced**: nothing prevents disabling a dependency, so your module must degrade gracefully (gate fetches with `useModuleEnabled('<id>')` and show a notice; a disabled dependency's API returns 403). |
| `database` | `object` | `{ tables: string[] }` — table names the module's `schema.sql` creates. Used for diagnostics; a `tables` list without a `schema.sql` logs a warning. |
| `dashboard` | `object` | Dashboard configuration: `widgets` (boolean), `statCards` (small Quick Overview cards), `widgetComponents` (larger content-area widgets) — component paths relative to module root |
| `settings` | `object` | Settings panel configuration |
| `submenu` | `object` | `{ component: "./components/..." }` — custom sliding submenu shown when the module's sidebar item is clicked |
| `topBarIcon` | `object` | Top bar icon shortcut: `icon`/`route`/`tooltip`, or `component` for a fully custom top-bar component |
| `publicRoutes` | `array` | Unauthenticated API routes with mandatory security config — see [section 7.5](#75-public-routes) |
| `npmDependencies` | `object` | npm packages the module imports at runtime. Auto-installed during marketplace install. See [npm Dependencies](#npm-dependencies) below. |

> **Note:** a `database.migrations` field exists in older manifests but is
> **inert** — no code reads it. Schema evolution works by editing the
> idempotent `database/schema.sql`; the generator hashes it
> (`schemaSha256` in the manifest) and the runtime gate re-runs it
> automatically when the hash changes. See
> [section 6](#6-database-integration).

### npm Dependencies

Modules declare their runtime npm imports under `npmDependencies` in `module.json`. The shape is the same as `package.json` `dependencies` — a flat map of `"package-name": "version-range"`. When a user installs the module from the marketplace, these packages are added to the host project automatically.

```json
{
  "npmDependencies": {
    "@react-three/fiber": "^9.6.1",
    "@react-three/drei": "^10.7.7",
    "three": "^0.184.0"
  }
}
```

**Install behavior:**

- **Local dev**: the install API spawns `pnpm add <pkg>@<ver> ...` against the project root. Progress streams to the /modules UI as NDJSON. After the install, files in the new module that import any of the new packages get their mtimes bumped to nudge Turbopack's resolution cache; the success modal offers an "Open module" button that navigates to the module's first route (forcing a fresh route compile). If Turbopack's cache still surfaces the old "Module not found" error, restart the dev server.
- **Vercel**: the filesystem is read-only outside `/tmp`, so we cannot run `pnpm add` server-side. Instead, the route merges the new dependencies into the user's `package.json` in memory and includes the modified file in the same GitHub commit as the module sources (via `lib/modules/github-sync.ts`'s `extraFiles` parameter). The next Vercel deploy's `pnpm install` picks them up. This requires `GITHUB_TOKEN` to be configured — the existing UI guard at `/modules` already blocks installs on Vercel without GitHub.

**Conflict policy:**

If a declared dependency conflicts with an incompatible version already in root `package.json` (e.g. the module wants `react@^18` but your project has `react@^19`), **the install aborts before any side effect**. No silent upgrades to framework dependencies from inside a module install. The UI surfaces the conflict with the package name, declared range, and existing version. Resolve manually, then re-install.

**Validation:**

- **Install time**: package names are checked against the npm spec regex; version specifiers containing `git:`, `http:`, `file:`, `link:`, `workspace:`, `npm:`, or `..` are rejected. Cap of 25 entries per module.
- **Build time**: `scripts/generate-module-registry.js` (runs on `predev` and `prebuild`) cross-references each module's declared `npmDependencies` against root `package.json` and warns on mismatches. Warnings only — the build still succeeds, so a dev server stays up while the user re-installs via /modules.

**Unsupported (v1):**

- `devDependencies` / `peerDependencies` — not modeled. Modules ship type imports for compile-time use only, so the host project's existing `@types/*` install is responsible.
- Non-semver specifiers (git URLs, local paths) — rejected for safety. Modules should pin to published npm packages.

### Route Configuration

```json
"routes": [
  {
    "path": "/my-module",
    "label": "My Module",
    "icon": "Zap",
    "sidebarPosition": "main",
    "children": [
      {
        "path": "/my-module/settings",
        "label": "Settings",
        "icon": "Settings"
      }
    ]
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | **Must start with `/{module-id}`** |
| `label` | `string` | Display text in sidebar |
| `icon` | `string` | Lucide icon name (optional, inherits from module icon) |
| `sidebarPosition` | `string` | Where to show: `"main"`, `"bottom"`, `"secondary"`, or `"hidden"`/`"none"` (route exists but no sidebar item) |
| `children` | `array` | Nested routes (optional) |

### Fullscreen Mode

When `fullscreen: true`:
- No sidebar
- No breadcrumb header
- No top bar (TaskAnnouncement)
- Pure module content fills screen

Use cases: Games, dashboards, visualization tools, focused experiences.

### Group Field

Organizes modules into groups in the sidebar. Modules with the same `group` value appear together under a shared header:

```json
// tasks/module.json
{
  "group": "Todo",
  "name": "All Tasks"
}

// mail-stream/module.json
{
  "group": "Todo",
  "name": "Mail Stream"
}
```

Renders as:
```
Todo
✓ All Tasks
📧 Mail Stream
```

**Notes:**
- Group position is determined by the lowest `menuPriority` among modules in that group
- Modules without a `group` field appear as standalone items
- Drag-and-drop (Cmd+D) reorders entire groups as units; modules within a group stay together

### Top Bar Icon

Modules can add a quick access icon to the global top navigation bar:

```json
{
  "topBarIcon": {
    "icon": "CheckSquare",
    "route": "/tasks",
    "tooltip": "Open Tasks"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `icon` | `string` | **Required.** Lucide icon name (e.g., "Zap", "Bell", "CheckSquare") |
| `route` | `string` | **Required.** Route to navigate to when clicked (e.g., "/tasks") |
| `tooltip` | `string` | Optional tooltip text displayed on hover |

**Note**: Top bar icons appear to the left of system icons (Command, Settings, etc.) and are only shown for enabled modules. The icon uses the same [Lucide icon library](https://lucide.dev) as sidebar icons.

---

## 4. Checklist: Creating a New Module

### Step-by-Step Checklist

- [ ] **4.1 Create directory structure**
  ```bash
  mkdir -p modules-custom/my-module/{app,api/data,components,hooks,types,database}
  ```

- [ ] **4.2 Create `module.json`**
  ```json
  {
    "id": "my-module",
    "name": "My Module",
    "description": "Description of what this module does",
    "version": "1.0.0",
    "author": "Your Name <you@example.com>",
    "icon": "Package",
    "enabled": true,
    "fullscreen": false,
    "menuPriority": 50,
    "routes": [
      {
        "path": "/my-module",
        "label": "My Module",
        "icon": "Package",
        "sidebarPosition": "main"
      }
    ]
  }
  ```

- [ ] **4.3 Create main page** (`app/page.tsx`)

  > **⚠️ CRITICAL: Do NOT include layout components!**
  >
  > Module pages are rendered by the module catch-all (`/app/(app)/[module]/[[...slug]]/page.tsx`) inside the shared app shell (`/app/(app)/layout.tsx`), which **already provides**:
  > - `SidebarProvider` and `AppSidebar`
  > - `SidebarInset` wrapper
  > - Top bar (`TaskAnnouncement`) with breadcrumb header
  >
  > **Never include these in your module page** - doing so causes duplicate toolbars/headers (a nested layout bug).
  > Just return your content directly, optionally wrapped in a React fragment `<>`.

  ```tsx
  'use client'

  import { useAuth } from '@/components/providers'
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
  import { Loader2 } from 'lucide-react'

  export default function MyModulePage() {
    const { user, isLoading } = useAuth()

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )
    }

    // Return content directly - NO SidebarProvider, AppSidebar, or header!
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-medium">My Module</h1>
          <p className="text-muted-foreground mt-1">
            Welcome to your custom module!
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Module Content</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Hello, {user?.email}!</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  ```
  **IMPORTANT**: Must use `export default function` (not named export)

  **Note**: Use `useAuth()` from `@/components/providers` for client-side auth state. Middleware already protects routes, so you can often skip the loading check and render immediately.

- [ ] **4.4 Create database schema** (if needed) - See [Database Integration](#6-database-integration)

- [ ] **4.5 Create API routes** (if needed) - See [API Routes](#7-api-routes)

- [ ] **4.6 Regenerate the registries**

  Restart the dev server (`pnpm dev` regenerates automatically) or run
  `pnpm generate-module-registry`. Pages, API routes, schema barrels,
  widgets, submenu, and top-bar icons are all discovered automatically —
  there is **no manual registration step**.

- [ ] **4.7 Database tables provision automatically**

  `database/schema.sql` is executed automatically on every module enable, so you do NOT need to run SQL manually. Just enable the module at `/modules` and the tables will be created. The script must be fully idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`) and must contain no `DROP TABLE`/`TRUNCATE`/`DROP COLUMN` statements — the runtime installer rejects files containing those tokens.

  Note: custom modules always start **disabled** (regardless of `"enabled": true` in module.json) — enable them at `/modules`.

- [ ] **4.8 Test the module** - See [QA Verification Steps](#11-qa-verification-steps)

---

## 5. Checklist: Migrating Existing Feature

Use this comprehensive checklist when converting an existing ARI feature into a module.

### Prerequisites

Before starting migration, ensure:

- ✅ Module system is working (`/modules-core/module-template` loads successfully)
- ✅ You can run SQL against your database if needed (psql, Supabase Studio, or pgweb — depending on `ARI_DB_MODE`)
- ✅ Development server can be restarted
- ✅ Git working directory is clean (recommended)

### Phase 1: Planning & Analysis

**Objective:** Understand the existing feature completely before migration.

#### Step 5.1.1: Identify Feature Files

- [ ] List all pages in `/app/[feature-name]/`
- [ ] List all API routes in `/app/api/[feature-name]/`
- [ ] List all lib files (e.g., `/lib/[feature-name].ts`)
- [ ] Search for feature-related validation schemas
- [ ] Identify database tables used

**Commands:**
```bash
# Find all files related to feature
grep -r "feature-name" app/ lib/ --files-with-matches

# Find database references
grep -r "table_name" lib/db/ --include="*.sql" --include="*.ts"
```

#### Step 5.1.2: Document Dependencies

- [ ] List all external imports (other modules, libs)
- [ ] Note integration points (Tasks, Dashboard, Settings)
- [ ] Document database relationships (foreign keys)
- [ ] Check middleware for protected routes
- [ ] Review menu configuration entries

**Questions to answer:**
- Does it integrate with other features?
- Are there any shared utilities?
- What routes need protection?
- Is it in the menu already?

#### Step 5.1.3: Test Current Functionality

- [ ] Test all CRUD operations
- [ ] Verify RLS policies work
- [ ] Check error handling
- [ ] Test with multiple users (if possible)
- [ ] Take screenshots for comparison

### Phase 2: Module Structure

**Objective:** Create the module directory and configuration.

#### Step 5.2.1: Create Directory Structure

- [ ] Create `/modules-core/[module-id]/` directory
- [ ] Create subdirectories:
  ```
  /modules-core/[module-id]/
  ├── app/
  ├── api/
  │   ├── data/
  │   └── settings/
  ├── components/
  ├── lib/
  ├── types/
  └── database/
  ```

**Command:**
```bash
mkdir -p modules-core/[module-id]/{app,api/data,api/settings,components,lib,types,database}
```

#### Step 5.2.2: Create module.json

- [ ] Create `module.json` in module root
- [ ] Set `id` (kebab-case, matches directory name)
- [ ] Set `name` (display name for UI)
- [ ] Write `description`
- [ ] Choose Lucide `icon` name
- [ ] Set `enabled: true` (default state — applies to core modules only; custom modules always start disabled)
- [ ] Set `fullscreen: false` (unless special case)
- [ ] Set `menuPriority` (lower = higher in list)
- [ ] Configure `permissions` (database, api, dashboard)
- [ ] Configure `routes` array with path, label, icon, position
- [ ] Configure `database.tables` array
- [ ] Add `dashboard.widgets` if needed
- [ ] Add `settings.panel` path if needed

### Phase 3: Core Files

**Objective:** Create foundational files with comprehensive documentation.

#### Step 5.3.1: TypeScript Types (`types/index.ts`)

- [ ] Define database model interfaces
- [ ] Define API request/response types
- [ ] Add settings interface if applicable
- [ ] Add JSDoc comments to all types
- [ ] Include usage examples in comments
- [ ] Create type guards for runtime validation

**Key types to include:**
- Database model (matches table schema)
- CreateRequest, UpdateRequest
- API response types
- Settings interface
- Utility types (Partial, Display, etc.)

#### Step 5.3.2: Database Schema (`database/schema.sql`)

`schema.sql` is **auto-executed on every module enable**, so it must be fully idempotent. It is NOT a manual setup file.

- [ ] Every `CREATE TABLE` uses `IF NOT EXISTS`
- [ ] Every `CREATE INDEX` uses `IF NOT EXISTS`
- [ ] Every policy is wrapped: `DROP POLICY IF EXISTS … ON <table>; CREATE POLICY …`
- [ ] Schema additions in updates use `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`
- [ ] **Contains no** `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`, `TRUNCATE`, `ALTER TABLE … DROP COLUMN`, or unconditional `DELETE` (the runtime installer at `lib/modules/schema-installer.ts` will refuse to execute the file)
- [ ] Ensure RLS is enabled on every table
- [ ] Decide **per-user vs shared** (see below) and add all 4 RLS policies (SELECT, INSERT, UPDATE, DELETE) accordingly
- [ ] Add indexes for common queries
- [ ] Document each column with inline comments

A sibling file `database/uninstall.sql` should also exist with `DROP TABLE IF EXISTS … CASCADE` statements for every table the module owns. **`uninstall.sql` is never auto-run** — it's a manual teardown the user can run themselves in their SQL client of choice (Supabase Studio for cloud Supabase, the local Studio at `http://127.0.0.1:54323` when running `./ari start`, pgweb for standalone local Postgres, or `psql` directly).

**Multi-user: per-user (private) vs shared (collaborative).** ARI is multi-user, so every content table is one of two kinds. This choice must be made consistently in **both** `schema.sql` (RLS policy) and your API queries (Step 5.4.1):

- **Per-user (private) — the default.** Each user only sees their own rows (fitness, journal, notes). SELECT/UPDATE/DELETE match `user_id`; the API filters every read/write by `user_id = user.id`.
- **Shared (collaborative).** All authenticated users read/write the same rows (tasks, contacts, documents). SELECT/UPDATE/DELETE use `app.can_access_shared()`; the API does **not** filter by `user_id`.

`INSERT` stamps `user_id = user.id` (the owner) in both models. Because the default DB role has `BYPASSRLS`, the **API-layer filter is the real boundary** — the RLS policy is defense-in-depth (see `docs/SECURITY.md`).

**RLS Policy Pattern:**
```sql
-- PER-USER (default): only the owner can see/modify the row
DROP POLICY IF EXISTS my_table_rls_select ON my_table;
CREATE POLICY my_table_rls_select ON my_table FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

-- SHARED: any authenticated user can see/modify the row
-- CREATE POLICY my_table_rls_select ON my_table FOR SELECT
--   USING (app.can_access_shared());

-- INSERT is identical for both — stamp the creator as owner:
DROP POLICY IF EXISTS my_table_rls_insert ON my_table;
CREATE POLICY my_table_rls_insert ON my_table FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
```
**Note:** Do NOT use `auth.uid()` — Better Auth doesn't populate that function. Use `current_setting('app.current_user_id')` which is set by `withRLS()`. `app.can_access_shared()` is defined in `lib/db/setup.sql`. See `modules-core/module-template/database/schema.sql` for the complete pattern with all four policies and how to switch a table between per-user and shared.

#### Step 5.3.3: Utility Functions (`lib/utils.ts`)

- [ ] Migrate API call functions (get, create, update, delete)
- [ ] Add helper functions for calculations
- [ ] Add formatting functions
- [ ] Add validation functions
- [ ] Add JSDoc comments to all exports
- [ ] Include developer notes section
- [ ] Make all functions pure (no side effects) where possible

**Minimum required utilities:**
- `getItems()` - Fetch all
- `createItem()` - Create new
- `updateItem()` - Update existing
- `deleteItem()` - Delete by ID

### Phase 4: API Migration

**Objective:** Create modular API routes with proper validation and security.

#### Step 5.4.1: Data Endpoints (`api/data/route.ts`)

- [ ] Implement GET handler (list)
- [ ] Implement POST handler (create new; set `user_id: user.id`)
- [ ] Add Zod validation schemas
- [ ] Add authentication checks
- [ ] **Per-user tables:** filter every read/write by `user_id = user.id`. **Shared tables:** do NOT filter (see the schema step). This must match the table's RLS policy.
- [ ] Gate privileged actions with `requirePermission(user, 'key')` / `requireAdmin(user)` from `@/lib/api-helpers`
- [ ] Add comprehensive JSDoc comments
- [ ] Add error handling with descriptive messages

**Pattern (Drizzle + withRLS) — per-user (default):**
```typescript
import { myTable } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { requirePermission } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()
  if (!user || !withRLS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional: gate the whole route on a permission (admins always pass):
  //   const denied = requirePermission(user, 'manage_modules'); if (denied) return denied

  const data = await withRLS((db) =>
    db.select().from(myTable)
      // PER-USER boundary — remove this .where() for a SHARED module:
      .where(eq(myTable.userId, user.id))
      .orderBy(desc(myTable.createdAt))
  )

  return NextResponse.json({ data: toSnakeCase(data) })
}
```

#### Step 5.4.2: Individual Resource Endpoints (`api/data/[id]/route.ts`)

- [ ] Implement PATCH handler (update by ID)
- [ ] Implement DELETE handler (delete by ID)
- [ ] Add UUID validation for path parameters
- [ ] Add Zod validation for update data
- [ ] Add authentication checks
- [ ] Add explicit user_id filtering
- [ ] Handle not found cases (404)
- [ ] Add comprehensive comments

#### Step 5.4.3: Settings Endpoints (Optional)

- [ ] Create `/api/settings/route.ts`
- [ ] Implement GET handler (fetch user settings)
- [ ] Implement PUT handler (upsert settings)
- [ ] Return defaults if no settings exist
- [ ] Merge with defaults on GET
- [ ] Use upsert pattern for PUT
- [ ] Store in `module_settings` table

### Phase 5: Components

**Objective:** Create UI components with proper documentation and error handling.

#### Step 5.5.1: Main Page Component (`app/page.tsx`)

- [ ] Add `'use client'` directive (required for React hooks)
- [ ] Import all necessary dependencies
- [ ] Set up authentication context (`useAuth` from `@/components/providers`)
- [ ] Add state management (useState for data, loading, errors)
- [ ] Implement data fetching (useEffect with session dependency)
- [ ] Add CRUD operation handlers
- [ ] Add loading state UI
- [ ] Add error state UI
- [ ] Add empty state UI
- [ ] Add main content UI
- [ ] Add form dialogs/modals
- [ ] Add toast notifications
- [ ] Export as default export (required by module system)
- [ ] Add comprehensive comments throughout

**Required exports:**
```typescript
export default function ModulePage() {
  // Component implementation
}
```

#### Step 5.5.2: Dashboard Widget (`components/widget.tsx`)

- [ ] Add `'use client'` directive
- [ ] Fetch data independently (don't rely on main page state)
- [ ] Show loading state
- [ ] Show error state with retry
- [ ] Show statistics/summary
- [ ] Add link to main module page
- [ ] Export both named and default exports
- [ ] Add comprehensive comments

**Required exports:**
```typescript
export function ModuleWidget() { /* ... */ }
export default ModuleWidget
```

#### Step 5.5.3: Settings Panel (`components/settings-panel.tsx`)

- [ ] Add `'use client'` directive
- [ ] Load settings on mount
- [ ] Create form with all settings options
- [ ] Add save/reset buttons
- [ ] Show loading/saving/saved states
- [ ] Add developer info section (collapsible)
- [ ] Export both named and default exports
- [ ] Add comprehensive comments

**Common settings to include:**
- Show in Dashboard (toggle)
- Enable Notifications (toggle)
- Sort preferences (dropdown)
- Threshold values (dropdown/input)

### Phase 6: Integration

**Objective:** Update integration points to use the new module.

#### Step 5.6.1: Update Imports in Other Files

- [ ] Search for old imports: `grep -r "@/lib/old-file" app/`
- [ ] Update to module paths: `@/modules/[module-id]/lib/utils`
- [ ] Update type imports: `@/modules/[module-id]/types`
- [ ] Test that imports resolve correctly

**Example:**
```typescript
// OLD
import { getItems, type Item } from '@/lib/old-file'

// NEW — always use @/modules/ alias, not @/modules-core/ or @/modules-custom/
import { getItems } from '@/modules/module-id/lib/utils'
import type { Item } from '@/modules/module-id/types'
```

#### Step 5.6.2: Remove Static Menu Entry

- [ ] Modules provide their own menu items via `module.json` — no static menu config needed
- [ ] Remove unused icon imports
- [ ] Remove from feature descriptions
- [ ] Module system will handle menu entry dynamically

#### Step 5.6.3: Verify Auth Protection

- [ ] Routes are protected by default — `middleware.ts` protects everything not in a public list, so module routes never need adding to `protectedRoutes`
- [ ] Test that unauthenticated users are redirected to `/sign-in`

#### Step 5.6.4: Regenerate + Verify

- [ ] Restart the dev server (or run `pnpm generate-module-registry`) — pages, API routes, and schema barrels register automatically
- [ ] Run `/health` system tests to verify the module's API fetch test passes
- [ ] Update CLAUDE.md (if DB table)

### Phase 7: Cleanup

**Objective:** Remove old files safely after verifying new module works.

**IMPORTANT: Only delete after confirming new module works!**

#### Step 5.7.1: Verify Module Loads

- [ ] Run `pnpm generate-module-registry`
- [ ] Verify module appears in registry file
- [ ] Start dev server
- [ ] Navigate to module URL
- [ ] Verify module loads without errors

#### Step 5.7.2: Test All Functionality

- [ ] Test create operation
- [ ] Test read/list operation
- [ ] Test update operation
- [ ] Test delete operation
- [ ] Test dashboard widget
- [ ] Test settings panel
- [ ] Test module enable/disable toggle

#### Step 5.7.3: Delete Old Files

- [ ] Delete `/app/[old-feature]/` directory
- [ ] Delete `/app/api/[old-feature]/` directory
- [ ] Delete `/lib/[old-feature].ts` file
- [ ] Delete any other old feature files
- [ ] Remove from validation schemas if extracted to module

**Command:**
```bash
# Verify no remaining references first
grep -r "old-feature-name" app/ lib/ components/

# Then delete
rm -rf app/old-feature
rm -rf app/api/old-feature
rm lib/old-feature.ts
```

### Phase 8: Testing

**Objective:** Comprehensively test the migrated module.

#### Automated Unit Tests (Vitest)

Unit tests live centrally in `/tests/unit/` — never inside the module folder. For a core module, put tests under `tests/unit/modules-core/[module-id]/`, mirroring the module's `lib/` files.

- [ ] **Coverage**: Any logic in a core module's `lib/` is in coverage scope (`modules-core/**/lib/**`) — add matching tests, or the ratcheted coverage thresholds fail CI (`pnpm test:coverage`)
- [ ] **Imports/Mocks**: Use the `@/` path alias in test imports and `vi.mock` ids (never absolute paths)
- [ ] **Custom modules**: `modules-custom/` is untracked and excluded from coverage — unit tests are optional there
- [ ] **Suite passes**: `pnpm test` is green before committing

#### Step 5.8.1: Functional Testing

- [ ] **Create**: Add new items successfully
- [ ] **Read**: List displays all user items
- [ ] **Update**: Edit items and see changes
- [ ] **Delete**: Remove items successfully
- [ ] **Validation**: Form validation works
- [ ] **Error Handling**: Errors display properly
- [ ] **Loading States**: Spinners show during async operations
- [ ] **Empty States**: Shows when no data

#### Step 5.8.2: Integration Testing

- [ ] **Tasks Integration**: If applicable, test task linking
- [ ] **Dashboard Widget**: Appears on dashboard
- [ ] **Settings Panel**: Appears in settings
- [ ] **Menu Entry**: Shows in sidebar
- [ ] **Module Toggle**: Enable/disable works
- [ ] **Route Protection**: Unauthenticated users redirected

#### Step 5.8.3: Security Testing

- [ ] **RLS Policies**: Users only see their own data
- [ ] **API Authentication**: Endpoints require auth
- [ ] **User Isolation**: No data leakage between users
- [ ] **Validation**: Invalid inputs rejected
- [ ] **UUID Validation**: Malformed IDs rejected

#### Step 5.8.4: Cross-Browser Testing

- [ ] Test in Chrome/Edge
- [ ] Test in Firefox
- [ ] Test in Safari (if Mac)
- [ ] Test responsive design (mobile/tablet/desktop)

### Phase 9: Post-Migration

**Objective:** Document and finalize the migration.

#### Step 5.9.1: Documentation

- [ ] Update main project README if needed
- [ ] Verify module README is complete
- [ ] Document any breaking changes
- [ ] Update CHANGELOG if applicable
- [ ] Add migration notes

#### Step 5.9.2: Git Commit

- [ ] Stage all changes: `git add .`
- [ ] Create descriptive commit message
- [ ] Reference issue/ticket if applicable

**Commit message template:**
```
Migrate [Feature Name] to module architecture

- Created /modules-core/[module-id]/ with complete structure
- Migrated database schema with RLS policies
- Created comprehensive TypeScript types
- Migrated API routes to modular structure
- Created dashboard widget and settings panel
- Updated integration points (Tasks, Menu)
- Removed old files from /app and /lib
- Tested all CRUD operations and integrations

Closes #[issue-number]
```

#### Step 5.9.3: Deployment Considerations

- [ ] Ensure database schema is deployed to production
- [ ] Verify environment variables are set
- [ ] Test in staging environment first
- [ ] Monitor for errors after deployment
- [ ] Have rollback plan ready

### Migration Quick Reference

**Estimated Time:**
- **Simple module** (no integrations): 2-3 hours
- **Medium module** (some integrations): 4-6 hours
- **Complex module** (heavy integrations): 8-12 hours

**Summary Checklist:**
- [ ] Module directory created with proper structure
- [ ] module.json configured correctly
- [ ] Types defined in types/index.ts
- [ ] Database schema in database/schema.sql
- [ ] Utilities in lib/utils.ts
- [ ] API routes in api/data/ and api/data/[id]/
- [ ] Settings API in api/settings/route.ts (if needed)
- [ ] Main page in app/page.tsx (default export)
- [ ] Widget in components/widget.tsx (named + default export)
- [ ] Settings panel in components/settings-panel.tsx (named + default export)
- [ ] README.md created
- [ ] Module registry regenerated
- [ ] Old imports updated
- [ ] Static menu entry removed
- [ ] Old files deleted
- [ ] All tests passing
- [ ] Git commit created

---

## 6. Database Integration

### Important: ARI Uses Application-Level RLS

ARI uses **Better Auth** for authentication (not Supabase Auth), which means:
- **Database RLS policies using `auth.uid()` will NOT work** - Better Auth doesn't populate this function
- Instead, ARI enforces user isolation at the **application level** using Drizzle ORM with the `withRLS()` helper
- The `withRLS()` helper automatically filters queries by user_id in SELECT operations
- For INSERT operations, you must explicitly set `user_id: user.id`

### Step 1: Create SQL Schema

Create `database/schema.sql` in your module. This is auto-executed on every module enable, so it **must be fully idempotent**:

```sql
-- modules-custom/my-module/database/schema.sql
-- Idempotent: safe to run on every module enable.

CREATE TABLE IF NOT EXISTS my_module_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- TEXT to match Better Auth user.id type
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_module_data_user_id ON my_module_data(user_id);
CREATE INDEX IF NOT EXISTS idx_my_module_data_created_at ON my_module_data(created_at DESC);

ALTER TABLE my_module_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS my_module_data_rls_select ON my_module_data;
CREATE POLICY my_module_data_rls_select ON my_module_data FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS my_module_data_rls_insert ON my_module_data;
CREATE POLICY my_module_data_rls_insert ON my_module_data FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS my_module_data_rls_update ON my_module_data;
CREATE POLICY my_module_data_rls_update ON my_module_data FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS my_module_data_rls_delete ON my_module_data;
CREATE POLICY my_module_data_rls_delete ON my_module_data FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
```

See `modules-core/module-template/database/schema.sql` for the canonical example.

### Step 2: Add Drizzle Schema Definition (REQUIRED)

**This step is critical!** Create a `database/schema.ts` file in your module with Drizzle table definitions. The generation script will automatically include it in the schema barrel.

Create `modules-custom/my-module/database/schema.ts`:

```typescript
import { pgTable, index, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const myModuleData = pgTable("my_module_data", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),  // TEXT to match Better Auth
  title: varchar({ length: 255 }).notNull(),
  content: text(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_my_module_data_user_id").using("btree", table.userId.asc().nullsLast()),
  index("idx_my_module_data_created_at").using("btree", table.createdAt.desc().nullsFirst()),
]);
```

After creating the file, run `pnpm generate-module-registry` to regenerate the schema barrel. Your table will be automatically exported from `@/lib/db/schema` and available to all code that imports from there.

**If your module needs to reference core tables** (e.g., `user` for a foreign key), import from `@/lib/db/schema/core-schema`:

```typescript
import { user } from "@/lib/db/schema/core-schema"
```

**If your module has relations between its own tables**, create `database/relations.ts`:

```typescript
import { relations } from "drizzle-orm/relations";
import { myModuleData, myModuleItems } from "@/lib/db/schema";

export const myModuleDataRelations = relations(myModuleData, ({many}) => ({
  items: many(myModuleItems),
}));
```

> **Important:** Relations should only reference tables owned by your module. Do not import tables from other modules — if that module isn't installed, the build will fail. If your module needs data from another module, handle that conditionally in your query code at runtime instead. The registry generator will skip any `relations.ts` that imports missing tables, but the relations in that file will be silently unavailable.

### How Tables Are Provisioned

`database/schema.sql` is **auto-executed on every module enable** (by `lib/modules/schema-installer.ts`, invoked from `lib/modules/module-registry.ts`), so you do NOT need to run SQL manually. Just enable the module at `/modules` and the tables will be created.

1. Create `database/schema.sql` (idempotent — auto-run on enable)
2. Create `database/schema.ts` (Drizzle ORM definitions)
3. Create `database/uninstall.sql` (manual-only teardown)
4. Run `pnpm generate-module-registry` to regenerate the schema barrel
5. Enable the module at `/modules` (tables are created automatically)
6. Verify the table works by testing your API routes

### How Schema Changes Roll Out (Self-Heal Gate)

You evolve a module's schema by **editing the idempotent `schema.sql`** —
there is no separate migrations mechanism:

1. The registry generator hashes `schema.sql` into the manifest
   (`schemaSha256`).
2. At runtime, the gate compares that hash against the per-user
   `__schema_installed_hash` marker stored in `module_settings.settings`.
   On mismatch it re-runs `schema.sql` automatically — on the next page
   load **or module API request**. No manual migration step.
3. The whole file runs in **one transaction**, and the hash marker advances
   **only on success**. A failed run rolls back everything — so one broken
   statement blocks ALL additive changes in the file until fixed.
4. Failures are retried with a backoff (once per 60s per schema version)
   and concurrent requests share a single install run — but don't rely on
   retries; keep every statement idempotent.
5. The installer **refuses** files containing destructive statements
   (`DROP TABLE`/`DROP SCHEMA`/`DROP DATABASE`, `TRUNCATE`,
   `ALTER … DROP COLUMN`, `DELETE` without `WHERE`).

### Register in module.json

```json
{
  "database": {
    "tables": ["my_module_data"]
  }
}
```

### Reference: Module Template Schema

See `/modules-core/module-template/database/schema.sql` and `/modules-core/module-template/database/schema.ts` for a complete working example.

---

## 7. API Routes

### Important: Use Drizzle ORM with `withRLS()`

ARI uses **Drizzle ORM** with the `withRLS()` helper for database operations, NOT the Supabase client.

**Key patterns:**
- Use `const { user, withRLS } = await getAuthenticatedUser()` (NOT `supabase`)
- Import your table from `@/lib/db/schema`
- Use `toSnakeCase()` from `@/lib/api-helpers` for API responses
- SELECT operations are automatically filtered by user_id via `withRLS()`
- INSERT operations require explicit `userId: user.id`

### OpenAPI annotations are required

Every route in ARI is documented via the shared OpenAPI 3.1 registry (`scripts/generate-openapi.ts`, run on `predev`/`prebuild`). Annotated routes appear in `/api/openapi.json`, render in the Scalar viewer at `/api-docs`, list in `/settings?tab=api`, and surface in the `/health` Endpoints panel. See [section 7.6](#76-openapi-spec--api-keys) for the full pipeline.

For each module:

1. **Put all Zod schemas in `modules-{core,custom}/<id>/lib/validation.ts`** (not inline in `route.ts`) and tag each with `.openapi('SchemaName')`. `operationId`s and schema names must be globally unique — prefix with the module slug.
2. **In `route.ts`, call `registry.registerPath({ ... })`** once per HTTP verb above the handler. Use `tags: ['<module-id>']`, `security: DEFAULT_SECURITY`, and the shared `ErrorResponseSchema` / `InternalServerErrorResponse` from `@/lib/openapi/common`.

```typescript
// modules-custom/my-module/lib/validation.ts
import { z } from 'zod'
import '@/lib/openapi/registry'  // side-effect: extends zod with .openapi()

export const createDataSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or fewer'),
  content: z.string().optional(),
}).openapi('MyModuleCreateData')

export const MyModuleDataSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('MyModuleData')

export const MyModuleDataListResponseSchema = z.object({
  data: z.array(MyModuleDataSchema),
  count: z.number().int().nonnegative(),
}).openapi('MyModuleDataListResponse')
```

The reference implementation lives at `modules-core/module-template/lib/validation.ts` + `modules-core/module-template/api/data/route.ts`.

### Basic API Route Template

```typescript
// modules-custom/my-module/api/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { myModuleData } from '@/lib/db/schema'  // Import your Drizzle table
import { eq, desc } from 'drizzle-orm'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import {
  createDataSchema as CreateDataSchema,
  MyModuleDataSchema,
  MyModuleDataListResponseSchema,
} from '@/modules/my-module/lib/validation'

registry.registerPath({
  method: 'get',
  path: '/api/modules/my-module/data',
  operationId: 'listMyModuleData',
  summary: "List the authenticated user's entries",
  tags: ['my-module'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Page of entries', content: { 'application/json': { schema: MyModuleDataListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/my-module/data',
  operationId: 'createMyModuleData',
  summary: 'Create a new entry',
  tags: ['my-module'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateDataSchema } } } },
  responses: {
    201: { description: 'Created entry', content: { 'application/json': { schema: MyModuleDataSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * GET - Fetch all entries for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // withRLS automatically filters by user_id for SELECT
    const data = await withRLS((db) =>
      db.select()
        .from(myModuleData)
        .orderBy(desc(myModuleData.createdAt))
    )

    return NextResponse.json({
      data: toSnakeCase(data) || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('GET /api/modules/my-module/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST - Create a new entry
 */
export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate body
    const body = await request.json()
    const parseResult = CreateDataSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { title, content } = parseResult.data

    // INSERT requires explicit userId
    const data = await withRLS((db) =>
      db.insert(myModuleData)
        .values({
          userId: user.id,  // Must explicitly set user_id
          title,
          content
        })
        .returning()
    )

    return NextResponse.json(
      { data: toSnakeCase(data[0]) },
      { status: 201 }
    )

  } catch (error) {
    console.error('POST /api/modules/my-module/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Delete an entry by ID (via query param)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized - Valid authentication required' },
        { status: 401 }
      )
    }

    // Get ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // withRLS ensures user can only delete their own entries
    await withRLS((db) =>
      db.delete(myModuleData).where(eq(myModuleData.id, id))
    )

    return NextResponse.json({
      success: true,
      message: 'Entry deleted successfully'
    })

  } catch (error) {
    console.error('DELETE /api/modules/my-module/data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Dispatcher Behavior (What Runs Before Your Handler)

All module API traffic flows through the catch-all
`/app/api/modules/[module]/[[...path]]/route.ts`. Before your handler runs,
it:

1. Rejects fully anonymous requests (no session cookie, no `x-api-key`) → 401
2. Resolves the route (unknown module or route → 404)
3. Verifies the credential and **checks per-user module enablement** — a
   disabled (or never-enabled) module returns
   `403 {"error":"Module '<id>' is disabled"}`, effective immediately on
   toggle. Your handler does NOT need its own enablement check.
4. Runs the schema self-heal gate (see [section 6](#6-database-integration))
5. Records API-key usage (including rejected-key probes and 403 denials)

Constraints the dispatcher imposes:

- Only `GET`, `POST`, `PUT`, `DELETE`, `PATCH` are dispatched —
  `OPTIONS`/`HEAD` handlers in module routes are never reached.
- Dynamic segments must literally be named `[id]` (e.g. `api/data/[id]/route.ts`);
  other param names are not resolved.
- Keep your handler's own `getAuthenticatedUser()` check — it's
  defense-in-depth and provides `withRLS`.

### Dynamic Route Template (PATCH by ID)

For routes like `/api/modules/my-module/data/[id]`:

```typescript
// modules-custom/my-module/api/data/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { myModuleData } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const UpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional()
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parseResult = UpdateSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      )
    }

    // Update with user_id check for security
    const data = await withRLS((db) =>
      db.update(myModuleData)
        .set({
          ...parseResult.data,
          updatedAt: new Date().toISOString()
        })
        .where(and(
          eq(myModuleData.id, id),
          eq(myModuleData.userId, user.id)  // Ensure user owns this record
        ))
        .returning()
    )

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: toSnakeCase(data[0]) })

  } catch (error) {
    console.error('PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### API Security Checklist

- [ ] Always use `getAuthenticatedUser()` and check for `user` AND `withRLS`
- [ ] Use Zod for input validation
- [ ] Use `withRLS()` for all database operations (not Supabase client)
- [ ] For INSERT: explicitly set `userId: user.id`
- [ ] For UPDATE/DELETE: include `eq(table.userId, user.id)` in WHERE clause
- [ ] Use `toSnakeCase()` for API responses (converts camelCase to snake_case)
- [ ] Return appropriate HTTP status codes (401, 400, 404, 500 — note the dispatcher itself returns 403 when the module is disabled)
- [ ] Log errors with descriptive context
- [ ] Never expose internal error details to client

### OpenAPI Annotation Checklist

- [ ] All Zod schemas live in `[module]/lib/validation.ts` (not inline in `route.ts`)
- [ ] Every schema is tagged with `.openapi('SchemaName')` and the name is prefixed with the module slug for uniqueness
- [ ] Every route handler is preceded by a `registry.registerPath({ ... })` call (one per HTTP verb)
- [ ] `tags` is set to `['<module-id>']` (anything not in `NON_MODULE_TAGS` is treated as a module id)
- [ ] `security: DEFAULT_SECURITY` is set on authenticated routes (omit/set `[]` only for `publicRoutes`)
- [ ] Error responses reference the shared `ErrorResponseSchema` / `InternalServerErrorResponse` from `@/lib/openapi/common`
- [ ] `operationId` is globally unique across the spec (prefix with the module slug)
- [ ] After `pnpm dev` restarts, the route appears in `/api-docs` and `/health` → Endpoints

### Reference Implementation

See `/modules-core/module-template/api/data/route.ts` for a complete working example with GET, POST, and DELETE handlers.

---

## 7.5 Public Routes

### When to Use Public Routes

Public routes are API endpoints that can be accessed **without authentication**. Use them only when:

1. **Webhook receivers** - External services (Resend, Stripe, GitHub) need to send data to your app
2. **Health checks** - External monitoring services need to verify your endpoints are responsive
3. **Public APIs** - Intentionally public data that doesn't require user context

**WARNING**: Public routes bypass authentication **and** the per-user module-enabled check (there is no user context to check against). A disabled module's public routes remain reachable, and the dispatcher enforces **nothing** for them — the security config declared in module.json is diagnostics metadata only (it surfaces as `x-ari-*` extensions in the OpenAPI spec, `/health`, and `/settings?tab=api`). **The route handler's own code is the only gate.** Every public route handler MUST implement its declared security itself.

**Note**: public route paths are matched by **exact string comparison** against the request path — dynamic segments like `webhook/[id]` will never match. Declare static paths only.

### Configuring Public Routes in module.json

Add a `publicRoutes` array to your module.json:

```json
{
  "id": "my-module",
  "name": "My Module",
  "publicRoutes": [
    {
      "path": "webhook",
      "methods": ["POST"],
      "security": {
        "type": "webhook_signature",
        "secretEnvVar": "MY_WEBHOOK_SECRET",
        "rateLimit": 100
      },
      "description": "Receives webhook events from external service"
    }
  ]
}
```

### Security Types (Declared Metadata)

The `security.type` you declare documents what your handler implements. It is
**not enforced by the framework** — implement it in the handler:

| Type | Your handler must | Declared Config |
|------|-------------------|-----------------|
| `webhook_signature` | Verify the sender's cryptographic signature (Svix, Stripe, GitHub, …) | `secretEnvVar` |
| `api_key` | Compare a request header against a secret env var | `apiKeyEnvVar`, optionally `apiKeyHeader` |
| `rate_limit_only` | Rate limit by client IP (use sparingly!) | `rateLimit` |
| `ip_allowlist` | Reject IPs not on the list | `allowedIps[]` |
| `custom` | Whatever you document | `customDescription` |

### PublicRouteSecurity Configuration

```typescript
interface PublicRouteSecurity {
  type: 'webhook_signature' | 'api_key' | 'rate_limit_only' | 'ip_allowlist' | 'custom'
  secretEnvVar?: string      // For webhook_signature - env var with signing secret
  apiKeyEnvVar?: string      // For api_key - env var with expected API key
  apiKeyHeader?: string      // For api_key - header name (default: 'x-api-key')
  allowedIps?: string[]      // For ip_allowlist - allowed IP addresses
  rateLimit?: number         // Requests per minute (applies to all types)
  customDescription?: string // For custom - document your security approach
}
```

### Implementing a Public Route Handler

Write a plain route handler and implement the security yourself. Real
helpers are available in `@/lib/modules/public-route-security`:

- `checkRateLimit(identifier, maxRequests)` — in-memory per-minute rate
  limiter; returns `false` when the limit is exceeded
- `getClientIp(request)` — extracts the client IP (proxy-aware)
- `isSameOriginRequest(request)` — same-origin gate for setup-style endpoints

```typescript
// modules-custom/my-module/api/webhook/route.ts
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'

// Implements the security declared in module.json:
// { "type": "webhook_signature", "secretEnvVar": "MY_WEBHOOK_SECRET", "rateLimit": 100 }
export async function POST(request: NextRequest) {
  // 1. Rate limit by client IP
  if (!checkRateLimit(`my-module-webhook:${getClientIp(request)}`, 100)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // 2. Verify the webhook signature (example: GitHub-style HMAC-SHA256)
  const secret = process.env.MY_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }
  const rawBody = await request.text()
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = request.headers.get('x-hub-signature-256') ?? ''
  const valid = received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 3. Process the payload
  const payload = JSON.parse(rawBody)
  // ...

  return NextResponse.json({ received: true })
}
```

Each provider has its own signature scheme — check its docs (Svix/Resend:
`svix-signature` headers; Stripe: `stripe-signature`; GitHub:
`x-hub-signature-256`). There is no framework auto-detection; the handler
must verify the scheme it expects.

### Verification Steps

After configuring public routes:

1. Run `pnpm generate-module-registry` to update the manifest
2. Restart the dev server
3. Navigate to `/health` → **Endpoints** tab
4. Verify your public endpoint appears with the correct security type
5. Test the endpoint against what YOUR handler implements:
   - **Without signature**: should return 401 (your check)
   - **With valid signature**: should return 200
   - **Rate limit test**: send > rateLimit requests/minute, should get 429

### Public Routes Checklist

- [ ] `publicRoutes` configured in module.json (static paths only)
- [ ] Security type chosen appropriately (prefer `webhook_signature` or `api_key`)
- [ ] Environment variable for secret is set
- [ ] Handler implements the declared security itself (signature/key check + `checkRateLimit`) — the framework enforces nothing for public routes
- [ ] Route appears in `/health` → Endpoints tab
- [ ] Tested without security headers (should fail)
- [ ] Tested with valid security headers (should succeed)

---

## 7.6 OpenAPI Spec & API Keys

ARI publishes a unified OpenAPI 3.1 specification covering every authenticated and public route across the core app and all installed modules. The spec is the single source of truth for `/api-docs`, the Settings → API tab, and the `/health` Endpoints diagnostic.

### Pipeline

| Stage | What happens | Where |
|---|---|---|
| Build | `scripts/generate-openapi.ts` walks `app/api/` and `modules-{core,custom}/*/api/` collecting `registry.registerPath` calls, then writes the spec to `lib/generated/openapi.json` | Runs on `predev` and `prebuild` |
| Serve | `/api/openapi.json` reads the generated file, overrides `servers[0].url` with `BETTER_AUTH_URL` (falling back to the request origin), and returns it (auth-gated, in-memory cached) | `app/api/openapi.json/route.ts` |
| Render | The Scalar viewer fetches the spec and renders an interactive Try-It-Out UI | `/api-docs` (`app/api-docs/page.tsx`) |
| Inspect | Settings → API and the `/health` Endpoints panel both consume the same spec, classifying routes by tag (`app`/`auth` = core, anything else = module id) | `/settings?tab=api`, `/health` |

A module's routes will only appear in `/api-docs`, `/settings?tab=api`, and `/health` if `registry.registerPath` is called. Missing the call doesn't break the route, but it makes the route invisible to every diagnostic in ARI.

### Shared building blocks

Import from `@/lib/openapi/`:

| Import | Source | Purpose |
|---|---|---|
| `registry` | `@/lib/openapi/registry` | The singleton `OpenAPIRegistry`. Also extends Zod with `.openapi()` as a side effect. |
| `DEFAULT_SECURITY` | `@/lib/openapi/common` | `[{ apiKey: [] }, { sessionCookie: [] }]` — accepts either auth type. |
| `ErrorResponseSchema` | `@/lib/openapi/common` | The canonical `{ error, details? }` shape. |
| `UnauthorizedResponse`, `InternalServerErrorResponse` | `@/lib/openapi/common` | Pre-built 401 / 500 response objects. |
| `X_ARI`, `NON_MODULE_TAGS`, `HTTP_METHODS` | `@/lib/openapi/types` | Constants used by writers and readers. Side-effect-free, safe in client bundles. |

### API Keys (`x-api-key`)

Every authenticated route that declares `security: DEFAULT_SECURITY` accepts **two** credentials:

1. **Better Auth session cookie** — set automatically after sign-in (the normal browser path).
2. **`x-api-key: <key>` header** — long-lived programmatic credentials minted by the user in **Settings → API**. The key prefix is defined by `API_KEY_PREFIX` in `lib/auth-middleware.ts`.

There is nothing for a module to wire up — `getAuthenticatedUser()` resolves the request to a user regardless of which mechanism was used, and `withRLS()` scopes queries to that user identically in both cases. The same API key works against the Scalar Try-It-Out UI at `/api-docs`, against direct `curl` calls, and against any HTTP client.

**Module enablement is enforced per request.** The module API catch-all (`app/api/modules/[module]/[[...path]]/route.ts`) verifies the credential *and* checks that the target module is enabled for the resolved user before dispatching to the module's handler. A disabled — or never-enabled — module's routes return `403 {"error":"Module '<id>' is disabled"}` for both credential types. The check reads `module_settings` on every request, so enabling/disabling a module in `/modules` takes effect immediately, with no restart. Note the check is **per-user**, not instance-wide: disabling a module only blocks that user's session and API keys; other users are unaffected.

> This 403 is emitted by the dispatcher for every module route but is not
> currently declared in per-route OpenAPI specs (there is no shared
> `ForbiddenResponse` helper yet), so generated clients should treat 403 on
> any module endpoint as "module disabled — enable it in `/modules`".

**API-key usage logging**: every key-attributed request is recorded in `api_key_usage_logs` (visible in Settings → API), including 403 disabled-module denials and 401 rejections of a valid key (e.g. IP-allowlist block) — so probes of a leaked key stay visible. Keys presented on public routes are logged too; session-authenticated requests carrying a stray key header are not attributed to the key.

### Public routes and the spec

Routes declared in `module.json` `publicRoutes` are merged into the spec with `x-ari-public`, `x-ari-security-type`, `x-ari-rate-limit`, and related extensions (`X_ARI.*` constants). They still need a `registry.registerPath` call to appear in `/api-docs` — just omit `security` (or set it to `[]`) since they don't require user auth. See [section 7.5](#75-public-routes) for security type details.

---

## 8. Components

### ⚠️ CRITICAL: Module Page Layout Rules

**Module pages must NOT include their own layout components.**

The shared app shell (`/app/(app)/layout.tsx`) already wraps every module page with:
- `TaskAnnouncement` (top bar) with breadcrumb header
- `SidebarProvider` + `AppSidebar`
- `SidebarInset`

The module catch-all (`/app/(app)/[module]/[[...slug]]/page.tsx`) then renders your page inside an `ErrorBoundary` (and a fullscreen slot when `fullscreen: true` — the one layout decision a module makes). Theming comes from the global `ThemeProvider` in `components/providers.tsx`.

**If you include any of these in your module page, you will see duplicate toolbars/headers (a nested layout bug).**

#### What NOT to include in module pages:

```tsx
// ❌ WRONG - These cause duplicate toolbars!
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TaskAnnouncement } from '@/components/task-announcement'

export default function MyModulePage() {
  return (
    <>
      <TaskAnnouncement />       {/* ❌ Already provided */}
      <SidebarProvider>          {/* ❌ Already provided */}
        <AppSidebar />           {/* ❌ Already provided */}
        <SidebarInset>           {/* ❌ Already provided */}
          <header>...</header>   {/* ❌ Breadcrumbs already provided */}
          <main>Content</main>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
```

#### Correct pattern:

```tsx
// ✅ CORRECT - Just return your content
export default function MyModulePage() {
  return (
    <>
      {/* Optional: Loading overlay */}
      {isLoading && <LoadingOverlay />}

      {/* Your content - no layout wrappers! */}
      <div className="p-6">
        <h1>My Module</h1>
        {/* ... */}
      </div>
    </>
  )
}
```

When migrating existing pages from `/app/` to modules, **remove all layout wrappers** - they are no longer needed.

---

### Dashboard Widget Template

```tsx
// modules-custom/my-module/components/widget.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { Package, Loader2 } from 'lucide-react'
import Link from 'next/link'

export function MyModuleWidget() {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Auth is handled via cookies - no need to pass tokens
    fetch('/api/modules/my-module/data')
      .then(res => res.json())
      .then(data => {
        setCount(data.data?.length || 0)
        setLoading(false)
      })
      .catch(err => {
        console.error('Widget error:', err)
        setLoading(false)
      })
  }, [])

  return (
    <Link href="/my-module">
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">My Module</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-medium">
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : count}
          </div>
          <p className="text-xs text-muted-foreground">total items</p>
        </CardContent>
      </Card>
    </Link>
  )
}

export default MyModuleWidget
```

**Required exports**: Both named and default exports.

**Note**: With Better Auth, authentication is handled via HTTP-only cookies. You don't need to pass Authorization headers - just make fetch calls and the browser sends cookies automatically.

### Settings Panel Template

```tsx
// modules-custom/my-module/components/settings-panel.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

export function MyModuleSettings() {
  const [settings, setSettings] = useState({
    showInDashboard: true,
    enableNotifications: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load settings from API (auth handled via cookies)
    fetch('/api/modules/my-module/settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) setSettings(data.settings)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    // Save settings to API
    setSaving(false)
  }

  if (loading) {
    return <Loader2 className="h-6 w-6 animate-spin" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">My Module Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure your module preferences
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Show in Dashboard</Label>
            <div className="text-sm text-muted-foreground">
              Display widget on main dashboard
            </div>
          </div>
          <Switch
            checked={settings.showInDashboard}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, showInDashboard: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Notifications</Label>
            <div className="text-sm text-muted-foreground">
              Receive notifications for updates
            </div>
          </div>
          <Switch
            checked={settings.enableNotifications}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, enableNotifications: checked })
            }
          />
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Settings
        </Button>
      </div>
    </div>
  )
}

export default MyModuleSettings
```

**Required exports**: Both named and default exports.

### AI Providers Card (shared component)

If your module calls an LLM, let the user pick which provider it should use with the **shared** `AiProviderCard` — do **not** rebuild the provider grid in each module. It lives once in the core app at `components/ai-provider-card.tsx` and every module imports the same component, so any future change (new providers, restyling, copy tweaks) rolls out everywhere at once.

```tsx
import { AiProviderCard } from '@/components/ai-provider-card'
import type { AiProviderId } from '@/lib/ai-providers'

// In your settings panel, with `settings.selectedAiProvider: AiProviderId | null`:
<AiProviderCard
  value={settings.selectedAiProvider}
  onChange={(id) => updateSetting('selectedAiProvider', id)}
  // Optional — renders an embedded Save button inside the card. Omit it when
  // your settings page already has its own page-level Save.
  onSave={handleSave}
  isSaving={updateSettings.isPending}
  justSaved={saved}
/>
```

**How it works:**

- **Controlled component.** The host module owns the value. Store it as a `selectedAiProvider: AiProviderId | null` field on your `module_settings` JSON (the same place all your other settings live) and persist it however you already save settings.
- **Only configured providers are offered.** The card reads `useApiKeysStatus()` and lists only providers that have an API key set under **Settings → Integrations**. If none are configured it shows an empty state linking the user there — you don't handle that case yourself.
- **Auto-selects a lone provider.** When exactly one provider is configured and `value` is still `null`, the card fires `onChange` with that provider so the module defaults to the only available choice. It surfaces in your local state immediately and persists on your next save.
- **`AiProviderId`** is the canonical provider-id union from `@/lib/ai-providers` (the single source of truth for the provider list). Use it for the settings field type and for any server-side handling.

`AiProviderCard` only records *which* provider the module should use. Resolving the matching API key/model env vars and actually calling the provider at runtime is the module's own responsibility.

### Using Core App Features

```typescript
// Available imports from core app
import { useAuth } from '@/components/providers'           // Auth context (Better Auth)
import { Button } from '@/components/ui/button'            // UI components
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useModuleEnabled } from '@/lib/modules/module-hooks'  // Module system hooks
```

---

## 9. Data Fetching with TanStack Query

### Why TanStack Query?

ARI uses TanStack Query (React Query) for client-side data fetching. **New modules should use TanStack Query** instead of manual `useState` + `useEffect` + `fetch` patterns.

**Benefits:**
- **Caching**: 5-minute stale time prevents unnecessary refetches (set globally in `components/query-provider.tsx`)
- **No refetch on focus**: `refetchOnWindowFocus` is disabled globally — queries needing fresher data opt in per-query with `refetchOnWindowFocus: true` or `refetchInterval`
- **Optimistic updates**: Built-in support for instant UI feedback
- **Loading/error states**: Clean `isLoading`, `isError` handling
- **Consistency**: Matches patterns in tasks, contacts, and other modules

### Creating TanStack Query Hooks

Create a hooks file **inside the module directory** at `hooks/use-[module-name].ts`. All module hooks MUST live inside the module folder — never in `/lib/hooks/`.

```typescript
// modules-custom/my-module/hooks/use-my-module.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MyModuleEntry } from '@/modules/my-module/types'  // Always use @/modules/ alias!

/**
 * Fetch all entries for the current user
 */
export function useMyModuleEntries() {
  return useQuery({
    queryKey: ['my-module-entries'],
    queryFn: async (): Promise<MyModuleEntry[]> => {
      const res = await fetch('/api/modules/my-module/data')
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch entries')
      }
      const data = await res.json()
      return data.entries || []
    },
  })
}

/**
 * Create a new entry with optimistic updates
 */
export function useCreateMyModuleEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { title: string }): Promise<MyModuleEntry> => {
      const res = await fetch('/api/modules/my-module/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to create entry')
      return (await res.json()).entry
    },
    // Optimistic update - update UI immediately before server responds
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: ['my-module-entries'] })
      const previous = queryClient.getQueryData<MyModuleEntry[]>(['my-module-entries'])

      queryClient.setQueryData<MyModuleEntry[]>(['my-module-entries'], (old = []) => [
        ...old,
        { ...newEntry, id: 'temp-' + Date.now(), /* other fields */ } as MyModuleEntry,
      ])

      return { previous }
    },
    // Rollback on error
    onError: (_err, _newEntry, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['my-module-entries'], context.previous)
      }
    },
    // Refetch to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-module-entries'] })
    },
  })
}

// Similar patterns for useUpdateMyModuleEntry, useDeleteMyModuleEntry
```

### Using Hooks in Page Component

```tsx
// modules-custom/my-module/app/page.tsx
'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import {
  useMyModuleEntries,
  useCreateMyModuleEntry,
  useDeleteMyModuleEntry
} from '@/modules/my-module/hooks/use-my-module'

export default function MyModulePage() {
  const { toast } = useToast()

  // TanStack Query hooks - no manual state management needed!
  const { data: entries = [], isLoading } = useMyModuleEntries()
  const createEntry = useCreateMyModuleEntry()
  const deleteEntry = useDeleteMyModuleEntry()

  const handleCreate = () => {
    createEntry.mutate(
      { title: newTitle },
      {
        onSuccess: () => {
          setModalOpen(false)  // Only close after server confirms
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: 'Failed to save', description: err.message })
        },
      }
    )
  }

  // Grid renders immediately - no blocking auth check needed
  // (middleware handles auth, cookies handle API auth)
  return (
    <div className="p-6">
      {isLoading && <LoadingOverlay />}
      {/* Render content */}
    </div>
  )
}
```

### Optimistic Updates Pattern

For the best user experience, implement optimistic updates:

1. **Do NOT close dialogs before the server confirms** — only close in `onSuccess` callback so users don't lose form data on error
2. **Update cache in `onMutate`** so UI reflects changes instantly
3. **Rollback in `onError`** if the server request fails
4. **Show toast on error** to inform user of failure

```typescript
const handleAddItem = () => {
  const title = inputValue.trim()

  // Mutation handles optimistic cache update via onMutate
  createItem.mutate(
    { title },
    {
      onSuccess: () => {
        // Only close dialog after server confirms
        setModalOpen(false)
        setInputValue('')
      },
      onError: (err) => {
        toast({ variant: 'destructive', title: 'Failed to save', description: err.message })
      },
    }
  )
}
```

### Don't Block on Session

The old pattern waited for session before rendering:

```tsx
// ❌ OLD - Don't do this
const { isLoading } = useAuth()
if (isLoading) {
  return <div>Authenticating...</div>
}
```

**New pattern**: Render immediately, let TanStack Query handle loading:

```tsx
// ✅ NEW - Render immediately
const { data: entries = [], isLoading } = useMyModuleEntries()

return (
  <div className="p-6">
    {isLoading && <LoadingOverlay />}
    <Grid entries={entries} />
  </div>
)
```

**Why this works:**
- Middleware already protects routes (unauthenticated users are redirected)
- API routes use cookies/headers for auth (no need to pass session)
- TanStack Query handles loading state elegantly

### Reference Implementations

See these files for complete examples:
- `/modules-core/module-template/hooks/use-module-template.ts` - Full CRUD + settings + file storage hooks
- `/modules-core/tasks/hooks/use-tasks.ts` - Full CRUD with optimistic updates
- `/modules-core/module-template/app/page.tsx` - Page using TanStack Query hooks

### File storage in modules

File storage is configured entirely via env vars in `.env.local`:

- `ARI_STORAGE_PROVIDER` selects the backend (`filesystem` default, or `s3` / `r2` / `supabase-s3`).
- Provider credentials live in `ARI_S3_*`, `ARI_R2_*`, or `ARI_SUPABASE_S3_*`.

Modules should never read or write storage credentials. To get a provider, call `getStorageProvider(readStorageConfig())` from `@/lib/storage` — the same code works against every backend. If a module legitimately needs provider-aware behavior (e.g. an S3-only feature), check `process.env.ARI_STORAGE_PROVIDER` directly. The Settings → Storage tab is documentation-only.

---

## 10. Module Utility Functions

ARI provides utility functions and hooks for working with modules programmatically.

### Server-Side Functions

Import from `@/lib/modules/module-registry`:

```typescript
import {
  getModules,
  getEnabledModules,
  getEnabledModule,
  setModuleEnabled
} from '@/lib/modules/module-registry'
```

| Function | Description |
|----------|-------------|
| `getModules()` | All discovered modules regardless of enablement. Returns `Promise<ModuleMetadata[]>`. |
| `getEnabledModules(userId?)` | Modules enabled for the user (resolves the session if `userId` omitted). Also seeds `module_settings` rows and runs the schema self-heal gate. Returns `Promise<ModuleMetadata[]>`. |
| `getEnabledModule(moduleId, userId?)` | The enablement primitive: returns `ModuleMetadata` if the module exists and is enabled for the user, else `null`. **Pass `userId` explicitly in API-key contexts** — the sessionless form returns `null` for key-authenticated requests. Also runs the schema self-heal gate. |
| `setModuleEnabled(moduleId, userId, enabled)` | Toggle a module (runs `schema.sql` on enable). Returns `{ success, error?, warning? }`. |

**Note — you usually don't need an enablement check in module API handlers:**
the dispatcher already returns `403 {"error":"Module '<id>' is disabled"}`
before your handler runs (see [section 7](#7-api-routes)). If server code
outside the dispatcher needs the check, use
`await getEnabledModule('quotes', user.id) !== null`.

### Client-Side Hooks

Import from `@/lib/modules/module-hooks`:

```typescript
import { useModules, useModuleEnabled } from '@/lib/modules/module-hooks'
```

| Hook | Description |
|------|-------------|
| `useModules()` | The user's **enabled** modules, from server-prefetched context (no extra fetch). Returns `{ modules, loading, error }` — `loading` is always `false`. |
| `useModuleEnabled(moduleId)` | Check if a module is enabled. Returns `{ enabled, loading, error }`. |

**Example - Conditionally render based on module** (use this to gate any
cross-module fetch — a disabled module's API returns 403):
```tsx
'use client'

import { useModuleEnabled } from '@/lib/modules/module-hooks'

export function MyComponent() {
  const { enabled: quotesEnabled, loading } = useModuleEnabled('quotes')

  if (loading) return <Spinner />

  return (
    <div>
      {quotesEnabled && <QuotesWidget />}
    </div>
  )
}
```

### General Utilities

```typescript
import { getInstalledModules } from '@/lib/modules'
import { getModuleById, moduleExists } from '@/lib/modules/module-loader'
```

| Function | Description |
|----------|-------------|
| `getInstalledModules()` | Module IDs present in the generated manifest (synchronous). Returns `string[]`. |
| `moduleExists(moduleId)` | Check if a module exists and is valid. Returns `Promise<boolean>`. |
| `getModuleById(moduleId)` | Get module metadata by ID. Returns `Promise<ModuleMetadata \| null>`. |

### Module Context

The modules context (`@/lib/modules/context`) is server-prefetched and
internal — components should use `useModuleEnabled()` / `useModules()` above.
If you need the raw context value, the exported hook is
`useEnabledModulesFromContext()`, returning
`{ modules: string[], enabledModules: ModuleMetadata[] }`.

---

## 11. QA Verification Steps

Run through this checklist after creating or updating a module:

### Settings & Sidebar

- [ ] Module appears on the `/modules` page
- [ ] Module shows correct name, icon, version, description
- [ ] Module toggle works (enable/disable)
- [ ] When enabled, module appears in sidebar
- [ ] Sidebar icon displays correctly
- [ ] Menu priority respected (correct position)

### Page Functionality

- [ ] Navigate to `/[module-id]` - page loads without errors
- [ ] Authentication redirects work (unauthenticated → sign-in)
- [ ] Page content displays correctly
- [ ] Loading states show during data fetch
- [ ] Error states display on failures
- [ ] Empty states show when no data

### API Routes (if applicable)

- [ ] GET endpoint returns user's data only
- [ ] POST endpoint creates new records
- [ ] PATCH endpoint updates existing records
- [ ] DELETE endpoint removes records
- [ ] All endpoints require authentication (401 without token)
- [ ] Invalid inputs return 400 with error details
- [ ] Check Network tab for correct request/response

### Database (if applicable)

- [ ] CRUD operations succeed
- [ ] RLS policies enforce user isolation
- [ ] Other users cannot see/modify data
- [ ] Indexes improve query performance

### Dashboard Widget (if applicable)

- [ ] Widget appears on dashboard
- [ ] Widget loads data correctly
- [ ] Widget shows loading state
- [ ] Widget handles errors gracefully
- [ ] Click navigates to module page

### Settings Panel (if applicable)

- [ ] Settings panel appears in module settings
- [ ] Settings load correctly
- [ ] Settings save correctly
- [ ] Changes persist after refresh

### General

- [ ] No console errors in browser
- [ ] No errors in terminal/server logs
- [ ] Module can be disabled and re-enabled without issues
- [ ] Module API routes return 403 while the module is disabled (session and API key)
- [ ] Build succeeds: `pnpm build`

### Static Audit

- [ ] Run `/ari-audit-module <module-id>` before shipping. It is a read-only
      static review (it never edits code or runs SQL) that fans out across four
      concerns — security (17 categories, including destructive and
      runtime-dangerous operations), production-readiness (manifest,
      self-containment, install SQL, API patterns, OpenAPI annotations,
      registration), database/Postgres practices, and frontend quality —
      and returns one report graded High / Medium / Low.

---

## 12. Troubleshooting

### Module Not Appearing in Sidebar

**Check:**
- [ ] `module.json` exists and is valid JSON
- [ ] `routes` array is defined in manifest
- [ ] Module ID matches folder name
- [ ] Dev server restarted after changes (regenerates the auto-generated `MODULE_PAGES` registry)
- [ ] Module is enabled at `/modules`

**Fix:**
```bash
# Validate JSON syntax
cat modules-custom/my-module/module.json | jq .

# Clear Next.js cache and restart
rm -rf .next && pnpm dev
```

### API Routes Returning 404

**Check:**
- [ ] File path correct: `modules-custom/[id]/api/[route]/route.ts` (dynamic segments must be named `[id]`)
- [ ] Exports `GET`, `POST`, etc. functions correctly (only GET/POST/PUT/DELETE/PATCH are dispatched)
- [ ] Dev server restarted after adding routes (regenerates the auto-generated `MODULE_API_ROUTES` registry — or `POST /api/modules/refresh`)

### API Routes Returning 403

A `403 {"error":"Module '<id>' is disabled"}` means the module is disabled
for the authenticated user — enable it at `/modules`. This applies to both
session and API-key requests and takes effect immediately on toggle.

**Fix:**
```bash
# Clear Next.js cache
rm -rf .next
pnpm dev
```

### Page Stuck on Loading

**Check:**
- [ ] Module page uses `export default function` (not named export)
- [ ] Dev server restarted since the module was added (registry regenerates)
- [ ] Check browser console for errors
- [ ] Check server logs for import errors

**Fix:**
```typescript
// ✅ Correct
export default function MyModulePage() {
  return <div>Content</div>
}

// ❌ Wrong - will not work
export function MyModulePage() {
  return <div>Content</div>
}
```

### Database/RLS Errors

**Check:**
- [ ] Migrations applied in Supabase
- [ ] RLS policies enabled on table
- [ ] All 4 policies exist (SELECT, INSERT, UPDATE, DELETE)
- [ ] User is authenticated

**Debug:**
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'my_module_data';

-- Check policies exist
SELECT * FROM pg_policies WHERE tablename = 'my_module_data';
```

### Widget Not Showing on Dashboard

**Check:**
- [ ] `dashboard.widgets: true` in manifest
- [ ] Widget component exports both named and default
- [ ] Dashboard code includes module widgets
- [ ] Module is enabled for user

### Module Shows as Disabled

**Fix:**
1. Go to the `/modules` page
2. Toggle the switch ON for your module (this also runs its `schema.sql`)
3. Module should now appear in sidebar

Remember: custom modules always start disabled, regardless of
`"enabled": true` in module.json.

### Build Fails with Module

**Check:**
- [ ] All imports resolve correctly
- [ ] No circular dependencies
- [ ] TypeScript types are correct
- [ ] No missing dependencies

**Fix:**
```bash
# Check for type errors
pnpm build 2>&1 | head -50
```

### Duplicate Toolbar / Header (Nested Layout Bug)

**Symptom:** Module shows two toolbars - a black toolbar inside another toolbar, or duplicate headers/breadcrumbs.

**Cause:** Module page includes layout components that the module routing system already provides.

**Check:**
- [ ] Module page does NOT import `SidebarProvider` or `SidebarInset`
- [ ] Module page does NOT import `AppSidebar`
- [ ] Module page does NOT import `TaskAnnouncement`
- [ ] Module page does NOT render its own `<header>` with breadcrumbs

**Fix:**

Remove all layout wrappers from your module page. The shared app shell (`/app/(app)/layout.tsx`) already provides these.

```tsx
// ❌ WRONG - causes duplicate toolbars
export default function MyModulePage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header>...</header>
        <main>Content</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

// ✅ CORRECT - just return content
export default function MyModulePage() {
  return (
    <>
      <div className="p-6">
        <h1>My Module</h1>
        {/* ... */}
      </div>
    </>
  )
}
```

See [Section 8: Components](#8-components) for full details.

---

## 13. Reference

### Template Module

Use `/modules-core/module-template/` as a complete reference implementation. It demonstrates:
- Module manifest with all fields
- Main page with authentication
- API routes (GET, POST, PUT, DELETE — plus settings/generate/upload routes)
- Database table with RLS
- Dashboard widget
- Settings panel
- TypeScript types
- Comprehensive documentation

### Key Files to Reference

| File | Purpose |
|------|---------|
| `/lib/modules/module-types.ts` | TypeScript definitions |
| `/lib/modules/module-registry.ts` | Module state management (enablement, schema gate) |
| `/lib/modules/module-loader.ts` | Module discovery (reads generated manifest) |
| `/lib/modules/schema-installer.ts` | Runs `schema.sql` (destructive-SQL refusal + single transaction) |
| `/lib/modules/npm-installer.ts` | Installs a module's `npmDependencies` (limits, forbidden specs, conflict abort) |
| `/app/(app)/[module]/[[...slug]]/page.tsx` | Catch-all page route |
| `/app/api/modules/[module]/[[...path]]/route.ts` | API dispatcher (auth + enablement + usage logging) |
| `/components/app-sidebar.tsx` | Sidebar rendering |
| `/app/(app)/modules/page.tsx` | Module management UI (`/modules`) |
| `/scripts/generate-module-registry.js` | Build-time discovery + registry generation |

### Documentation

- **Module template README**: `/modules-core/module-template/README.md`
- **Security architecture**: `/docs/SECURITY.md`
- **Lucide icons**: https://lucide.dev
- **Shadcn/ui components**: https://ui.shadcn.com

---

**Last Updated**: April 2026
**Maintained By**: ARI Team
