# ARI Module System - Technical Reference

> **For Claude/AI**: This document provides the complete technical specification for creating and managing ARI modules.
> **For Humans**: See `/docs/MODULES-GUIDE.md` for a high-level overview.

**Version**: 4.0
**Last Updated**: November 2025
**Status**: Production Ready

---

## Table of Contents

1. [Module System Architecture](#1-module-system-architecture)
2. [Module Self-Containment Rule](#2-module-self-containment-rule)
3. [Module Manifest Reference](#3-module-manifest-reference)
4. [Checklist: Creating a New Module](#4-checklist-creating-a-new-module)
5. [Checklist: Migrating Existing Feature](#5-checklist-migrating-existing-feature)
6. [Database Integration](#6-database-integration)
7. [API Routes](#7-api-routes)
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
│  │ /app/[module]/[[...slug]]/page.tsx   │                   │
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
│  │ • Scans /modules directory            │                   │
│  │ • Validates module.json files         │                   │
│  │ • Checks user permissions             │                   │
│  │ • Provides query functions            │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  Your Module (/modules/your-module)                          │
│                                                               │
│  module.json         ← Required manifest file               │
│  /app/page.tsx       ← Your module's main page              │
│  /api/data/route.ts  ← API endpoints                        │
│  /components/        ← React components                      │
│  /database/          ← SQL schemas                          │
└─────────────────────────────────────────────────────────────┘
```

### Registry-Based Routing

**Why**: Next.js cannot dynamically discover pages outside `/app` at build time.

**Solution**: Modules must be registered in the `MODULE_PAGES` object in `/lib/generated/module-pages-registry.ts`:

```typescript
export const MODULE_PAGES: Record<string, any> = {
  'hello-world': () => import('@/modules/hello-world/app/page'),
  'my-module': () => import('@/modules/my-module/app/page'),
  // Add your module here
}

export const REGISTERED_MODULE_IDS = [
  'hello-world',
  'my-module',
  // Add your module ID here
]
```

### API Route Proxying

Module API routes are proxied through `/app/api/modules/[module]/[[...path]]/route.ts`:

```typescript
const MODULE_API_ROUTES: Record<string, Record<string, any>> = {
  'hello-world': {
    'data': () => import('@/modules/hello-world/api/data/route')
  },
  'my-module': {
    'data': () => import('@/modules/my-module/api/data/route')
  },
}
```

### URL Structure

| Type | URL Pattern | Maps To |
|------|------------|---------|
| Page | `/hello-world` | `/modules/hello-world/app/page.tsx` |
| Page | `/hello-world/settings` | `/modules/hello-world/app/settings/page.tsx` |
| API | `/api/modules/hello-world/data` | `/modules/hello-world/api/data/route.ts` |

### Module Discovery Process

1. App reads `/modules` directory
2. Validates each `module.json` file
3. Checks if module is enabled for user
4. Renders module in sidebar if routes defined
5. Routes requests to module pages/APIs

---

## 2. Module Self-Containment Rule

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
    ├── schema.sql          ← Table definitions + RLS
    └── migrations/
        └── 001_init.sql    ← Migrations
```

### External Registration Points (ONLY Exceptions)

These are the ONLY places where code/configuration must exist outside the module folder:

| Location | What to Add | When |
|----------|-------------|------|
| `/lib/generated/module-pages-registry.ts` | Page import in `MODULE_PAGES` + ID in `REGISTERED_MODULE_IDS` | Always |
| `/app/api/modules/[module]/[[...path]]/route.ts` | API route imports in `MODULE_API_ROUTES` | If module has API |
| `/app/debug/page.tsx` (~line 274) | Module ID to `registeredModules` array | Always |
| `/app/debug/page.tsx` (~line 595) | Increment `expectedTables` count | If module has DB table |
| `/app/api/backup/export/route.ts` | Table name to `COMPLETE_TABLE_LIST` | If module has DB table |
| `/app/api/backup/verify/route.ts` | Table name to `COMPLETE_TABLE_LIST` | If module has DB table |
| `/CLAUDE.md` | Table to Expected Tables list + update count | If module has DB table |

**Developer must be informed**: When creating documentation or explaining module creation, always clearly list these external registration points.

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
| `enabled` | `boolean` | Default enabled state for new users |

### module.json - Optional Fields

```json
{
  "title": "Section Title",
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
  "database": {
    "tables": ["my_module_data"],
    "migrations": "./database/migrations"
  },
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  },
  "settings": {
    "panel": "./components/settings-panel.tsx"
  },
  "topBarIcon": {
    "icon": "Zap",
    "route": "/my-module",
    "tooltip": "Quick Access"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Optional title shown above name in sidebar |
| `fullscreen` | `boolean` | Hide sidebar/header when `true` (default: `false`) |
| `menuPriority` | `number` | Sort order in sidebar (1-100, lower = higher, default: 50) |
| `permissions` | `object` | Metadata about module capabilities (informational) |
| `routes` | `array` | Navigation items for sidebar |
| `database` | `object` | Database table configuration |
| `dashboard` | `object` | Dashboard widget configuration |
| `settings` | `object` | Settings panel configuration |
| `topBarIcon` | `object` | Top bar icon shortcut configuration |

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
| `sidebarPosition` | `string` | Where to show: `"main"`, `"bottom"`, or `"secondary"` |
| `children` | `array` | Nested routes (optional) |

### Fullscreen Mode

When `fullscreen: true`:
- No sidebar
- No breadcrumb header
- No top bar (TaskAnnouncement)
- Pure module content fills screen

Use cases: Games, dashboards, visualization tools, focused experiences.

### Title Field

Displays a small title above the module name in sidebar:

```json
{
  "title": "Welcome!",
  "name": "Hello World"
}
```

Renders as:
```
Welcome!
📦 Hello World
```

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
  mkdir -p modules/my-module/{app,api/data,components,lib,types,database/migrations}
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
  ```tsx
  'use client'

  import { useSupabase } from '@/components/providers'
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
  import { Loader2 } from 'lucide-react'

  export default function MyModulePage() {
    const { session, user } = useSupabase()

    if (!session) {
      return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )
    }

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

- [ ] **4.4 Create database schema** (if needed) - See [Database Integration](#6-database-integration)

- [ ] **4.5 Create API routes** (if needed) - See [API Routes](#7-api-routes)

- [ ] **4.6 Register page in MODULE_PAGES**

  Edit `/lib/generated/module-pages-registry.ts`:
  ```typescript
  export const MODULE_PAGES: Record<string, any> = {
    // ... existing modules
    'my-module': () => import('@/modules/my-module/app/page'),
  }

  export const REGISTERED_MODULE_IDS = [
    // ... existing modules
    'my-module',
  ]
  ```

- [ ] **4.7 Register API routes** (if module has API)

  Edit `/app/api/modules/[module]/[[...path]]/route.ts`:
  ```typescript
  const MODULE_API_ROUTES: Record<string, Record<string, any>> = {
    // ... existing modules
    'my-module': {
      'data': () => import('@/modules/my-module/api/data/route')
    },
  }
  ```

- [ ] **4.8 Update debug page**

  Edit `/app/debug/page.tsx`:
  1. Add module ID to `registeredModules` array (~line 274):
     ```typescript
     const registeredModules = [
       // ... existing modules
       'my-module',
     ]
     ```
  2. If module has DB table, increment `expectedTables` count (~line 595):
     ```typescript
     const expectedTables = 25 // Increment this number
     ```

- [ ] **4.9 Update backup system** (if module has DB table)

  Edit `/app/api/backup/export/route.ts` - add to `COMPLETE_TABLE_LIST`:
  ```typescript
  const COMPLETE_TABLE_LIST = [
    // ... existing tables
    'my_module_data',
  ]
  ```

  Edit `/app/api/backup/verify/route.ts` - add to `COMPLETE_TABLE_LIST`:
  ```typescript
  const COMPLETE_TABLE_LIST = [
    // ... existing tables
    'my_module_data',
  ]
  ```

- [ ] **4.10 Update CLAUDE.md** (if module has DB table)

  Add table to "Expected Tables" section and update the count.

- [ ] **4.11 Apply database migrations** (if needed)

  Copy SQL from `modules/my-module/database/schema.sql` to Supabase SQL Editor and run.

- [ ] **4.12 Test the module** - See [QA Verification Steps](#9-qa-verification-steps)

---

## 5. Checklist: Migrating Existing Feature

Use this comprehensive checklist when converting an existing ARI feature into a module.

### Prerequisites

Before starting migration, ensure:

- ✅ Module system is working (`/modules-core/hello-world` loads successfully)
- ✅ You have access to Supabase dashboard
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
grep -r "table_name" migrations/ database/
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
      └── migrations/
  ```

**Command:**
```bash
mkdir -p modules-core/[module-id]/{app,api/data,api/settings,components,lib,types,database/migrations}
```

#### Step 5.2.2: Create module.json

- [ ] Create `module.json` in module root
- [ ] Set `id` (kebab-case, matches directory name)
- [ ] Set `name` (display name for UI)
- [ ] Write `description`
- [ ] Choose Lucide `icon` name
- [ ] Set `enabled: true`
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

- [ ] Copy existing table creation SQL
- [ ] Add comprehensive header comment
- [ ] Document each column with inline comments
- [ ] Ensure RLS is enabled
- [ ] Include all 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
- [ ] Add indexes for common queries
- [ ] Add triggers (e.g., updated_at auto-update)
- [ ] Include verification queries at bottom

**RLS Policy Pattern:**
```sql
-- Users can view their own records
CREATE POLICY "Users can view their own records"
  ON table_name FOR SELECT
  USING (auth.uid() = user_id);
```

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

- [ ] Implement GET handler (list all for user)
- [ ] Implement POST handler (create new)
- [ ] Add Zod validation schemas
- [ ] Add authentication checks
- [ ] Add explicit user_id filtering (defense-in-depth)
- [ ] Add comprehensive JSDoc comments
- [ ] Include developer notes section
- [ ] Add error handling with descriptive messages

**Pattern:**
```typescript
export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) return createErrorResponse('Unauthorized', 401)

  const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('user_id', user.id)

  if (error) return createErrorResponse(error.message, 500)
  return NextResponse.json(data)
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
- [ ] Set up authentication context (`useSupabase`)
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
- [ ] Update to module paths: `@/modules-core/[module-id]/lib/utils`
- [ ] Update type imports: `@/modules-core/[module-id]/types`
- [ ] Test that imports resolve correctly

**Example:**
```typescript
// OLD
import { getItems, type Item } from '@/lib/old-file'

// NEW
import { getItems } from '@/modules-core/module-id/lib/utils'
import type { Item } from '@/modules-core/module-id/types'
```

#### Step 5.6.2: Remove Static Menu Entry

- [ ] Check `/lib/menu-config.ts` for hardcoded entry
- [ ] Remove module entry from `menuConfig` array
- [ ] Remove unused icon imports
- [ ] Remove from feature descriptions
- [ ] Module system will handle menu entry dynamically

#### Step 5.6.3: Verify Middleware

- [ ] Check `/middleware.ts` includes module route
- [ ] Ensure route is in `protectedRoutes` array
- [ ] Test that unauthenticated users are redirected

#### Step 5.6.4: Update Debug Page

- [ ] Add module ID to `registeredModules` array in `/app/debug/page.tsx` (~line 274)
- [ ] Increment `expectedTables` count in `/app/debug/page.tsx` (~line 595)
- [ ] Run debug tests to verify module is recognized

#### Step 5.6.5: Update Backup System

- [ ] Add table name to `COMPLETE_TABLE_LIST` in `/app/api/backup/export/route.ts`
- [ ] Add table name to `COMPLETE_TABLE_LIST` in `/app/api/backup/verify/route.ts`
- [ ] Update expected table count in `CLAUDE.md` (Expected Tables section)
- [ ] Add table to the numbered list in `CLAUDE.md`
- [ ] Test backup export includes module data

#### Step 5.6.6: Register Module (Steps 4.6 - 4.10)

- [ ] Register page in MODULE_PAGES
- [ ] Register API routes (if applicable)
- [ ] Update debug page
- [ ] Update backup system (if DB table)
- [ ] Update CLAUDE.md (if DB table)

### Phase 7: Cleanup

**Objective:** Remove old files safely after verifying new module works.

**IMPORTANT: Only delete after confirming new module works!**

#### Step 5.7.1: Verify Module Loads

- [ ] Run `npm run generate-module-registry`
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
- [ ] Debug page updated
- [ ] Backup system updated
- [ ] CLAUDE.md updated
- [ ] Old imports updated
- [ ] Static menu entry removed
- [ ] Old files deleted
- [ ] All tests passing
- [ ] Git commit created

---

## 6. Database Integration

### Schema Template

```sql
-- modules/my-module/database/schema.sql

-- =============================================================================
-- MY MODULE DATABASE SCHEMA
-- =============================================================================
-- Table: my_module_data
-- Purpose: Store module data with user isolation
-- =============================================================================

-- Create table
CREATE TABLE IF NOT EXISTS my_module_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_my_module_data_user_id
  ON my_module_data(user_id);

-- Enable Row Level Security
ALTER TABLE my_module_data ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES (All 4 required)
-- =============================================================================

-- SELECT: Users can view their own data
CREATE POLICY "Users can view their own my_module_data"
  ON my_module_data FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can insert their own data
CREATE POLICY "Users can insert their own my_module_data"
  ON my_module_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own data
CREATE POLICY "Users can update their own my_module_data"
  ON my_module_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own data
CREATE POLICY "Users can delete their own my_module_data"
  ON my_module_data FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_my_module_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER my_module_data_updated_at
  BEFORE UPDATE ON my_module_data
  FOR EACH ROW
  EXECUTE FUNCTION update_my_module_data_updated_at();

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run these to verify setup:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'my_module_data';
-- SELECT * FROM pg_policies WHERE tablename = 'my_module_data';
```

### Migration Application Process

1. Enable module in Settings → Features
2. App shows "Migrations Pending" status (or view SQL manually)
3. Open Supabase SQL Editor
4. Copy and paste SQL from `database/schema.sql`
5. Click "Run" to execute
6. Verify tables created successfully
7. Return to ARI and click "Mark as Applied" (if using migration UI)

### Register in module.json

```json
{
  "database": {
    "tables": ["my_module_data"],
    "migrations": "./database/migrations"
  }
}
```

---

## 7. API Routes

### Basic API Route Template

```typescript
// modules/my-module/api/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

// Validation schema
const CreateDataSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional()
})

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Query with explicit user filtering (defense-in-depth)
    const { data, error } = await supabase
      .from('my_module_data')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate body
    const body = await request.json()
    const parseResult = CreateDataSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error },
        { status: 400 }
      )
    }

    const { title, content } = parseResult.data

    // Insert with user_id
    const { data, error } = await supabase
      .from('my_module_data')
      .insert({ user_id: user.id, title, content })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Dynamic Route Template (PATCH/DELETE)

```typescript
// modules/my-module/api/data/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

const UpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional()
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(params.id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const body = await request.json()
    const parseResult = UpdateSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('my_module_data')
      .update(parseResult.data)
      .eq('id', params.id)
      .eq('user_id', user.id)  // Defense-in-depth
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user, supabase } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('my_module_data')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### API Security Checklist

- [ ] Always validate authentication with `getAuthenticatedUser()`
- [ ] Use Zod for input validation
- [ ] Add explicit `user_id` filtering (defense-in-depth, even with RLS)
- [ ] Return appropriate HTTP status codes
- [ ] Log errors for debugging
- [ ] Never expose internal error details to client

---

## 8. Components

### Dashboard Widget Template

```tsx
// modules/my-module/components/widget.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSupabase } from '@/components/providers'
import { useEffect, useState } from 'react'
import { Package, Loader2 } from 'lucide-react'
import Link from 'next/link'

export function MyModuleWidget() {
  const { session } = useSupabase()
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.access_token) return

    fetch('/api/modules/my-module/data', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => res.json())
      .then(data => {
        setCount(data.data?.length || 0)
        setLoading(false)
      })
      .catch(err => {
        console.error('Widget error:', err)
        setLoading(false)
      })
  }, [session])

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

### Settings Panel Template

```tsx
// modules/my-module/components/settings-panel.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSupabase } from '@/components/providers'
import { Loader2 } from 'lucide-react'

export function MyModuleSettings() {
  const { session } = useSupabase()
  const [settings, setSettings] = useState({
    showInDashboard: true,
    enableNotifications: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!session?.access_token) return
    // Load settings from API
    setLoading(false)
  }, [session])

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

### Using Core App Features

```typescript
// Available imports from core app
import { useSupabase } from '@/components/providers'       // Auth context
import { Button } from '@/components/ui/button'            // UI components
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getTasks } from '@/lib/tasks'                     // Core APIs
import { getContacts } from '@/lib/contacts'
```

---

## 9. Data Fetching with TanStack Query

### Why TanStack Query?

ARI uses TanStack Query (React Query) for client-side data fetching. **New modules should use TanStack Query** instead of manual `useState` + `useEffect` + `fetch` patterns.

**Benefits:**
- **Caching**: 30-second stale time prevents unnecessary refetches
- **Auto-refetch on focus**: Data stays fresh when users switch tabs
- **Optimistic updates**: Built-in support for instant UI feedback
- **Loading/error states**: Clean `isLoading`, `isError` handling
- **Consistency**: Matches patterns in tasks, contacts, and other modules

### Creating TanStack Query Hooks

Create a hooks file in `/lib/hooks/use-[module-name].ts`:

```typescript
// lib/hooks/use-my-module.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MyModuleEntry } from '@/modules-custom/my-module/types'

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
} from '@/lib/hooks/use-my-module'

export default function MyModulePage() {
  const { toast } = useToast()

  // TanStack Query hooks - no manual state management needed!
  const { data: entries = [], isLoading } = useMyModuleEntries()
  const createEntry = useCreateMyModuleEntry()
  const deleteEntry = useDeleteMyModuleEntry()

  const handleCreate = () => {
    // Close modal immediately (optimistic UX)
    setModalOpen(false)

    createEntry.mutate(
      { title: newTitle },
      {
        onError: () => {
          toast({ variant: 'destructive', title: 'Failed to save' })
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

1. **Close modals immediately** after user clicks save (don't wait for `onSuccess`)
2. **Update cache in `onMutate`** so UI reflects changes instantly
3. **Rollback in `onError`** if the server request fails
4. **Show toast on error** to inform user of failure

```typescript
const handleAddItem = () => {
  const title = inputValue.trim()

  // Close modal immediately (optimistic)
  setModalOpen(false)
  setInputValue('')

  // Mutation handles optimistic cache update via onMutate
  createItem.mutate(
    { title },
    {
      onError: () => {
        toast({ variant: 'destructive', title: 'Failed to save' })
      },
    }
  )
}
```

### Don't Block on Session

The old pattern waited for session before rendering:

```tsx
// ❌ OLD - Don't do this
const { session } = useSupabase()
if (!session) {
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
- `/lib/hooks/use-tasks.ts` - Full CRUD with optimistic updates
- `/lib/hooks/use-ari-launch.ts` - Simple module example
- `/app/tasks/page.tsx` - Page using TanStack Query hooks

---

## 10. Module Utility Functions

ARI provides utility functions and hooks for working with modules programmatically.

### Server-Side Functions

Import from `@/lib/modules/module-registry`:

```typescript
import {
  isModuleEnabled,
  getModules,
  getModuleSettings,
  getModulesByPosition,
  getModulesWithWidgets
} from '@/lib/modules/module-registry'
```

| Function | Description |
|----------|-------------|
| `isModuleEnabled(moduleId, userId?)` | Check if a module is enabled for a user. Returns `Promise<boolean>`. |
| `getModules()` | Get all installed modules. Returns `Promise<ModuleMetadata[]>`. |
| `getModuleSettings(moduleId, userId)` | Get settings for a specific module. Returns module-specific settings object. |
| `getModulesByPosition(position, userId?)` | Get modules by sidebar position ('main', 'bottom', 'secondary'). |
| `getModulesWithWidgets(userId?)` | Get all modules that have dashboard widgets enabled. |

**Example - Check if module is enabled in API route:**
```typescript
import { isModuleEnabled } from '@/lib/modules/module-registry'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser()

  const quotesEnabled = await isModuleEnabled('quotes', user?.id)
  if (!quotesEnabled) {
    return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
  }

  // ... rest of handler
}
```

### Client-Side Hooks

Import from `@/lib/modules/module-hooks`:

```typescript
import {
  useModules,
  useModule,
  useModuleEnabled,
  useModulesByPosition,
  useModulesWithWidgets
} from '@/lib/modules/module-hooks'
```

| Hook | Description |
|------|-------------|
| `useModules()` | Get all modules with their enabled state. Returns `{ modules, loading, error }`. |
| `useModule(moduleId)` | Get a specific module by ID. Returns `{ module, loading, error }`. |
| `useModuleEnabled(moduleId)` | Check if a module is enabled. Returns `{ enabled, loading }`. |
| `useModulesByPosition(position)` | Get modules for a sidebar position. Returns `{ modules, loading }`. |
| `useModulesWithWidgets()` | Get modules with dashboard widgets. Returns `{ modules, loading }`. |

**Example - Conditionally render based on module:**
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

Import from `@/lib/modules`:

```typescript
import { isModuleInstalled, getModuleById } from '@/lib/modules'
```

| Function | Description |
|----------|-------------|
| `isModuleInstalled(moduleName)` | Check if a module folder exists (synchronous). Returns `boolean`. |
| `getModuleById(moduleId)` | Get module metadata by ID. Returns `Promise<ModuleMetadata \| null>`. |

### Module Context

For components that need direct access to the modules context:

```typescript
import { useModulesContext } from '@/lib/modules/context'

const { modules, enabledModules, loading, refreshModules } = useModulesContext()
```

---

## 11. QA Verification Steps

Run through this checklist after creating or updating a module:

### Settings & Sidebar

- [ ] Module appears in Settings → Features tab
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
- [ ] Build succeeds: `npm run build`

---

## 12. Troubleshooting

### Module Not Appearing in Sidebar

**Check:**
- [ ] `module.json` exists and is valid JSON
- [ ] `routes` array is defined in manifest
- [ ] Module ID matches folder name
- [ ] Module registered in `MODULE_PAGES` object
- [ ] Dev server restarted after changes

**Fix:**
```bash
# Validate JSON syntax
cat modules/my-module/module.json | jq .

# Clear Next.js cache and restart
rm -rf .next && npm run dev
```

### API Routes Returning 404

**Check:**
- [ ] File path correct: `modules/[id]/api/[route]/route.ts`
- [ ] Exports `GET`, `POST`, etc. functions correctly
- [ ] API routes registered in `MODULE_API_ROUTES`
- [ ] `permissions.api: true` in manifest

**Fix:**
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Page Stuck on Loading

**Check:**
- [ ] Module page uses `export default function` (not named export)
- [ ] Module registered in `MODULE_PAGES`
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
1. Go to Settings → Features → Modules
2. Toggle the switch ON for your module
3. Page will refresh
4. Module should now appear in sidebar

### Build Fails with Module

**Check:**
- [ ] All imports resolve correctly
- [ ] No circular dependencies
- [ ] TypeScript types are correct
- [ ] No missing dependencies

**Fix:**
```bash
# Check for type errors
npm run build 2>&1 | head -50
```

---

## 13. Reference

### Template Module

Use `/modules/hello-world/` as a complete reference implementation. It demonstrates:
- Module manifest with all fields
- Main page with authentication
- API routes (GET, POST, DELETE)
- Database table with RLS
- Dashboard widget
- Settings panel
- TypeScript types
- Comprehensive documentation

### Key Files to Reference

| File | Purpose |
|------|---------|
| `/lib/modules/module-types.ts` | TypeScript definitions |
| `/lib/modules/module-registry.ts` | Module state management |
| `/lib/modules/module-loader.ts` | Module discovery |
| `/app/[module]/[[...slug]]/page.tsx` | Catch-all page route |
| `/app/api/modules/[module]/[[...path]]/route.ts` | API proxy |
| `/components/app-sidebar.tsx` | Sidebar rendering |
| `/app/settings/page.tsx` | Module management UI |

### Documentation

- **Human-readable guide**: `/docs/MODULES-GUIDE.md`
- **Lucide icons**: https://lucide.dev
- **Shadcn/ui components**: https://ui.shadcn.com

---

**Last Updated**: November 2025
**Maintained By**: ARI Team
