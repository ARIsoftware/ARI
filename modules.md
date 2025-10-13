# ARI Modules System - Requirements Document

## Overview
The ARI Modules System is an extensible architecture that allows users and developers to add new features to the ARI application through self-contained, pluggable modules. Each module can contribute pages, sidebar navigation, API routes, database schemas, dashboard widgets, and settings panels.

## Vision
Enable a plugin-like ecosystem where:
- Users can easily install modules by dropping them into the `/modules` directory
- Modules are auto-discovered and integrated into the app automatically
- Users can enable/disable modules from the Settings page
- Developers can create modules with minimal boilerplate
- Modules can interact with core app features and other modules

---

## Core Architecture

### 1. Module Discovery & Loading

#### Auto-Discovery
- **Location**: All modules live in `/modules/[module-name]/` directories
- **Discovery**: App scans `/modules` directory on startup and discovers all valid modules
- **Validation**: Modules are validated against the required structure before loading
- **Hot Reload**: In development mode, modules can be hot-reloaded when files change

#### Module Manifest
Each module must contain a `module.json` manifest file in its root directory:

```json
{
  "id": "module-unique-id",
  "name": "Module Display Name",
  "description": "Brief description of what this module does",
  "version": "1.0.0",
  "author": "Author Name",
  "icon": "lucide-icon-name",
  "enabled": true,
  "permissions": {
    "database": true,
    "api": true,
    "dashboard": true
  },
  "routes": [
    {
      "path": "/module-unique-id",
      "label": "Module Label",
      "icon": "lucide-icon-name",
      "sidebarPosition": "main"
    }
  ],
  "dependencies": {
    "modules": ["other-module-id"],
    "coreFeatures": ["tasks", "contacts"]
  },
  "database": {
    "tables": ["module_table_name"],
    "migrations": "./database/migrations"
  },
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  },
  "settings": {
    "panel": "./components/settings-panel.tsx"
  }
}
```

#### Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (kebab-case) |
| `name` | string | Yes | Display name shown in UI |
| `description` | string | Yes | Brief description (max 200 chars) |
| `version` | string | Yes | Semantic version (e.g., "1.0.0") |
| `author` | string | Yes | Module author name or email |
| `icon` | string | No | Lucide icon name (e.g., "Zap", "Package") - default: "Package" |
| `enabled` | boolean | No | Default enabled state for new users (default: true) |
| `permissions` | object | No | Module capabilities (metadata only, not enforced) |
| `routes` | array | No | Page routes and navigation items |
| `dependencies` | object | No | Required modules and core features |
| `database` | object | No | Database schema configuration |
| `dashboard` | object | No | Dashboard widget configuration |
| `settings` | object | No | Settings panel configuration |

---

### 2. Module Structure

#### Standard Directory Layout
```
/modules
  /[module-name]
    module.json                 # Required: Module manifest
    README.md                   # Optional: Module documentation

    /app                        # Module pages (Next.js App Router)
      page.tsx                  # Main module page
      layout.tsx                # Optional: Custom layout
      /[subpage]
        page.tsx

    /components                 # Module components
      module-component.tsx
      widget.tsx                # Dashboard widget
      settings-panel.tsx        # Settings UI

    /api                        # Module API routes
      /route-name
        route.ts                # API route handlers

    /lib                        # Module utilities
      utils.ts
      hooks.ts

    /database                   # Database schemas and migrations
      schema.sql                # Table definitions
      /migrations
        001_initial.sql
        002_add_field.sql

    /types                      # TypeScript types
      index.ts

Note: Module structure does NOT include a `/public` folder. Modules cannot serve static assets directly (Next.js limitation). Use data URLs for small assets or host externally.
```

---

### 3. Module Integration Points

#### 3.1 Sidebar Navigation

Modules can contribute navigation items to the sidebar:

**Configuration in `module.json`:**
```json
{
  "routes": [
    {
      "path": "/my-module",
      "label": "My Module",
      "icon": "Zap",
      "sidebarPosition": "main",
      "children": [
        {
          "path": "/my-module/sub-page",
          "label": "Sub Page",
          "icon": "ChevronRight"
        }
      ]
    }
  ]
}
```

**Important Route Naming Convention:**
- **Module routes MUST start with `/{module-id}`**
- Example: Module with `id: "analytics"` → all routes start with `/analytics`
- This is enforced by the catch-all routing system
- Sub-pages: `/analytics/reports`, `/analytics/settings`, etc.
- **Automatic Namespacing**: You cannot have a module with `id: "analytics"` and route `/stats` - it must be `/analytics/stats`

**Sidebar Positions:**
- `main`: Primary navigation area
- `bottom`: Bottom section (like Settings)
- `secondary`: Collapsible secondary section

#### 3.2 Routing System

**Module Page Routes:**
- Modules define pages in `/modules/[module-name]/app/`
- Core app has a catch-all route at `/app/[module]/[[...slug]]/page.tsx` that:
  - Validates the module is installed and enabled
  - Dynamically imports the module's page component
  - Checks for module's custom `layout.tsx` and applies it if present
  - Falls back to standard app layout if no custom layout
- Example: `/modules/analytics/app/page.tsx` → `/analytics`
- Example: `/modules/analytics/app/reports/page.tsx` → `/analytics/reports`

**How It Works (Simplified):**
```typescript
// /app/[module]/[[...slug]]/page.tsx (simplified - see Section 6.2 for complete implementation)
export default async function ModulePage({ params }) {
  const { module, slug = [] } = await params // Next.js 15: params is a Promise

  // Validate module is enabled
  const moduleInfo = await getEnabledModule(module)
  if (!moduleInfo) notFound()

  // Build relative path to module page (must use relative path, not @/ alias)
  const slugPath = slug.join('/')
  const pagePath = `../../../../modules/${module}/app/${slugPath || 'page'}`

  // Dynamically import module page component (must export as default)
  const PageComponent = await import(/* @vite-ignore */ pagePath)

  return <PageComponent.default />
}
```

**Note**: See Section 6.2 for the complete implementation with error handling and layout detection.

**Route Middleware:**
- All module routes inherit authentication middleware
- Unauthenticated users redirected to `/sign-in`
- Module routes respect user session and RLS policies
- Disabled modules return 404

#### 3.3 API Routes

**Pattern:** `/api/modules/[module-name]/[route]`

**Architecture:**
- Core app has a catch-all route at `/app/api/modules/[module]/[...path]/route.ts`
- This catch-all dynamically imports and executes module API handlers
- Modules write normal Next.js API route handlers in their `/api` folder

**Module API Handler Example:**
```typescript
// /modules/analytics/api/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-auth'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Module logic here
  return NextResponse.json({ stats: [] })
}
```

**Catch-All Implementation:**
```typescript
// /app/api/modules/[module]/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server'

async function handleRequest(
  request: NextRequest,
  method: string,
  params: Promise<{ module: string; path: string[] }>
) {
  const { module, path } = await params

  try {
    // Validate module is enabled
    const moduleInfo = await getEnabledModule(module)
    if (!moduleInfo) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 })
    }

    // Build absolute path to module API handler
    // Note: Dynamic imports require actual filesystem paths or webpack magic comments
    const handlerPath = `../../../../modules/${module}/api/${path.join('/')}/route`

    // Dynamically import the handler
    const handler = await import(/* @vite-ignore */ handlerPath)

    // Execute the appropriate HTTP method
    if (!handler[method]) {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
    }

    // Pass both request and context (context contains params for module handler to use)
    // Module handlers receive: (request: NextRequest, context: { params: Promise<RouteParams> })
    return await handler[method](request, { params })
  } catch (error) {
    console.error('Module API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'GET', params)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'POST', params)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'PUT', params)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'DELETE', params)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'PATCH', params)
}
```

**API Requirements:**
- Must validate authentication using Supabase
- Should use Zod for input validation
- Must respect RLS policies
- Handle errors gracefully

#### 3.4 Database Integration

**Schema Definition:**
Modules can define their own tables in `database/schema.sql`:

