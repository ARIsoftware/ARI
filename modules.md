# ARI Module System - Developer Guide

**Build powerful, self-contained features for ARI using the modular plugin architecture.**

> **Version**: 3.0
> **Last Updated**: 2025-10-15
> **Status**: Production Ready

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Module Architecture](#module-architecture)
3. [Module Manifest Reference](#module-manifest-reference)
4. [Creating Your First Module](#creating-your-first-module)
5. [Module Features](#module-features)
6. [Advanced Topics](#advanced-topics)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### What are ARI Modules?

Modules are self-contained features that extend ARI's functionality. They can add:
- New pages and routes
- API endpoints
- Database tables
- Dashboard widgets
- Settings panels
- Sidebar navigation items

### Module System Benefits

✅ **Plug-and-Play**: Drop a module folder into `/modules` and it's auto-discovered
✅ **Isolated**: Modules don't affect each other or the core app
✅ **User Control**: Users can enable/disable modules individually
✅ **Secure**: Built-in authentication, RLS policies, and error boundaries
✅ **Type-Safe**: Full TypeScript support with IntelliSense

### Installation

Modules are automatically discovered from the `/modules` directory:

```bash
# Method 1: Git clone
cd modules/
git clone https://github.com/user/ari-amazing-module.git amazing-module

# Method 2: Copy folder
cp -r ~/Downloads/my-module modules/

# Method 3: Git submodule
git submodule add https://github.com/user/ari-module.git modules/my-module

# Restart dev server (or refresh page)
npm run dev
```

That's it! The module will appear in the sidebar and settings automatically.

---

## Module Architecture

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

### Key Design Decisions

#### 1. Registry-Based Routing

**Why**: Next.js can't dynamically discover pages outside `/app` at build time.

**Solution**: Modules must be registered in `MODULE_PAGES` object:

```typescript
// /app/[module]/[[...slug]]/page.tsx
const MODULE_PAGES: Record<string, any> = {
  'hello-world': () => import('@/modules/hello-world/app/page'),
  'analytics': () => import('@/modules/analytics/app/page'),
  // Add your module here
}
```

**When adding a new module**, you must update this registry.

#### 2. Fullscreen Mode

Modules can choose their layout via `fullscreen` field in manifest:

- `fullscreen: false` (default) - Shows sidebar, breadcrumb header, and top bar
- `fullscreen: true` - Pure module content, no chrome

#### 3. Title Field (New!)

Modules can display a small title above their name in the sidebar:

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

---

## Module Manifest Reference

### Required Fields

```json
{
  "id": "my-module",
  "name": "My Module",
  "description": "What this module does",
  "version": "1.0.0",
  "author": "Your Name <email@example.com>",
  "icon": "Package",
  "enabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (kebab-case, must match folder name) |
| `name` | `string` | Display name in UI |
| `description` | `string` | Brief description (max 200 chars) |
| `version` | `string` | Semantic version (e.g., "1.0.0") |
| `author` | `string` | Your name and email |
| `icon` | `string` | [Lucide icon name](https://lucide.dev) (e.g., "Package", "Zap") |
| `enabled` | `boolean` | Default enabled state for new users |

### Optional Fields

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
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Optional title shown above name in sidebar |
| `fullscreen` | `boolean` | Hide sidebar/header when `true` (default: `false`) |
| `menuPriority` | `number` | Sort order in sidebar (1-100, lower = higher, default: 50) |
| `permissions` | `object` | Metadata about module capabilities (not enforced) |
| `routes` | `array` | Navigation items for sidebar |
| `database` | `object` | Database table configuration |
| `dashboard` | `object` | Dashboard widget configuration |
| `settings` | `object` | Settings panel configuration |

#### Route Configuration

```json
"routes": [
  {
    "path": "/my-module",
    "label": "My Module",
    "icon": "Zap",
    "sidebarPosition": "main"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | **Must start with `/{module-id}`** |
| `label` | `string` | Display text in sidebar |
| `icon` | `string` | Lucide icon name (optional, inherits from module icon) |
| `sidebarPosition` | `string` | Where to show: `"main"`, `"bottom"`, or `"secondary"` |

---

## Creating Your First Module

### Step 1: Create Module Structure

```bash
mkdir -p modules/my-module/{app,components,api,database,types}
cd modules/my-module
```

### Step 2: Create `module.json`

```json
{
  "id": "my-module",
  "title": "Getting Started",
  "name": "My Module",
  "description": "A simple example module",
  "version": "1.0.0",
  "author": "Your Name <you@example.com>",
  "icon": "Sparkles",
  "enabled": true,
  "fullscreen": false,
  "menuPriority": 10,
  "routes": [
    {
      "path": "/my-module",
      "label": "My Module",
      "icon": "Sparkles",
      "sidebarPosition": "main"
    }
  ]
}
```

### Step 3: Create Main Page

```tsx
// modules/my-module/app/page.tsx
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
          <p className="text-sm text-muted-foreground mt-2">
            This is your module's main page.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Step 4: Register Module in Catch-All

**IMPORTANT**: You must manually register your module's page loader.

Edit `/app/[module]/[[...slug]]/page.tsx`:

```typescript
const MODULE_PAGES: Record<string, any> = {
  'hello-world': () => import('@/modules/hello-world/app/page'),
  'my-module': () => import('@/modules/my-module/app/page'), // Add this line
}
```

### Step 5: Test Your Module

```bash
npm run dev
```

Navigate to `http://localhost:3000/my-module`

✅ Your module should appear in the sidebar
✅ Clicking it loads your page
✅ Authentication is enforced (redirects to sign-in if not logged in)

---

## Module Features

### API Routes

Create API endpoints for your module.

#### File Structure

```
modules/my-module/
  api/
    data/
      route.ts      # /api/modules/my-module/data
    stats/
      route.ts      # /api/modules/my-module/stats
```

#### Example API Route

```typescript
// modules/my-module/api/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-auth'
import { z } from 'zod'

// Validation schema
const CreateDataSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional()
})

export async function GET(request: NextRequest) {
  const supabase = createClient()

  // ALWAYS validate authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Query database (RLS policies auto-filter by user_id)
  const { data, error } = await supabase
    .from('my_module_data')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Validate auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
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

  // Insert into database
  const { data, error } = await supabase
    .from('my_module_data')
    .insert({ user_id: user.id, title, content })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create data' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data }, { status: 201 })
}
```

**API URL**: `http://localhost:3000/api/modules/my-module/data`

**Security Checklist**:
- ✅ Always validate authentication
- ✅ Use Zod for input validation
- ✅ Rely on RLS policies for data isolation
- ✅ Return appropriate HTTP status codes
- ✅ Log errors for debugging

### Database Tables

#### Schema File

```sql
-- modules/my-module/database/schema.sql

-- Create table
CREATE TABLE IF NOT EXISTS my_module_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_my_module_data_user_id
  ON my_module_data(user_id);

-- Enable RLS
ALTER TABLE my_module_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own data"
  ON my_module_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data"
  ON my_module_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data"
  ON my_module_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own data"
  ON my_module_data FOR DELETE
  USING (auth.uid() = user_id);
```

#### Register Tables in Manifest

```json
{
  "database": {
    "tables": ["my_module_data"],
    "migrations": "./database/migrations"
  }
}
```

#### Applying Migrations

**Manual Process** (by design for security):

1. Enable your module in Settings → Features
2. App shows "Migrations Pending" status
3. Click "View SQL" to see the migration
4. Copy SQL to clipboard
5. Open Supabase SQL Editor
6. Paste and run SQL
7. Return to ARI and click "Mark as Applied"

### Dashboard Widgets

Add a widget to the main dashboard.

#### Widget Component

```tsx
// modules/my-module/components/widget.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSupabase } from '@/components/providers'
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">My Module</CardTitle>
        <Sparkles className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-medium">
          {loading ? '—' : count}
        </div>
        <p className="text-xs text-muted-foreground">
          total items
        </p>
      </CardContent>
    </Card>
  )
}
```

#### Register Widget in Manifest

```json
{
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  }
}
```

### Settings Panel

Add a settings panel for your module.

#### Settings Component

```tsx
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
    apiKey: ''
  })

  const handleSave = async () => {
    // Save to your module's API endpoint
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

        <Button onClick={handleSave}>Save Settings</Button>
      </div>
    </div>
  )
}
```

#### Register Settings in Manifest

```json
{
  "settings": {
    "panel": "./components/settings-panel.tsx"
  }
}
```

---

## Advanced Topics

### Sub-Pages

Create nested routes within your module.

#### File Structure

```
modules/my-module/
  app/
    page.tsx                  # /my-module
    settings/
      page.tsx               # /my-module/settings
    analytics/
      page.tsx               # /my-module/analytics
```

#### Update Manifest

```json
{
  "routes": [
    {
      "path": "/my-module",
      "label": "My Module",
      "icon": "Sparkles",
      "sidebarPosition": "main",
      "children": [
        {
          "path": "/my-module/settings",
          "label": "Settings",
          "icon": "Settings"
        },
        {
          "path": "/my-module/analytics",
          "label": "Analytics",
          "icon": "BarChart"
        }
      ]
    }
  ]
}
```

### TypeScript Types

Define shared types for your module.

```typescript
// modules/my-module/types/index.ts

export interface MyModuleData {
  id: string
  user_id: string
  title: string
  content?: string
  created_at: string
  updated_at: string
}

export interface MyModuleSettings {
  enabled: boolean
  apiKey: string
}
```

Use in your components:

```typescript
import type { MyModuleData } from '../types'

const data: MyModuleData = await fetchData()
```

### Using Core App Features

Import and use core app utilities:

```typescript
import { useSupabase } from '@/components/providers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getTasks } from '@/lib/tasks'
import { getContacts } from '@/lib/contacts'
```

**Available Core Features**:
- Authentication: `useSupabase()` hook
- UI Components: All Shadcn/ui components from `@/components/ui/`
- Tasks API: `@/lib/tasks`
- Contacts API: `@/lib/contacts`
- Fitness API: `@/lib/fitness-stats`

### Fullscreen Modules

Create immersive, full-screen experiences.

```json
{
  "fullscreen": true
}
```

When `fullscreen: true`:
- ❌ No sidebar
- ❌ No breadcrumb header
- ❌ No top bar (TaskAnnouncement)
- ✅ Pure module content fills screen

Use cases: Games, dashboards, visualization tools, focused tools

---

## Best Practices

### Security

1. **Always validate authentication** in API routes
   ```typescript
   const { data: { user }, error } = await supabase.auth.getUser()
   if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
   ```

2. **Use RLS policies** on all database tables
   ```sql
   ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "policy_name" ON my_table USING (auth.uid() = user_id);
   ```

3. **Validate all inputs** with Zod
   ```typescript
   const Schema = z.object({ field: z.string().min(1) })
   const result = Schema.safeParse(body)
   ```

4. **Never expose secrets** in client code

### Performance

1. **Lazy load heavy components**
   ```typescript
   const HeavyChart = dynamic(() => import('./heavy-chart'), {
     loading: () => <Loader2 className="animate-spin" />
   })
   ```

2. **Use database indexes** for queries
   ```sql
   CREATE INDEX idx_my_table_user_id ON my_table(user_id);
   ```

3. **Cache API responses** where appropriate
4. **Optimize bundle size** - avoid importing entire libraries

### Code Quality

1. **Use TypeScript** for type safety
2. **Handle errors gracefully** with try-catch
3. **Show loading states** for async operations
4. **Write clear comments** for complex logic
5. **Follow naming conventions** (kebab-case for IDs, PascalCase for components)

### Styling

1. **Use Tailwind CSS** for consistency
2. **Use Shadcn/ui components** when possible
3. **Follow app's color scheme** (see existing pages for reference)
4. **Design responsive layouts** (test mobile)

### Documentation

1. **Create README.md** with:
   - Module description
   - Installation instructions
   - Configuration options
   - API documentation
   - Screenshots

2. **Document API endpoints** with examples
3. **Include troubleshooting section**
4. **Version your changes** with semantic versioning

---

## Troubleshooting

### Module Not Appearing in Sidebar

**Check**:
- ✅ `module.json` exists and is valid JSON
- ✅ `routes` array is defined in manifest
- ✅ Module ID matches folder name
- ✅ Module registered in `MODULE_PAGES` object
- ✅ Dev server restarted

**Fix**:
```bash
# Validate JSON
cat modules/my-module/module.json | jq .

# Restart dev server
# (Kill with Ctrl+C, then run again)
npm run dev
```

### API Routes Returning 404

**Check**:
- ✅ File path: `modules/[id]/api/[route]/route.ts`
- ✅ Exports `GET`, `POST`, etc. functions
- ✅ `permissions.api: true` in manifest

**Fix**:
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Page Stuck on Loading

**Check**:
- ✅ Module page exports default: `export default function Page() {}`
- ✅ Not using named export: ~~`export function Page() {}`~~
- ✅ Module registered in MODULE_PAGES
- ✅ Check browser console for errors

**Fix**:
```typescript
// ✅ Correct
export default function MyModulePage() {
  return <div>Content</div>
}

// ❌ Wrong
export function MyModulePage() {
  return <div>Content</div>
}
```

### Database Errors

**Check**:
- ✅ Migrations applied in Supabase
- ✅ RLS policies enabled
- ✅ User is authenticated
- ✅ Table names match manifest

**Fix**:
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'my_module_data';

-- Should show: rowsecurity = true
```

### Widget Not Showing

**Check**:
- ✅ `dashboard.widgets: true` in manifest
- ✅ Widget component exports correctly
- ✅ Dashboard includes module widgets
- ✅ Module is enabled

**Fix**: Check dashboard page includes widget rendering logic

---

## Module Template

Use this as a starting point for new modules:

```bash
modules/my-module/
├── module.json              # ← Required
├── README.md
├── app/
│   └── page.tsx            # ← Required (must export default)
├── components/
│   ├── widget.tsx          # ← Optional dashboard widget
│   └── settings-panel.tsx  # ← Optional settings
├── api/
│   └── data/
│       └── route.ts        # ← Optional API endpoints
├── database/
│   ├── schema.sql          # ← Optional DB schema
│   └── migrations/
│       └── 001_init.sql
└── types/
    └── index.ts            # ← Optional TypeScript types
```

---

## Examples

Check out the `hello-world` module for a complete working example:

```
/modules/hello-world/
```

This module demonstrates:
- ✅ Module manifest with all fields
- ✅ Main page with authentication
- ✅ API routes (GET, POST, DELETE)
- ✅ Database table with RLS
- ✅ Dashboard widget
- ✅ Settings panel
- ✅ TypeScript types
- ✅ Comprehensive documentation

---

## Publishing Your Module

### 1. Prepare for Release

```bash
# Test thoroughly
npm run dev  # Test in development
npm run build  # Test production build

# Write documentation
cat > README.md << 'EOF'
# My Amazing Module

Description...

## Installation
...
EOF

# Add license
cat > LICENSE << 'EOF'
MIT License
...
EOF
```

### 2. Create Git Repository

```bash
cd modules/my-module
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/ari-my-module.git
git push -u origin main
```

### 3. Tag Version

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 4. Installation by Users

Users can install your module with:

```bash
cd modules/
git clone https://github.com/yourname/ari-my-module.git my-module
```

---

## Additional Resources

- **Module Types**: See `/lib/modules/module-types.ts` for full TypeScript definitions
- **Module Registry**: See `/lib/modules/module-registry.ts` for how modules are loaded
- **Hello World Module**: See `/modules/hello-world/` for complete example
- **Lucide Icons**: https://lucide.dev for available icon names
- **Shadcn/ui**: https://ui.shadcn.com for UI components

---

**Happy Module Building! 🚀**

*Questions? Check the existing modules or open an issue in the ARI repository.*