```sql
-- /modules/analytics/database/schema.sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name VARCHAR(255) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (Required)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own events"
  ON analytics_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
  ON analytics_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Migration System:**
- Modules provide SQL files in `database/schema.sql` and `database/migrations/`
- **Manual Migration Process**: User must apply migrations via Supabase dashboard
- Settings → Features page shows migration UI with:
  - SQL preview
  - "Copy to Clipboard" button
  - Instructions for applying in Supabase
  - Migration status tracking
- Migration naming: `[number]_[description].sql`
- Migration tracking stored in `module_migrations` table (user marks as applied)

**Why Manual Migrations:**
- Security: No automatic SQL execution
- Safety: User reviews SQL before applying
- Transparency: User sees exactly what changes are made
- Follows best practices: Never edit database directly from app code

**Migration UI Example:**
```
┌─────────────────────────────────────────────┐
│ Analytics Module - Database Setup           │
├─────────────────────────────────────────────┤
│ Status: ⚠️  Migrations Pending               │
│                                             │
│ Required Tables:                            │
│ • analytics_events                          │
│                                             │
│ [View SQL]  [Copy to Clipboard]            │
│                                             │
│ Instructions:                               │
│ 1. Copy SQL using button above             │
│ 2. Open Supabase SQL Editor                │
│ 3. Paste and run the SQL                   │
│ 4. Click "Mark as Applied" below           │
│                                             │
│ [Mark as Applied]                           │
└─────────────────────────────────────────────┘
```

**Database Access:**
- Modules must use Supabase client from `@/lib/supabase-auth`
- All queries subject to RLS policies
- No direct database access (security requirement)

**Migration Failure Handling:**

If migration fails (SQL error, partial success, wrong SQL applied):

1. **DO NOT mark as applied** - migration stays in "Pending" state
2. **Check Supabase SQL Editor** for error message
3. **Manual rollback** if needed:
   ```sql
   -- Example rollback for failed migration
   DROP TABLE IF EXISTS module_table_name;
   ```
4. **Re-attempt**: Fix SQL and try again
5. **Nuclear option**: Delete module, restart fresh

**Best Practice:**
- Test migrations in local Supabase instance first
- Use `IF NOT EXISTS` clauses to make migrations idempotent
- Keep migrations small and atomic
- Backup production database before applying migrations

**Recovery Strategy:**
```sql
-- Check what migrations have been applied
SELECT * FROM module_migrations WHERE module_id = 'your-module';

-- Manually remove incorrect migration record if needed (admin only)
DELETE FROM module_migrations
WHERE module_id = 'your-module' AND migration_name = '001_bad_migration.sql';
```

#### 3.5 Dashboard Widgets

Modules can contribute widgets to the main dashboard:

**Widget Component:**
```typescript
// /modules/analytics/components/widget.tsx
'use client'

export function AnalyticsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics Summary</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Widget content */}
      </CardContent>
    </Card>
  )
}
```

**Registration in `module.json`:**
```json
{
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  }
}
```

**Dashboard Integration:**
- Widgets automatically appear on dashboard when module is enabled
- Widgets can be reordered by users (future feature)
- Widgets should handle their own loading states and errors

**Multiple Widgets Per Module:**
If a module specifies multiple widgets in `widgetComponents` array:
```json
"widgetComponents": ["./components/widget-1.tsx", "./components/widget-2.tsx"]
```

Dashboard behavior:
- **All widgets are rendered** in the order specified
- Each widget gets its own card/grid cell
- User can hide individual widgets (future feature)
- Total widgets across all modules limited to 12 for performance

#### 3.6 Settings Integration

Modules can add settings panels to the Settings page:

**Settings Panel Component:**
```typescript
// /modules/analytics/components/settings-panel.tsx
'use client'

export function AnalyticsSettings() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Analytics Settings</h3>
      {/* Settings UI */}
    </div>
  )
}
```

**Module Enable/Disable Toggle:**
- Settings page automatically detects all installed modules
- Each module gets an enable/disable toggle
- Disabled modules:
  - Routes completely removed from app
  - Sidebar items hidden
  - API routes return 404
  - Dashboard widgets hidden
  - Database data remains intact (not deleted)

---

### 4. Module Dependencies

#### Module-to-Module Dependencies

Modules can depend on other modules:

```json
{
  "dependencies": {
    "modules": ["analytics", "reporting"]
  }
}
```

**Dependency Resolution:**
- Dependencies validated during module loading
- Missing dependencies trigger warning in console
- Dependent modules won't load if dependencies are disabled
- **Circular dependencies detected and prevented** using depth-first search algorithm:

```typescript
// Pseudo-code for cycle detection
function detectCycle(moduleId: string, visited: Set<string>, path: Set<string>): boolean {
  if (path.has(moduleId)) return true // Cycle found
  if (visited.has(moduleId)) return false // Already checked

  visited.add(moduleId)
  path.add(moduleId)

  const module = getModule(moduleId)
  for (const dep of module.dependencies.modules || []) {
    if (detectCycle(dep, visited, path)) return true
  }

  path.delete(moduleId) // Backtrack
  return false
}
```

**Cycle Detection Behavior:**
- Detects both direct cycles (A→B→A) and transitive cycles (A→B→C→A)
- When detected: Module fails to load with clear error message
- Error message shows full dependency chain: "Circular dependency: analytics → reporting → dashboard → analytics"
- Module state set to ERROR in Settings UI

#### Core Feature Dependencies

Modules can declare dependencies on core app features:

```json
{
  "dependencies": {
    "coreFeatures": ["tasks", "contacts", "fitness"]
  }
}
```

**Available Core Features:**
- `tasks`: Task management system
- `contacts`: Contact management
- `fitness`: Fitness tracking
- `northstar`: Goal tracking
- `auth`: Authentication (always available)

---

### 5. Complete Module Development Guide

This section provides detailed instructions for building a module from scratch, including all components and considerations for development and production environments.

---

#### 5.1 Quick Start: Creating Your First Module

**Step 1: Create Module Directory Structure**
```bash
# Navigate to your ARI project root
cd /path/to/ari

# Create module directory and subdirectories
mkdir -p modules/my-module/{app,components,api,lib,database/migrations,types}
cd modules/my-module
```

**Step 2: Create Module Manifest (`module.json`)**

This is the most important file - it tells ARI how to integrate your module.

```json
{
  "id": "my-module",
  "name": "My Module",
  "description": "A sample module demonstrating core features",
  "version": "1.0.0",
  "author": "Your Name <your.email@example.com>",
  "icon": "Zap",
  "enabled": true,
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
  ]
}
```

**Step 3: Create Main Page**

Modules use Next.js App Router conventions. Create your main page:

```typescript
// modules/my-module/app/page.tsx
'use client'

import { useSupabase } from '@/components/providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function MyModulePage() {
  const { session } = useSupabase()

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
          Welcome to your custom module
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Module Content</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Your module content goes here!</p>
          <p className="text-sm text-muted-foreground mt-2">
            User: {session.user.email}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 4: Test in Development**

```bash
# From your ARI project root
npm run dev
```

**What happens in development mode:**
- ✅ Module is auto-discovered from `/modules` directory
- ✅ Manifest is validated and parsed
- ✅ Module appears in sidebar automatically
- ✅ Route is mounted at `/my-module`
- ✅ Hot-reload works for file changes
- ✅ Detailed error messages show in console

**Testing checklist:**
1. Navigate to `http://localhost:3000/my-module`
2. Check sidebar - "My Module" item should appear
3. Verify authentication works (redirects to sign-in if not logged in)
4. Make a change to `page.tsx` - should hot-reload
5. Check browser console for any errors

---

#### 5.2 Building Advanced Features

##### Adding API Routes

Create API endpoints for your module:

```typescript
// modules/my-module/api/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-auth'
import { z } from 'zod'

// Input validation schema
const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10)
})

export async function GET(request: NextRequest) {
  const supabase = createClient()

  // Validate authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Parse and validate query parameters
  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const parseResult = QuerySchema.safeParse(searchParams)

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parseResult.error },
      { status: 400 }
    )
  }

  const { limit } = parseResult.data

  // Your module logic here
  const data = {
    userId: user.id,
    items: [],
    limit
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Validate authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Parse request body
  const body = await request.json()

  // Your module logic here

  return NextResponse.json({ success: true })
}
```

**API Route Pattern:** Your API will be accessible at `/api/modules/my-module/data`

##### Adding Database Tables

Create your schema file:

```sql
-- modules/my-module/database/schema.sql

-- Create module table
CREATE TABLE IF NOT EXISTS my_module_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_my_module_data_user_id
  ON my_module_data(user_id);

-- Enable Row Level Security
ALTER TABLE my_module_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view their own data"
  ON my_module_data
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data"
  ON my_module_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data"
  ON my_module_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own data"
  ON my_module_data
  FOR DELETE
  USING (auth.uid() = user_id);
```

**Update your manifest:**
```json
{
  "id": "my-module",
  "database": {
    "tables": ["my_module_data"],
    "migrations": "./database/migrations"
  }
}
```

**Migration files** (optional, for schema updates):

```sql
-- modules/my-module/database/migrations/001_add_priority_field.sql
ALTER TABLE my_module_data ADD COLUMN priority INTEGER DEFAULT 0;
```

##### Adding Dashboard Widgets

Create a widget component:

```typescript
// modules/my-module/components/widget.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSupabase } from '@/components/providers'
import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'

export function MyModuleWidget() {
  const { session } = useSupabase()
  const [stats, setStats] = useState({ count: 0 })

  useEffect(() => {
    if (!session?.access_token) return

    // Fetch widget data from your API
    fetch('/api/modules/my-module/stats', {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Widget error:', err))
  }, [session])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">My Module Stats</CardTitle>
        <Zap className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-medium">{stats.count}</div>
        <p className="text-xs text-muted-foreground">
          items tracked
        </p>
      </CardContent>
    </Card>
  )
}
```

**Update your manifest:**
```json
{
  "id": "my-module",
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  }
}
```

##### Adding Settings Panel

Create a settings component:

```typescript
// modules/my-module/components/settings-panel.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function MyModuleSettings() {
  const [settings, setSettings] = useState({
    enabled: true,
    apiKey: '',
    notifications: false
  })

  const handleSave = async () => {
    // Save settings to your API
    console.log('Saving settings:', settings)
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
            <Label>Enable Feature</Label>
            <div className="text-sm text-muted-foreground">
              Turn on advanced features
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, enabled: checked })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">API Key</Label>
          <Input
            id="apiKey"
            type="password"
            value={settings.apiKey}
            onChange={(e) =>
              setSettings({ ...settings, apiKey: e.target.value })
            }
            placeholder="Enter your API key"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Notifications</Label>
            <div className="text-sm text-muted-foreground">
              Receive email notifications
            </div>
          </div>
          <Switch
            checked={settings.notifications}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, notifications: checked })
            }
          />
        </div>

        <Button onClick={handleSave}>Save Settings</Button>
      </div>
    </div>
  )
}
```

**Update your manifest:**
```json
{
  "id": "my-module",
  "settings": {
    "panel": "./components/settings-panel.tsx"
  }
}
```

##### Adding Sub-Pages

Create nested routes:

```typescript
// modules/my-module/app/settings/page.tsx
'use client'

export default function ModuleSettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-medium">Module Settings</h1>
      <p className="text-muted-foreground mt-1">
        Configure module-specific options
      </p>
    </div>
  )
}
```

**Update your manifest to add sidebar navigation:**
```json
{
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
}
```

##### Custom Layout (Optional)

Override the default app layout:

```typescript
// modules/my-module/app/layout.tsx
import { ReactNode } from 'react'

export default function MyModuleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="max-w-7xl mx-auto">
        <header className="border-b bg-white/80 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold">My Custom Module</h1>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
```

---

#### 5.3 Module Development Workflow

##### Development Environment Behavior

**Module Discovery:**
```bash
npm run dev
```

When you start the dev server:
1. App scans `/modules` directory
2. Reads all `module.json` files
3. Validates manifest schema
4. Checks for missing dependencies
5. Registers enabled modules
6. Mounts routes dynamically

**Hot Reload Features:**
- ✅ Edit `page.tsx` → Instant reload
- ✅ Edit components → Instant reload
- ✅ Edit `module.json` → App detects change and reloads manifest
- ✅ Add new files → Auto-discovered
- ✅ Create new module folder → Detected within seconds

**Development Console Output:**
```
[Modules] Scanning /modules directory...
[Modules] Found module: my-module v1.0.0
[Modules] Validating manifest...
[Modules] ✓ Module "my-module" loaded successfully
[Modules] Mounted route: /my-module
[Modules] Registered API: /api/modules/my-module
[Modules] Added sidebar item: My Module
```

**Error Handling in Development:**
```
[Modules] ✗ Error loading module "my-module"
[Modules]   - Invalid manifest: "id" is required
[Modules]   - File: modules/my-module/module.json:2
[Modules]   - Fix the error and save to retry
```

##### Production Environment Behavior

**Building for Production:**
```bash
npm run build
```

Build process:
1. Scans `/modules` directory once
2. Validates all manifests (fails build if invalid)
3. Pre-loads module metadata
4. Generates static routes
5. Compiles module components
6. Optimizes bundle with tree-shaking

**Production Characteristics:**
- ❌ No hot-reload (requires restart)
- ✅ Cached module registry (performance)
- ✅ User-friendly error messages (no stack traces)
- ✅ Lazy-loaded components (smaller initial bundle)
- ✅ Optimized builds (tree-shaking, minification)

**Adding a Module in Production:**
1. Stop the server
2. Add module folder to `/modules`
3. Restart the server
4. Module is discovered and loaded

**Production Console Output:**
```
[Modules] Loading modules from cache...
[Modules] Loaded 5 modules (3 enabled, 2 disabled)
[Modules] Ready in 124ms
```

##### Testing Your Module

**Manual Testing Checklist:**

1. **Basic Functionality:**
   - [ ] Module appears in sidebar
   - [ ] Route loads without errors
   - [ ] Authentication works (redirects if not logged in)
   - [ ] Page content displays correctly

2. **API Routes:**
   - [ ] API endpoints return 401 without auth
   - [ ] API endpoints work with valid auth token
   - [ ] Input validation works (test invalid data)
   - [ ] Errors are handled gracefully

3. **Database:**
   - [ ] Tables created successfully
   - [ ] RLS policies enforce user isolation
   - [ ] Migrations apply without errors
   - [ ] Data persists after page reload

4. **Dashboard Widget:**
   - [ ] Widget appears on dashboard
   - [ ] Data loads correctly
   - [ ] Loading states work
   - [ ] Errors don't crash dashboard

5. **Settings Panel:**
   - [ ] Panel appears in Settings → Features
   - [ ] Settings save/load correctly
   - [ ] Validation works

6. **Module States:**
   - [ ] Disable module → routes disappear
   - [ ] Disable module → sidebar item hidden
   - [ ] Disable module → widget hidden
   - [ ] Enable module → everything works again

**Testing with curl:**

```bash
# Test API endpoint without auth (should return 401)
curl http://localhost:3000/api/modules/my-module/data

# Test with auth token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/modules/my-module/data
```

##### Debugging Tips

**Common Issues:**

1. **Module not appearing in sidebar:**
   - Check `module.json` syntax (use JSON validator)
   - Verify `routes` array is defined
   - Check console for validation errors
   - Restart dev server

2. **API routes return 404:**
   - Verify file path: `modules/[id]/api/[route]/route.ts`
   - Check API is registered in manifest
   - Clear `.next` folder and rebuild

3. **Database tables not created:**
   - Check `schema.sql` for syntax errors
   - Verify migrations are listed in manifest
   - Run migrations manually from Features page
   - Check Supabase dashboard for errors

4. **Hot reload not working:**
   - Save the file (ensure no unsaved changes)
   - Check for TypeScript errors in console
   - Restart dev server
   - Clear browser cache

**Debug Mode:**

Add to your module for verbose logging:

```typescript
// modules/my-module/lib/debug.ts
export const DEBUG = process.env.NODE_ENV === 'development'

export function log(...args: any[]) {
  if (DEBUG) {
    console.log('[my-module]', ...args)
  }
}
```

---

#### 5.4 Module Development Best Practices

##### Code Quality

1. **TypeScript:** Always use TypeScript for type safety
   ```typescript
   // modules/my-module/types/index.ts
   export interface MyModuleData {
     id: string
     userId: string
     title: string
     content?: string
     createdAt: Date
   }
   ```

2. **Error Handling:** Handle errors gracefully
   ```typescript
   try {
     const data = await fetchData()
     return data
   } catch (error) {
     console.error('Module error:', error)
     return { error: 'Failed to load data' }
   }
   ```

3. **Loading States:** Always show loading indicators
   ```typescript
   const [loading, setLoading] = useState(true)

   if (loading) {
     return <Loader2 className="animate-spin" />
   }
   ```

4. **Input Validation:** Use Zod for runtime validation
   ```typescript
   import { z } from 'zod'

   const Schema = z.object({
     title: z.string().min(1).max(255),
     content: z.string().optional()
   })
   ```

##### Security

1. **Always validate authentication** in API routes
2. **Use RLS policies** for all database tables
3. **Never expose sensitive data** in client code
4. **Sanitize user input** before storing
5. **Use environment variables** for secrets (never commit)

##### Performance

1. **Lazy load** heavy components
   ```typescript
   const HeavyChart = dynamic(() => import('./heavy-chart'), {
     loading: () => <Loader2 className="animate-spin" />
   })
   ```

2. **Optimize database queries** with indexes
3. **Cache API responses** where appropriate
4. **Use React.memo** for expensive renders
5. **Minimize bundle size** (check imports)

##### Styling

1. **Use Tailwind CSS** for consistency with core app
2. **Use Shadcn/ui components** when possible
3. **Follow color scheme** from core app
4. **Responsive design** - test mobile layouts
5. **Dark mode** - consider theme support (future)

##### Documentation

1. **Create README.md** with:
   - Module description
   - Installation instructions
   - Configuration options
   - API documentation
   - Troubleshooting

2. **Comment complex logic**
3. **Document API endpoints** with examples
4. **Include screenshots** in README
5. **Version your changes** properly

---

#### 5.5 Complete Module Example

Here's a fully-featured example module you can use as a template:

**Directory Structure:**
```
modules/task-timer/
├── module.json
├── README.md
├── app/
│   ├── page.tsx
│   └── history/
│       └── page.tsx
├── components/
│   ├── timer-display.tsx
│   ├── widget.tsx
│   └── settings-panel.tsx
├── api/
│   ├── sessions/
│   │   └── route.ts
│   └── stats/
│       └── route.ts
├── lib/
│   ├── utils.ts
│   └── hooks.ts
├── database/
│   ├── schema.sql
│   └── migrations/
│       └── 001_add_tags.sql
└── types/
    └── index.ts
```

**See Appendix D for the complete implementation.**

---

#### 5.6 Publishing Your Module

**Preparation:**
1. Test thoroughly in development
2. Test in production build
3. Write comprehensive README
4. Add LICENSE file
5. Version appropriately (semantic versioning)

**Distribution Methods:**

**1. Git Repository:**
```bash
# Create repo
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/ari-task-timer.git
git push -u origin main
```

**2. Installation by Users:**
```bash
# Via git submodule
cd /path/to/ari
git submodule add https://github.com/yourname/ari-task-timer.git modules/task-timer

# Via direct clone
cd /path/to/ari/modules
git clone https://github.com/yourname/ari-task-timer.git task-timer
```

**3. Module Updates:**
```bash
# Users update via git
cd modules/task-timer
git pull origin main
```

---

#### 5.7 Environment-Specific Considerations

##### Development-Only Features

You can add dev-only features:

```typescript
// modules/my-module/app/page.tsx
const isDev = process.env.NODE_ENV === 'development'

{isDev && (
  <div className="fixed bottom-4 right-4 bg-yellow-100 p-4 rounded">
    <p className="text-xs font-mono">
      Debug Mode: {JSON.stringify(debugInfo)}
    </p>
  </div>
)}
```

##### Production Optimizations

Optimize for production:

```typescript
// Use dynamic imports for heavy features
const AdvancedFeature = dynamic(
  () => import('./advanced-feature'),
  { ssr: false }
)

// Conditional loading
{session?.user.role === 'admin' && <AdvancedFeature />}
```

##### Environment Variables

Module-specific env vars:

```bash
# .env.local
MY_MODULE_API_KEY=your_key_here
MY_MODULE_FEATURE_FLAG=true
```

```typescript
// Access in module
const apiKey = process.env.MY_MODULE_API_KEY
```

---

This completes the comprehensive module development guide. Follow these instructions to build robust, production-ready modules for the ARI platform.

---

### 6. Implementation Details & Technical Clarifications

This section clarifies how the module system actually works under the hood, addressing common misconceptions.

#### 6.1 How Module Discovery Works

**Server-Side Process:**
1. On app startup (dev or prod), scan `/modules` directory
2. Read each `module.json` file
3. Validate against JSON schema
4. Check dependencies (modules and core features)
5. Build module registry in memory
6. Cache registry for performance

**Module Registry Structure:**
```typescript
interface ModuleRegistry {
  modules: Map<string, ModuleMetadata>
  enabled: Set<string>
  dependencies: Map<string, string[]>
}
```

**Client-Side Access:**
- React hooks query module registry via API
- Client never directly accesses filesystem
- Module metadata sent to client on demand

#### 6.2 How Dynamic Routing Works

**Challenge:** Next.js cannot auto-discover pages outside `/app` directory.

**Solution:** Catch-all route that proxies to module pages.

**Flow:**
1. User visits `/analytics`
2. Next.js matches `/app/[module]/[[...slug]]/page.tsx`
3. Page component receives `params: { module: 'analytics' }`
4. Component validates module is enabled via `getEnabledModule()`
5. Component dynamically imports `/modules/analytics/app/page.tsx`
6. Renders imported component

**Key Helper Function:**
```typescript
// /lib/modules/module-registry.ts
import { getModules } from './module-loader'

/**
 * Get module metadata if it's enabled for the current user
 * @param moduleId - The module's unique identifier
 * @param userId - Optional user ID (if not provided, uses current session)
 * @returns Module metadata if enabled, null otherwise
 */
export async function getEnabledModule(
  moduleId: string,
  userId?: string
): Promise<ModuleMetadata | null> {
  const modules = await getModules()
  const module = modules.find(m => m.id === moduleId)

  if (!module) return null

  // Check if module is enabled for this user in module_settings table
  const isEnabled = await isModuleEnabled(moduleId, userId)

  return isEnabled ? module : null
}
```

**Implementation:**
```typescript
// /app/[module]/[[...slug]]/page.tsx
import { notFound } from 'next/navigation'
import { getEnabledModule } from '@/lib/modules/module-registry'

export default async function ModuleCatchAll({ params }) {
  const { module, slug = [] } = await params // Next.js 15: params is a Promise

  // Server-side validation - check if module exists and is enabled
  const moduleInfo = await getEnabledModule(module)
  if (!moduleInfo) notFound()

  // Build relative path to module page
  // Note: Must use relative paths, not @/ alias which doesn't map to /modules
  const slugPath = slug.length > 0 ? slug.join('/') : ''
  const pagePath = `../../../../modules/${module}/app/${slugPath || 'page'}`

  try {
    // Dynamic import (server-side)
    // IMPORTANT: Module pages MUST export default (not named exports)
    const PageComponent = await import(/* @vite-ignore */ pagePath)

    if (!PageComponent.default) {
      console.error(`Module ${module} page must export default component`)
      notFound()
    }

    return <PageComponent.default />
  } catch (error) {
    console.error(`Failed to load module ${module} page:`, error)
    notFound()
  }
}
```

**Requirements for Module Pages:**
- **Must use default export**: `export default function MyPage() {}`
- **Cannot use named exports**: ~~`export function MyPage() {}`~~
- This is because dynamic imports access `.default` property

#### 6.3 How API Routing Works

**Challenge:** Next.js API routes must be in `/app/api/` directory.

**Solution:** Catch-all API route that proxies to module handlers.

**Flow:**
1. Client calls `/api/modules/analytics/stats`
2. Next.js matches `/app/api/modules/[module]/[...path]/route.ts`
3. Route receives `params: { module: 'analytics', path: ['stats'] }`
4. Route validates module is enabled
5. Route dynamically imports `/modules/analytics/api/stats/route.ts`
6. Executes the imported handler's GET/POST/etc method
7. Returns response

**Key Point:** Module API handlers are regular Next.js route handlers, they're just imported dynamically instead of being in `/app/api/`.

#### 6.4 How Dashboard Widgets Work

**Challenge:** Dashboard needs to load widgets from arbitrary modules.

**Solution:** Dashboard queries enabled modules and dynamically imports widgets.

**Flow:**
1. Dashboard component calls `useModules()` hook
2. Hook returns list of enabled modules with `dashboard.widgets: true`
3. Dashboard dynamically imports each widget component
4. Renders widgets in grid layout

**Implementation:**
```typescript
// /app/dashboard/page.tsx
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

export default function Dashboard() {
  const modules = useModules()
  const widgetModules = modules.filter(m => m.dashboard?.widgets)

  return (
    <div className="grid grid-cols-3 gap-4">
      {widgetModules.map(module => (
        <DynamicWidget
          key={module.id}
          moduleId={module.id}
        />
      ))}
    </div>
  )
}

// Dynamic widget loader - uses component registry pattern
function DynamicWidget({ moduleId }: { moduleId: string }) {
  // Map module IDs to static imports (webpack can't handle truly dynamic paths)
  const widgetMap = {
    'analytics': lazy(() => import('../../../../modules/analytics/components/widget')),
    'notes': lazy(() => import('../../../../modules/notes/components/widget')),
    // Add more modules as needed
  }

  const Widget = widgetMap[moduleId]
  if (!Widget) return null

  return (
    <Suspense fallback={<Loader2 className="animate-spin" />}>
      <Widget />
    </Suspense>
  )
}

// Note: This is a limitation - truly dynamic widget loading isn't possible with webpack
// Future enhancement: Build-time code generation to create this mapping automatically
```

#### 6.5 How Sidebar Integration Works

**Challenge:** Sidebar needs to show module nav items without hardcoding.

**Solution:** Sidebar component queries module registry and generates items.

**Implementation:**
```typescript
// /components/app-sidebar.tsx
export function AppSidebar() {
  const modules = useModules()

  return (
    <Sidebar>
      {/* Core nav items */}
      <SidebarItem href="/dashboard" icon={Home}>Dashboard</SidebarItem>
      <SidebarItem href="/tasks" icon={CheckSquare}>Tasks</SidebarItem>

      {/* Module nav items - dynamically generated */}
      {modules.map(module =>
        module.routes.map(route => (
          <SidebarItem
            key={route.path}
            href={route.path}
            icon={getIcon(route.icon)}
          >
            {route.label}
          </SidebarItem>
        ))
      )}
    </Sidebar>
  )
}
```

#### 6.6 How Module Enable/Disable Works

**State Storage:**
- Module enabled state stored in `module_settings` table
- Per-user (each user can enable/disable independently)
- RLS policies ensure user can only modify their own settings

**When Module Disabled:**
1. Removed from module registry's `enabled` set
2. Routes return 404 (catch-all checks enabled state)
3. API routes return 404 (catch-all checks enabled state)
4. Sidebar items hidden (filtered by enabled state)
5. Dashboard widgets not loaded (filtered by enabled state)

**When Module Enabled:**
1. Added to module registry's `enabled` set
2. Routes become accessible
3. API routes become accessible
4. Sidebar items appear
5. Dashboard widgets load

**Implementation Details:**

**Timing:**
- Disable is **immediate at database level** (update to `module_settings` table)
- Client-side requires **page refresh** to update module registry
- In-flight requests complete before routes become unavailable
- Cached data cleared on next page load

**What Happens to In-Flight Operations:**
1. **Database transactions**: Complete normally (RLS policies still apply)
2. **API requests**: Currently executing requests complete
3. **Page renders**: Current page finishes rendering
4. **Next request**: Returns 404 after registry refresh

**User Experience:**
- Settings page shows "Module will be disabled after page refresh"
- Provide "Refresh Now" button for immediate effect
- Or auto-refresh after short delay (2-3 seconds)

#### 6.7 How Module Migrations Work

**Design Decision:** Manual migrations for security and transparency.

**Process:**
1. User enables module
2. App detects module has `database.tables` in manifest
3. App checks `module_migrations` table for applied migrations
4. If pending migrations, show migration UI in Settings
5. User reviews SQL, copies to Supabase SQL Editor
6. User runs SQL in Supabase
7. User clicks "Mark as Applied" in ARI
8. App records migration as applied in `module_migrations`

**Why Not Automatic:**
- Security: No automatic SQL execution
- Transparency: User sees exactly what changes
- Safety: User controls when migrations run
- Best practice: Follows database migration guidelines

#### 6.8 Module Context - No Magic

**Important Clarification:** Modules do NOT automatically receive props or context.

**Reality:**
- Modules are regular React components
- They import hooks like any other component
- `useSupabase()` hook available via `@/components/providers`
- No special wrapper or injection

**Example:**
```typescript
// Module component is just a React component
import { useSupabase } from '@/components/providers'

export default function MyModulePage() {
  const { session } = useSupabase() // Standard hook usage
  // Component logic...
}
```

**Why This Design:**
- Clear and explicit
- No hidden dependencies
- Standard React patterns
- Better for tree-shaking

---

### 7. Core App Architecture Changes

#### 7.1 New Core Files

**`/lib/modules/module-loader.ts`**
- Scans `/modules` directory
- Validates module manifests
- Loads enabled modules
- Handles dependencies
- Provides module registry

**`/lib/modules/module-types.ts`**
- TypeScript interfaces for module manifest
- Module metadata types
- Module component types

**`/lib/modules/module-registry.ts`**
- Singleton registry of all loaded modules
- Methods to query modules
- Module enable/disable logic
- Dependency resolution

**`/lib/modules/module-hooks.ts`**
- React hooks for accessing modules
- `useModules()`: Get all modules
- `useModule(id)`: Get specific module
- `useModuleEnabled(id)`: Check if module enabled

**`/components/error-boundary.tsx`** (NEW)
- React Error Boundary component for catching module crashes
- Must be client component (`'use client'`)
- Wraps module pages to prevent app-wide crashes
- Shows user-friendly error message with "Go to Settings" button

```typescript
// /components/error-boundary.tsx
'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: ReactNode
  onError?: (error: Error, errorInfo: any) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}
```

**`/components/module-loader.tsx`**
- Client component to dynamically load module pages
- Handles module not found errors
- Shows loading states

**`/components/module-sidebar-items.tsx`**
- Generates sidebar items from module manifests
- Handles icon rendering
- Respects enabled/disabled state

**`/app/api/modules/route.ts`**
- API for listing modules
- Enable/disable endpoints
- Module metadata endpoint

**`/app/api/modules/[module]/[...path]/route.ts`** (Catch-all for module APIs)
- Dynamically imports module API handlers
- Validates module is enabled
- Executes appropriate HTTP method handler
- Returns 404 for disabled/missing modules

#### 7.2 Modified Core Files

**`/components/app-sidebar.tsx`**
- Import and render module sidebar items
- Insert module items in appropriate positions
- Update to support dynamic menu items

**`/app/settings/page.tsx`**
- Add "Modules" or "Features" section
- List all installed modules
- Enable/disable toggles for each module
- Show module metadata (version, author, description)

**`/app/dashboard/page.tsx`**
- Load and render module dashboard widgets
- Handle widget errors gracefully
- Support widget grid layout

**`/middleware.ts`**
- Add module route protection
- Validate module enabled state before allowing access
- Redirect to 404 if module disabled

**`/app/[module]/[[...slug]]/page.tsx`** (New dynamic catch-all route)
- Validates module is installed and enabled
- Dynamically imports module page components from `/modules/[module]/app/`
- Checks for and applies custom module layout if present
- Falls back to standard app layout
- Returns 404 for disabled/missing modules
- Wraps module pages with error boundaries (see Section 16 for implementation)

#### 7.3 Database Schema Changes

**New Table: `module_settings`**
```sql
CREATE TABLE IF NOT EXISTS module_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}', -- Module-specific configuration data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own module settings"
  ON module_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Understanding the `settings` JSONB Field:**

This field stores **module-specific configuration** (NOT the enabled/disabled state):

```typescript
// Example: Analytics module settings
{
  "trackingEnabled": true,
  "retentionDays": 90,
  "anonymizeIps": false,
  "dashboardRefreshInterval": 30
}
```

**How Module Settings Work:**

1. **Module Settings Panel Component** (`/components/settings-panel.tsx`):
   - Renders UI for configuration options
   - Reads from and writes to `/api/modules/[module]/settings`

2. **Settings API** (each module implements):
   ```typescript
   // /modules/analytics/api/settings/route.ts
   export async function GET(request: NextRequest) {
     const { data: { user } } = await supabase.auth.getUser()

     const { data } = await supabase
       .from('module_settings')
       .select('settings')
       .eq('user_id', user.id)
       .eq('module_id', 'analytics')
       .single()

     return NextResponse.json(data?.settings || {})
   }

   export async function PUT(request: NextRequest) {
     const body = await request.json()
     const { data: { user } } = await supabase.auth.getUser()

     await supabase
       .from('module_settings')
       .upsert({
         user_id: user.id,
         module_id: 'analytics',
         settings: body
       })

     return NextResponse.json({ success: true })
   }
   ```

3. **Two Types of Settings:**
   - **Enable/Disable**: `module_settings.enabled` (boolean) - managed by core Settings page
   - **Configuration**: `module_settings.settings` (JSONB) - managed by module's settings panel

**New Table: `module_migrations`**
```sql
-- Migration tracking is GLOBAL (not per-user)
-- Migrations apply to the entire database schema, not individual users
CREATE TABLE IF NOT EXISTS module_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id VARCHAR(255) NOT NULL,
  migration_name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(module_id, migration_name)
);

-- No RLS needed - system table, read-only for all authenticated users
CREATE POLICY "All users can view migration status"
  ON module_migrations
  FOR SELECT
  TO authenticated
  USING (true);

-- Note: Only admins can insert (future: implement admin role check)
```

**Migration Status Logic:**
- When module is enabled, check `module_migrations` table for module's required migrations
- If any migrations are missing (not in table), show "Migrations Pending" in Settings UI
- User must apply SQL manually, then click "Mark as Applied"
- Once marked, module is fully functional for all users

---

### 8. User Experience

#### Installing a Module

**Method 1: Git Submodule**
```bash
cd /path/to/ari
git submodule add https://github.com/user/ari-module-name.git modules/module-name
npm run dev  # Module auto-discovered
```

**Method 2: Direct Folder Drop**
```bash
# Download or copy module folder
cp -r ~/Downloads/my-module modules/
npm run dev  # Module auto-discovered
```

#### Managing Modules

**Settings → Features Page:**
- List of all installed modules
- Each module shows:
  - Name and icon
  - Description
  - Version and author
  - Enable/disable toggle
  - "Configure" button (if module has settings panel)
  - Migration status and UI

**Module States:**
- **Enabled**: Full functionality, routes active, sidebar visible
- **Disabled**: No routes, no sidebar items, widgets hidden
- **Error**: Module failed to load, show error message
- **Missing Dependencies**: Show warning, list missing dependencies
- **Migrations Pending**: Module enabled but database setup incomplete

#### Hot Reloading (Development)

In development mode:
- File changes to module `.tsx`/`.ts` files trigger hot reload
- Module component changes reflected instantly
- **Manifest changes (`module.json`)**: Require **page refresh** to take effect
- New modules discovered within seconds (no restart needed)

**Note:** While Next.js hot-reload works for module code, manifest changes need a page refresh because the module registry is loaded at startup. This is a reasonable trade-off since manifest changes are infrequent.

---

### 9. Security Considerations

#### Authentication
- All module routes protected by middleware
- Module API routes must validate Bearer tokens
- No anonymous access to module features

#### Authorization
- Modules must use Supabase RLS policies
- User can only access their own data
- No privilege escalation possible

#### Code Execution
- Modules run in same process as main app
- No sandboxing (trusted modules only)
- Malicious modules can compromise app
- Future: Consider module signing/verification

#### Database
- Modules cannot bypass RLS
- Module migrations validated before execution
- Cannot drop core tables
- Cannot modify core table schemas

#### API Security
- Module API routes follow same security as core APIs
- Input validation required (Zod)
- Rate limiting applies to module APIs
- CORS policies enforced

---

### 10. Performance Considerations

#### Module Loading
- Modules loaded on app startup
- Lazy loading for module components
- Module routes code-split automatically
- Dashboard widgets load in parallel

#### Caching
- Module manifests cached in memory
- Module registry cached across requests
- Database queries cached where appropriate

#### Bundle Size
- Each module adds to bundle size
- Disabled modules still included in bundle (future: exclude)
- Consider dynamic imports for large modules

---

### 11. Testing Strategy

#### Module Validation Tests
- Manifest schema validation
- Required files present
- Valid icon names
- Valid route paths

#### Integration Tests
- Module pages load correctly
- API routes work with authentication
- Database RLS policies enforced
- Sidebar items render correctly

#### End-to-End Tests
- Install module
- Enable/disable module
- Access module pages
- Use module API
- Uninstall module

---

### 12. Example Modules

#### Example 1: Analytics Module

**Purpose**: Track user actions and display analytics

**Structure:**
```
/modules/analytics
  module.json
  /app
    page.tsx              # Analytics dashboard
    /reports
      page.tsx            # Reports page
  /components
    widget.tsx            # Dashboard widget
    settings-panel.tsx    # Settings
  /api
    /track
      route.ts            # Track event endpoint
    /stats
      route.ts            # Get stats endpoint
  /database
    schema.sql            # analytics_events table
```

#### Example 2: Notes Module

**Purpose**: Simple note-taking feature

**Structure:**
```
/modules/notes
  module.json
  /app
    page.tsx              # Notes list
    /[id]
      page.tsx            # Single note view
  /components
    note-editor.tsx
    note-list.tsx
  /api
    /notes
      route.ts            # CRUD endpoints
  /database
    schema.sql            # notes table
```

#### Example 3: Habit Tracker Module

**Purpose**: Track daily habits

**Features:**
- Depends on `fitness` core feature
- Dashboard widget showing streak
- Custom settings panel
- Daily reminder notifications (future)

---

### 13. Migration Path

#### Phase 1: Core Infrastructure (Week 1-2)
1. Create module loader system
2. Implement module registry
3. Add dynamic routing for modules
4. Create database tables
5. Update middleware

#### Phase 2: UI Integration (Week 2-3)
1. Update sidebar to support dynamic items
2. Create Settings → Features page
3. Implement enable/disable functionality
4. Add dashboard widget support

#### Phase 3: Developer Experience (Week 3-4)
1. Create module template/boilerplate
2. Write developer documentation
3. Create example modules
4. Add module CLI tools (optional)

#### Phase 4: Module Updates & Versioning (Week 4+)
1. Version update detection and prompts
2. Migration path for breaking changes
3. Backward compatibility checks
4. Hot reloading improvements

#### Phase 5: Advanced Features (Week 5+)
1. Module marketplace (future)
2. Module signing/verification
3. Module permissions enforcement
4. Module analytics and telemetry

---

### 14. Future Enhancements

#### Short Term
- Module CLI: `npm run module:create <name>`
- Module templates for common patterns
- Better error messages for module developers
- Module dependency graph visualization

#### Medium Term
- Module marketplace/registry
- Module auto-updates
- Module permissions system (granular control)
- Module analytics (usage tracking)

#### Long Term
- Remote module loading (install from URL)
- Module sandboxing (security)
- Module revenue sharing (paid modules)
- Community module repository

---

### 15. Architecture Decisions

All key architectural decisions have been finalized:

#### ✅ Module Loading Strategy
- **Hybrid Approach**: Server-side manifest loading, client-side lazy component loading
- **Development**: Hot-reload on file changes, detailed error messages, aggressive validation
- **Production**: Load on app restart, user-friendly errors, cached registry

#### ✅ Module State Management
- **Per-User**: Each user can enable/disable modules independently
- **Currently single-user app**, but architecture supports multi-user future

#### ✅ Module Layouts
- **Default to Standard**: Modules use app's standard layout (sidebar, header, breadcrumbs)
- **Override Option**: Modules can define custom `layout.tsx` for full control

#### ✅ Database Migrations
- **Manual "Apply Migrations" Step**: User must explicitly apply migrations when enabling module
- **Failure Handling**: If migrations fail, module stays disabled and shows ERROR state on Features page

#### ✅ Module Icons
- **Lucide Icons Only (MVP)**: Module manifest `icon` field must be a Lucide icon name (e.g., "Zap", "Package")
- **Future**: Support for custom icons (requires build-time asset copying solution)

#### ✅ Module Uninstall
- **Leave Orphaned Settings**: Database entries in `module_settings` remain (harmless, allows reinstall without reconfiguration)

#### ✅ Module Route Conflicts
- **Automatic Namespacing**: All modules automatically namespaced under `/{module-id}/`
- **Example**: Module with `id: "analytics"` → routes always under `/analytics`
- **No conflicts possible**

#### ✅ Error Handling
- **Auto-Disable on Crash**: If module page crashes, automatically disable module and redirect user
- **Error Message**: Clear notification explaining what happened
- **App Protection**: Rest of app continues working normally

#### ✅ Module Context
- **Manual Imports**: Modules import hooks like `useSupabase()` from `@/components/providers`
- **No Magic**: Nothing is automatically injected - standard React patterns
- **Opt-in Utilities**: Modules import core utilities (tasks, contacts, fitness) as needed
- **Benefits**: Clear dependencies, loose coupling, smaller bundles, better testability

**Example:**
```typescript
// Module imports what it needs
import { useSupabase } from '@/components/providers'
import { getTasks } from '@/lib/tasks'

export default function MyModulePage() {
  const { session } = useSupabase()
  // Use session...
}
```

---

### 16. Known Limitations & Future Considerations

#### Current Limitations

1. **Module Static Assets**: Modules cannot serve static files from their own folders (Next.js limitation). Workarounds:
   - Use data URLs for small assets
   - Host assets externally (CDN)
   - Future: Build step to copy assets to `/public`

2. **Reserved Route Names**: Module IDs cannot conflict with core routes. **Complete list of reserved IDs:**

```typescript
// /lib/modules/reserved-routes.ts
export const RESERVED_MODULE_IDS = [
  // Core pages
  'dashboard',
  'tasks',
  'contacts',
  'settings',
  'profile',
  'sign-in',
  'sign-up',

  // Core features
  'daily-fitness',
  'hyrox',
  'northstar',
  'radar',
  'assist',

  // API routes
  'api',

  // Next.js reserved
  '_next',
  'public',

  // Future reserved
  'admin',
  'billing',
  'teams'
] as const

export function isReservedModuleId(id: string): boolean {
  return RESERVED_MODULE_IDS.includes(id as any)
}
```

**Validation:**
- Checked during manifest parsing in `module-loader.ts`
- Module fails to load with error: `"Module ID '${id}' conflicts with reserved route"`
- Also validates sub-routes don't conflict (e.g., module can have `/my-module/settings` but not root `/settings`)

3. **TypeScript Path Resolution**: Modules must use relative imports for their own files. The `@/` alias only works for core app imports.

4. **Bundle Size**: Disabled modules are still included in the build. Future optimization: exclude disabled modules from production bundles.

5. **Hot Reload for Manifests**: Changing `module.json` requires page refresh (not instant like component changes).

6. **Dashboard Widget Dynamic Loading**: Due to webpack limitations, dashboard widgets cannot be truly dynamically imported using string paths. Current approach requires a static mapping of module IDs to widget imports. Future enhancement: build-time code generation to automate this mapping.

7. **Error Boundaries**: Module pages should be wrapped in error boundaries to prevent crashes. Implementation:

```typescript
// /app/[module]/[[...slug]]/page.tsx
import { ErrorBoundary } from '@/components/error-boundary'

export default async function ModuleCatchAll({ params }) {
  const { module, slug = [] } = await params

  const moduleInfo = await getEnabledModule(module)
  if (!moduleInfo) notFound()

  const slugPath = slug.length > 0 ? slug.join('/') : ''
  const pagePath = `../../../../modules/${module}/app/${slugPath}/page`

  try {
    const PageComponent = await import(/* @vite-ignore */ pagePath)
    return (
      <ErrorBoundary
        fallback={<ModuleErrorFallback moduleName={moduleInfo.name} />}
        onError={(error) => {
          console.error(`Module ${module} crashed:`, error)
          // Future: automatically disable module and notify user
        }}
      >
        <PageComponent.default />
      </ErrorBoundary>
    )
  } catch (error) {
    notFound()
  }
}

function ModuleErrorFallback({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-medium">Module Error</h2>
        <p className="text-muted-foreground">
          {moduleName} encountered an error and has been temporarily disabled.
        </p>
        <Button onClick={() => window.location.href = '/settings'}>
          Go to Settings
        </Button>
      </div>
    </div>
  )
}
```

### 19. Module Version Updates & Breaking Changes

**Critical Design Decision**: Version updates are NOT future - they happen immediately during development.

#### Update Workflow

**When Module is Updated (v1.0.0 → v1.1.0):**

1. **User pulls latest code:**
   ```bash
   cd modules/analytics
   git pull origin main
   ```

2. **App detects version change** on next startup/refresh:
   - Compares `module.json` version with last loaded version
   - Checks for new migrations in `/database/migrations/`
   - Compares manifest schema changes

3. **Settings UI shows update banner:**
   ```
   ┌────────────────────────────────────────────────┐
   │ ⚠️  Analytics Module Update Available          │
   │                                                 │
   │ Current: v1.0.0  →  Available: v1.1.0         │
   │                                                 │
   │ Changes:                                        │
   │ • New migrations: 002_add_exports.sql          │
   │ • Updated: API routes                          │
   │                                                 │
   │ [View Changelog]  [Update Now]                 │
   └────────────────────────────────────────────────┘
   ```

4. **Breaking Changes Handling:**
   - **Semantic versioning enforced**: Major version bump = breaking changes
   - Example: v1.5.0 → v2.0.0 = may break existing functionality
   - User must acknowledge breaking changes before updating
   - Old data migration path documented in module's CHANGELOG.md

5. **Migration Path:**
   - New migrations auto-detected from `database/migrations/` folder
   - Applied using same manual process (copy SQL, run in Supabase, mark applied)
   - Migrations tracked by name, not version (allows rollback)

#### Backward Compatibility

**Module Manifest Schema Versioning:**
- Current schema version tracked in manifest: `"schemaVersion": "1.0"`
- Breaking manifest changes trigger upgrade prompt
- Core app maintains backward compatibility for 2 schema versions

**API Compatibility:**
- Module API routes should version themselves: `/api/modules/analytics/v1/stats`
- Breaking API changes require new version endpoint

#### Development Best Practices

1. **Use semantic versioning**: `MAJOR.MINOR.PATCH`
2. **Document breaking changes** in CHANGELOG.md
3. **Test migrations locally** before pushing updates
4. **Deprecate before removing**: Warn users for 1-2 versions before removing features
5. **Provide migration scripts**: SQL for data transformation when schema changes

#### Future Enhancements

1. **In-app updater**: One-click updates without git commands
2. **Module Permissions**: Enforce fine-grained permissions (e.g., "can't access contacts API")
3. **Module Publishing**: Centralized module registry/marketplace
4. **Module Testing**: Integrated test runner for module tests
5. **Module Theming**: Dark mode and custom theme support
6. **Database Conflicts**: Detection and resolution of schema conflicts
7. **Module Communication**: Event bus for inter-module messaging
8. **Module Lifecycle Hooks**: `onEnable`, `onDisable`, `onInstall`, `onUninstall`
9. **Module Analytics**: Usage tracking and performance monitoring
10. **Module Signing**: Cryptographic verification for security

---

### 17. Success Criteria

The Modules system is successful when:

✅ Users can install modules by dropping folders into `/modules`
✅ Modules integrate seamlessly with existing app features
✅ Disabled modules have zero impact on app performance
✅ Module routes respect authentication and RLS policies
✅ The app remains stable with 20+ modules installed
✅ Documentation is clear enough for external developers to contribute

---

### 18. Documentation Deliverables

#### For Users
- **User Guide**: How to install, enable, disable modules
- **Module Directory**: List of available modules
- **Troubleshooting**: Common issues and solutions

#### For Developers
- **Developer Guide**: Step-by-step module creation tutorial
- **API Reference**: Module manifest schema, available APIs
- **Best Practices**: Security, performance, UX guidelines
- **Example Modules**: Working examples with source code
- **Migration Guide**: Converting existing features to modules

---

## Appendix A: Module Manifest JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "description", "version", "author"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$",
      "description": "Unique module identifier (kebab-case)"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "author": {
      "type": "string"
    },
    "icon": {
      "type": "string",
      "description": "Lucide icon name"
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "permissions": {
      "type": "object",
      "properties": {
        "database": {"type": "boolean"},
        "api": {"type": "boolean"},
        "dashboard": {"type": "boolean"}
      }
    },
    "routes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "label"],
        "properties": {
          "path": {"type": "string"},
          "label": {"type": "string"},
          "icon": {"type": "string"},
          "sidebarPosition": {
            "type": "string",
            "enum": ["main", "bottom", "secondary"]
          },
          "children": {
            "type": "array"
          }
        }
      }
    },
    "dependencies": {
      "type": "object",
      "properties": {
        "modules": {
          "type": "array",
          "items": {"type": "string"}
        },
        "coreFeatures": {
          "type": "array",
          "items": {"type": "string"}
        }
      }
    },
    "database": {
      "type": "object",
      "properties": {
        "tables": {
          "type": "array",
          "items": {"type": "string"}
        },
        "migrations": {"type": "string"}
      }
    },
    "dashboard": {
      "type": "object",
      "properties": {
        "widgets": {"type": "boolean"},
        "widgetComponents": {
          "type": "array",
          "items": {"type": "string"}
        }
      }
    },
    "settings": {
      "type": "object",
      "properties": {
        "panel": {"type": "string"}
      }
    }
  }
}
```

---

## Appendix B: Module API Reference

### Module Loader API

```typescript
// Get all modules
import { getModules } from '@/lib/modules/module-registry'
const modules = getModules()

// Get specific module
import { getModule } from '@/lib/modules/module-registry'
const module = getModule('analytics')

// Check if module enabled
import { isModuleEnabled } from '@/lib/modules/module-registry'
const enabled = await isModuleEnabled('analytics', userId)

// Enable/disable module
import { setModuleEnabled } from '@/lib/modules/module-registry'
await setModuleEnabled('analytics', userId, true)
```

### React Hooks

```typescript
// In a component
import { useModules, useModule, useModuleEnabled } from '@/lib/modules/module-hooks'

const modules = useModules()
const analyticsModule = useModule('analytics')
const isEnabled = useModuleEnabled('analytics')
```

---

## Appendix C: Example Module Implementation

See `/modules/example-module/` for a complete working example demonstrating:
- Manifest configuration
- Page routing
- API endpoints
- Database schema with RLS
- Dashboard widget
- Settings panel
- Inter-module communication

---

**Document Version**: 2.2
**Last Updated**: 2025-10-13
**Status**: Draft - Ready for Implementation

---

## Revision History

### Version 2.2 (2025-10-13)
**Third Critical Review - Architecture Completeness**

**Fixed 15 Critical Issues:**
1. ✅ **Simplified Example Misleading**: Updated Section 3.2 example to use correct relative paths and await params
2. ✅ **Useless API Prefix**: Removed `api.prefix` field from manifest - always auto-determined as `/api/modules/[id]`
3. ✅ **Missing getEnabledModule()**: Added complete implementation in Section 6.2 with types and behavior
4. ✅ **Module ID vs Route Confusion**: Clarified routes MUST start with `/{module-id}` - automatic namespacing enforced
5. ✅ **Next.js 15 Params Inconsistency**: Fixed all examples to use `await params` consistently
6. ✅ **Default Export Requirement**: Documented that module pages MUST use default export, not named exports
7. ✅ **Module Disable Timing**: Added detailed specification of disable behavior, in-flight requests, and refresh requirement
8. ✅ **Reserved Module IDs**: Added complete list with validation logic in `/lib/modules/reserved-routes.ts`
9. ✅ **Circular Dependency Detection**: Added DFS algorithm pseudo-code and error handling specification
10. ✅ **Multiple Widgets**: Clarified all widgets in array are rendered in order specified
11. ✅ **Missing ErrorBoundary**: Added complete ErrorBoundary component implementation in Section 7.1
12. ✅ **Module Settings Ambiguity**: Clarified three types of settings and how they interact with JSONB storage
13. ✅ **API Route Context Missing**: Fixed to pass context object with params to module handlers
14. ✅ **Migration Rollback**: Added comprehensive failure handling and recovery strategy
15. ✅ **Version Updates**: Added complete Section 19 for module version updates and breaking changes

**New Sections:**
- Section 19: "Module Version Updates & Breaking Changes" - critical for development workflow
- Complete ErrorBoundary component implementation
- Reserved module IDs validation specification
- Module settings persistence architecture

**Improved Specifications:**
- getEnabledModule() function signature and implementation
- Circular dependency detection algorithm
- Migration failure recovery procedures
- Module disable timing and in-flight request handling

**Version Bump Justification**: Major improvements to implementation completeness, no architecture changes

### Version 2.1 (2025-10-13)
**Bug Fixes and Technical Clarifications**

**Fixed Issues from Second Critical Review:**
- ✅ **Section Numbering**: Fixed duplicate Section 7 issue (User Experience now correctly Section 8, cascaded all subsequent sections)
- ✅ **Dynamic Import Paths**: Fixed all instances of `@/modules` alias to use relative paths `../../../../modules/` with webpack ignore comments
  - Fixed in API catch-all route (line 252)
  - Fixed in page catch-all route (line 1415)
  - Fixed in dashboard widget loader (line 1483)
- ✅ **Route Path Consistency**: Clarified manifest `routes.path` should match module ID (e.g., `"path": "/module-unique-id"`)
- ✅ **Removed Public Folder**: Removed all references to `/public` folder from module structure and examples (lines 130, 1257)
- ✅ **Module Icons Clarified**: Lucide icons only for MVP, removed references to custom SVG from public folder
- ✅ **Manifest `enabled` Field**: Clarified this is the default state for new users, not source of truth (database overrides per-user)
- ✅ **Error Boundaries**: Added complete implementation example in Section 16 (lines 2072-2120)
- ✅ **Dashboard Widgets**: Updated to static import mapping pattern due to webpack limitations (lines 1479-1499)
- ✅ **API Handler TypeScript Types**: Fixed params types to be `Promise<{...}>` for Next.js 15 compatibility (lines 241, 271-304)
- ✅ **Migration Tracking**: Clarified migrations are GLOBAL not per-user, added `applied_by` field, updated documentation (lines 1730-1755)

**Known Limitations Documented:**
- Dashboard widget dynamic loading limitation (requires static mapping)
- TypeScript path resolution (@/ alias doesn't work for module internal imports)
- Module static assets not supported (Next.js limitation)

**Version Bump Justification**: Bug fixes and clarifications only, no architecture changes

### Version 2.0 (2025-10-12)
**Major Revisions - Architecture Clarifications**

**Fixed Critical Issues:**
- ✅ API Routes: Clarified catch-all route architecture with dynamic imports
- ✅ Page Routing: Explained catch-all route mechanism upfront
- ✅ Database Migrations: Changed to manual process with copy-to-clipboard UI
- ✅ Module Context: Removed "automatic props" - clarified manual imports
- ✅ Uninstall Feature: Removed impossible filesystem deletion from UI

**Improvements:**
- Added Section 6: "Implementation Details & Technical Clarifications"
- Detailed explanation of how each integration point works
- Added code examples for catch-all routes
- Clarified hot-reload behavior (page refresh for manifests)
- Added "Known Limitations" section
- Clarified permissions field as metadata only
- Removed module static assets feature (deferred to future)

**Architecture Decisions:**
- API Routes: Catch-all with dynamic imports (Option A)
- Database: Manual migrations with UI (Option B)
- Context: Manual imports via hooks (Option A)
- Hot Reload: Page refresh for manifest changes
- Assets: Deferred to future (not in MVP)
- Permissions: Metadata only (not enforced)

### Version 1.0 (2025-10-12)
**Initial Draft**
- Complete module system specification
- Developer guide with examples
- Architecture overview
- Migration plan
