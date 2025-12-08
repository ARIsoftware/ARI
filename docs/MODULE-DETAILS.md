# Module Architecture Migration Guide

This document describes a proven module architecture for Next.js applications. Your task is to help migrate this application to use a similar modular structure.

## Phase 1: Learn the Reference Architecture

First, read and understand this `/docs/MODULE-DETAILS.md` file thoroughly. Pay special attention to:

1. **Core Concepts**
   - How modules are self-contained in `/modules-core/{module-id}/` directories
   - The `module.json` manifest format and required fields
   - How catch-all routes (`/app/[module]/[[...slug]]/page.tsx`) dynamically serve module pages
   - The registry-based approach for dynamic imports (required because Next.js/Turbopack can't resolve fully dynamic imports)

2. **Infrastructure Components**
   - `/lib/modules-core/module-types.ts` - TypeScript interfaces
   - `/lib/modules-core/module-loader.ts` - Server-side discovery
   - `/lib/modules-core/module-registry.ts` - Module state management
   - `/lib/modules-core/module-hooks.ts` - Client-side React hooks
   - `/lib/modules-core/reserved-routes.ts` - Protected route names
   - `/lib/generated/module-pages-registry.ts` - Auto-generated before build

3. **Key Patterns**
   - Build-time registry generation via `scripts/generate-module-registry.js`
   - Per-user module enable/disable via `module_settings` database table
   - API routes proxied through `/api/modules-core/[module]/[[...path]]/route.ts`
   - Dashboard widgets and settings panels registered in module.json

## Phase 2: Analyze This Codebase

Now explore this codebase to understand:

1. **Current Structure**
   - What features/pages exist that could become modules?
   - What is the current routing structure?
   - How is authentication handled?
   - What database/ORM is used?

2. **Identify Module Candidates**
   - Which features are self-contained and could be isolated?
   - Which features have their own database tables?
   - Which features have their own API routes?

3. **Assess Compatibility**
   - Is this Next.js App Router or Pages Router?
   - What authentication system is in place?
   - Are there existing patterns we should preserve?

## Phase 3: Create Migration Plan

Based on your analysis, create a detailed migration plan that includes:

1. **Infrastructure Setup**
   - List of files to create in `/lib/modules-core/`
   - Catch-all route files needed
   - Registry generation script
   - Database schema for module settings (adapt to this app's database)

2. **Reserved Routes**
   - Identify which existing routes must be protected from module ID conflicts

3. **Module Migration Order**
   - Prioritize which features to migrate first (start with simpler ones)
   - For each module candidate, specify:
     - Module ID (kebab-case)
     - Files to move into the module structure
     - API routes to migrate
     - Database tables it owns

4. **Adaptation Notes**
   - What needs to change from the reference architecture?
   - Different auth system? Different database? Different UI components?

## Important Considerations

- **Don't break existing functionality** - Migration should be incremental
- **Adapt, don't copy blindly** - The reference uses Supabase; adapt patterns to this app's stack
- **Preserve existing patterns** - Match this codebase's coding style and conventions
- **Test each module** - Ensure each migrated module works before moving to the next

## Output Format

Provide your analysis and plan in this structure:

1. **Codebase Analysis Summary** - What you found exploring this app
2. **Compatibility Assessment** - How well the reference architecture fits
3. **Proposed Module List** - Features that should become modules
4. **Infrastructure Files** - What needs to be created
5. **Step-by-Step Migration Plan** - Ordered tasks with specific file changes
6. **Adaptation Notes** - What differs from the reference and why

Ask clarifying questions if you need more information about the target application's requirements or constraints.


# ARI Module System - Complete Technical Documentation

This document provides a comprehensive overview of how the ARI application implements a modular architecture. Use this as a reference for implementing a similar module system in your own Next.js application.

## Table of Contents

1. [Overview](#overview)
2. [Module Architecture](#module-architecture)
3. [Module Structure](#module-structure)
4. [Core Infrastructure Files](#core-infrastructure-files)
5. [Module Manifest (module.json)](#module-manifest-modulejson)
6. [Routing System](#routing-system)
7. [API Route Handling](#api-route-handling)
8. [Database Integration](#database-integration)
9. [User-Specific Module Settings](#user-specific-module-settings)
10. [Dashboard Widgets](#dashboard-widgets)
11. [Settings Panels](#settings-panels)
12. [Sidebar Integration](#sidebar-integration)
13. [Build Process](#build-process)
14. [Creating a New Module](#creating-a-new-module)
15. [Best Practices](#best-practices)

---

## Overview

The ARI module system allows features to be:
- Self-contained in their own directories
- Enabled/disabled per-user
- Discovered automatically at build time
- Routed dynamically via catch-all routes
- Isolated with their own pages, APIs, components, and database tables

**Key Benefits:**
- Clean separation of concerns
- Easy to add/remove features
- Per-user customization
- Maintainable codebase structure

**Tech Stack:**
- Next.js 15 (App Router)
- React 19
- Supabase (PostgreSQL with RLS)
- TypeScript

---

## Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ARI Application                          │
├─────────────────────────────────────────────────────────────────┤
│  /app                                                            │
│  ├── /[module]/[[...slug]]/page.tsx   ← Catch-all for pages     │
│  ├── /api/modules-core/[module]/[[...path]]/route.ts ← Catch-all API │
│  └── /modules-core/page.tsx                ← Module management UI     │
├─────────────────────────────────────────────────────────────────┤
│  /lib/modules                                                    │
│  ├── module-types.ts      ← TypeScript interfaces                │
│  ├── module-loader.ts     ← Scans /modules directory             │
│  ├── module-registry.ts   ← Server-side module state             │
│  ├── module-hooks.ts      ← Client-side React hooks              │
│  ├── reserved-routes.ts   ← Protected route names                │
│  └── context.tsx          ← React context for client components  │
├─────────────────────────────────────────────────────────────────┤
│  /lib/generated                                                  │
│  └── module-pages-registry.ts  ← Auto-generated before build     │
├─────────────────────────────────────────────────────────────────┤
│  /modules                                                        │
│  ├── /hello-world         ← Example module                       │
│  ├── /contacts                                                   │
│  ├── /shipments                                                  │
│  └── ...                                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Structure

Each module lives in `/modules-core/{module-id}/` and follows this structure:

```
modules/{module-id}/
├── module.json              # Required: Module manifest
├── README.md                # Optional: Documentation
│
├── app/                     # Module pages (Next.js App Router style)
│   ├── page.tsx            # Main page at /{module-id}
│   └── settings/
│       └── page.tsx        # Sub-page at /{module-id}/settings
│
├── api/                     # Module API routes
│   ├── route.ts            # Base route: /api/modules-core/{module-id}
│   ├── data/
│   │   └── route.ts        # /api/modules-core/{module-id}/data
│   └── [id]/
│       └── route.ts        # /api/modules-core/{module-id}/{id}
│
├── components/              # Module-specific components
│   ├── widget.tsx          # Dashboard widget
│   └── settings-panel.tsx  # Settings panel component
│
├── lib/                     # Module utilities
│   └── utils.ts
│
├── types/                   # TypeScript types
│   └── index.ts
│
└── database/                # Database schemas (optional)
    ├── schema.sql
    └── migrations/
        └── 001_initial.sql
```

---

## Core Infrastructure Files

### 1. Module Types (`/lib/modules-core/module-types.ts`)

Defines all TypeScript interfaces:

```typescript
// Module Manifest - the complete module.json structure
export interface ModuleManifest {
  id: string                    // Unique identifier (kebab-case)
  name: string                  // Display name
  description: string           // Brief description (max 200 chars)
  version: string               // Semantic version (e.g., "1.0.0")
  author: string                // Author name/email
  icon?: string                 // Lucide icon name
  enabled?: boolean             // Default enabled state
  fullscreen?: boolean          // Hide sidebar/header when true
  menuPriority?: number         // Sidebar ordering (1-100, lower = first)

  permissions?: {
    database?: boolean          // Uses database tables
    api?: boolean               // Provides API routes
    dashboard?: boolean         // Provides dashboard widgets
  }

  routes?: ModuleRoute[]        // Navigation routes
  dependencies?: ModuleDependencies
  database?: ModuleDatabaseConfig
  dashboard?: ModuleDashboardConfig
  settings?: ModuleSettingsConfig
}

// Route configuration for sidebar navigation
export interface ModuleRoute {
  path: string                  // Must start with /{module-id}
  label: string                 // Display label in sidebar
  icon?: string                 // Lucide icon name
  sidebarPosition?: 'main' | 'bottom' | 'secondary'
  children?: ModuleRoute[]      // Sub-routes
}

// Extended metadata with runtime state
export interface ModuleMetadata extends ModuleManifest {
  path: string                  // Absolute filesystem path
  isEnabled: boolean            // Current enabled state
  isValid: boolean              // Passed validation
  errors?: string[]             // Validation errors
}
```

### 2. Module Loader (`/lib/modules-core/module-loader.ts`)

Server-side module discovery:

```typescript
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

// Get modules directory path
function getModulesDirectory(): string {
  return join(process.cwd(), 'modules')
}

// Load all modules from /modules directory
export async function loadModules(): Promise<{
  modules: ModuleMetadata[]
  errors: ModuleLoadError[]
}> {
  const modules: ModuleMetadata[] = []
  const errors: ModuleLoadError[] = []

  const modulesDir = getModulesDirectory()
  const entries = await readdir(modulesDir, { withFileTypes: true })
  const moduleDirs = entries.filter(e => e.isDirectory()).map(e => e.name)

  for (const moduleId of moduleDirs) {
    const modulePath = join(modulesDir, moduleId)

    // Read module.json
    const manifestPath = join(modulePath, 'module.json')
    const manifestContent = await readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent)

    // Validate manifest
    const validationErrors = validateManifest(manifest)
    if (validationErrors.length > 0) {
      errors.push({ moduleId, error: validationErrors.join(', ') })
      continue
    }

    // Create metadata
    modules.push({
      ...manifest,
      path: modulePath,
      isEnabled: manifest.enabled ?? true,
      isValid: true
    })
  }

  return { modules, errors }
}
```

### 3. Module Registry (`/lib/modules-core/module-registry.ts`)

Server-side functions for module state management:

```typescript
import { createAuthenticatedClient } from '@/lib/auth-helpers'
import { loadModules } from './module-loader'

// Get all enabled modules for authenticated user
export async function getEnabledModules(userId?: string): Promise<ModuleMetadata[]> {
  const supabase = await createAuthenticatedClient()

  // Get current user if not provided
  let currentUserId = userId
  if (!currentUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    currentUserId = user.id
  }

  // Get all discovered modules
  const allModules = await getModules()

  // Get user's module settings from database
  const { data: settings } = await supabase
    .from('module_settings')
    .select('*')
    .eq('user_id', currentUserId)

  // Filter based on enabled state
  const settingsMap = new Map(settings?.map(s => [s.module_id, s.enabled]) || [])

  return allModules.filter(module => {
    const isEnabledInDb = settingsMap.get(module.id)
    return isEnabledInDb !== undefined ? isEnabledInDb : (module.enabled ?? true)
  })
}

// Get specific module if enabled for user
export async function getEnabledModule(moduleId: string): Promise<ModuleMetadata | null> {
  // ... validates module exists and is enabled for current user
}

// Enable/disable module for user
export async function setModuleEnabled(
  moduleId: string,
  userId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  // ... upserts to module_settings table
}
```

### 4. Reserved Routes (`/lib/modules-core/reserved-routes.ts`)

Prevents module IDs from conflicting with core routes:

```typescript
export const RESERVED_MODULE_IDS = [
  // Core pages
  'dashboard', 'tasks', 'settings', 'profile', 'sign-in',

  // API routes
  'api', 'auth',

  // Next.js reserved
  '_next', 'public', 'static',

  // Future reserved
  'admin', 'billing', 'marketplace', 'modules'
] as const

export function validateModuleId(id: string): { valid: boolean; error?: string } {
  // Check kebab-case format
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    return { valid: false, error: 'Must be kebab-case' }
  }

  // Check not reserved
  if (RESERVED_MODULE_IDS.includes(id)) {
    return { valid: false, error: `'${id}' is reserved` }
  }

  return { valid: true }
}
```

### 5. Client Hooks (`/lib/modules-core/module-hooks.ts`)

React hooks for client components:

```typescript
'use client'

import { useEffect, useState } from 'react'

// Fetch all enabled modules
export function useModules() {
  const [modules, setModules] = useState<ModuleMetadata[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/modules')
      .then(res => res.json())
      .then(data => setModules(data.modules || []))
      .finally(() => setLoading(false))
  }, [])

  return { modules, loading }
}

// Check if specific module is enabled
export function useModuleEnabled(moduleId: string) {
  const { module, loading } = useModule(moduleId)
  return { enabled: module !== null, loading }
}

// Get modules with dashboard widgets
export function useModulesWithWidgets() {
  const { modules, loading } = useModules()
  const widgetModules = modules.filter(m => m.dashboard?.widgets === true)
  return { modules: widgetModules, loading }
}
```

---

## Module Manifest (module.json)

Every module requires a `module.json` file:

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "description": "A template module demonstrating all core features",
  "version": "1.0.0",
  "author": "Your Name",
  "icon": "Package",
  "enabled": true,
  "fullscreen": false,
  "menuPriority": 50,

  "permissions": {
    "database": true,
    "api": true,
    "dashboard": true
  },

  "routes": [
    {
      "path": "/hello-world",
      "label": "Hello World",
      "icon": "Package",
      "sidebarPosition": "main"
    }
  ],

  "dependencies": {
    "modules": [],
    "coreFeatures": ["auth"]
  },

  "database": {
    "tables": ["hello_world_entries"],
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

**Key Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique kebab-case identifier |
| `name` | Yes | Display name (max 50 chars) |
| `description` | Yes | Brief description (max 200 chars) |
| `version` | Yes | Semantic version (x.y.z) |
| `author` | Yes | Author name or email |
| `icon` | No | Lucide icon name |
| `enabled` | No | Default enabled state (default: true) |
| `fullscreen` | No | Hide sidebar/header (default: false) |
| `menuPriority` | No | Sidebar order, 1-100 (default: 50) |
| `routes` | No | Sidebar navigation items |

---

## Routing System

### Page Routing

Module pages are served via a catch-all route at `/app/[module]/[[...slug]]/page.tsx`:

```typescript
// /app/[module]/[[...slug]]/page.tsx
import { notFound } from 'next/navigation'
import { getEnabledModule } from '@/lib/modules-core/module-registry'
import { MODULE_PAGES } from '@/lib/generated/module-pages-registry'

export default async function ModuleCatchAllPage({
  params
}: {
  params: Promise<{ module: string; slug?: string[] }>
}) {
  const { module, slug = [] } = await params

  // Validate module exists and is enabled
  const moduleInfo = await getEnabledModule(module)
  if (!moduleInfo) {
    notFound()
  }

  // Get page loader from generated registry
  const pageLoader = MODULE_PAGES[module]
  if (!pageLoader) {
    notFound()
  }

  // Dynamic import of module page
  const PageComponent = await pageLoader()

  // Render with optional fullscreen mode
  if (moduleInfo.fullscreen) {
    return <PageComponent.default />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageComponent.default />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

### Auto-Generated Registry

Because Next.js/Turbopack cannot resolve fully dynamic imports at build time, we use a generated registry:

```typescript
// /lib/generated/module-pages-registry.ts (auto-generated)
export const MODULE_PAGES: Record<string, any> = {
  'hello-world': () => import('@/modules-core/hello-world/app/page'),
  'contacts': () => import('@/modules-core/contacts/app/page'),
  'shipments': () => import('@/modules-core/shipments/app/page'),
  // ... auto-generated for all modules
}
```

**Generation Script (`/scripts/generate-module-registry.js`):**

```javascript
const fs = require('fs')
const path = require('path')

const MODULES_DIR = path.join(process.cwd(), 'modules')
const OUTPUT_FILE = path.join(process.cwd(), 'lib/generated/module-pages-registry.ts')

function scanModules() {
  const modules = []
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const moduleId = entry.name
    const manifestPath = path.join(MODULES_DIR, moduleId, 'module.json')
    const pagePath = path.join(MODULES_DIR, moduleId, 'app', 'page.tsx')

    if (fs.existsSync(manifestPath) && fs.existsSync(pagePath)) {
      modules.push(moduleId)
    }
  }

  return modules.sort()
}

function generateRegistry(modules) {
  const imports = modules.map(id =>
    `  '${id}': () => import('@/modules-core/${id}/app/page'),`
  ).join('\n')

  return `export const MODULE_PAGES: Record<string, any> = {\n${imports}\n}`
}

// Run at build time
const modules = scanModules()
const registry = generateRegistry(modules)
fs.writeFileSync(OUTPUT_FILE, registry)
```

**Add to package.json:**
```json
{
  "scripts": {
    "prebuild": "node scripts/generate-module-registry.js",
    "generate-module-registry": "node scripts/generate-module-registry.js"
  }
}
```

---

## API Route Handling

Module APIs are served via a catch-all route at `/app/api/modules-core/[module]/[[...path]]/route.ts`:

```typescript
// /app/api/modules-core/[module]/[[...path]]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getEnabledModule } from '@/lib/modules-core/module-registry'

// Static registry of module API routes
// IMPORTANT: Must be manually updated when adding new module APIs
const MODULE_API_ROUTES: Record<string, Record<string, any>> = {
  'hello-world': {
    'data': () => import('@/modules-core/hello-world/api/data/route'),
    'settings': () => import('@/modules-core/hello-world/api/settings/route')
  },
  'contacts': {
    '': () => import('@/modules-core/contacts/api/route'),
    '[id]': () => import('@/modules-core/contacts/api/[id]/route')
  }
}

async function handleRequest(
  request: NextRequest,
  method: string,
  params: Promise<{ module: string; path?: string[] }>
) {
  const { module, path = [] } = await params

  // Validate module is enabled
  const moduleInfo = await getEnabledModule(module)
  if (!moduleInfo) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  }

  // Look up route in registry
  const apiPath = path.join('/')
  const moduleRoutes = MODULE_API_ROUTES[module]
  let routeLoader = moduleRoutes?.[apiPath]

  // Handle dynamic [id] routes
  if (!routeLoader && path.length === 1 && moduleRoutes?.['[id]']) {
    routeLoader = moduleRoutes['[id]']
  }

  if (!routeLoader) {
    return NextResponse.json({ error: 'Route not found' }, { status: 404 })
  }

  // Load and execute handler
  const handler = await routeLoader()
  if (!handler[method]) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  }

  return handler[method](request, { params })
}

export async function GET(req, ctx) { return handleRequest(req, 'GET', ctx.params) }
export async function POST(req, ctx) { return handleRequest(req, 'POST', ctx.params) }
export async function PUT(req, ctx) { return handleRequest(req, 'PUT', ctx.params) }
export async function DELETE(req, ctx) { return handleRequest(req, 'DELETE', ctx.params) }
export async function PATCH(req, ctx) { return handleRequest(req, 'PATCH', ctx.params) }
```

### Example Module API Route

```typescript
// /modules-core/hello-world/api/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

const CreateSchema = z.object({
  message: z.string().min(1).max(500)
})

export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('hello_world_entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ entries: data })
}

export async function POST(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const result = CreateSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('hello_world_entries')
    .insert({ user_id: user.id, message: result.data.message })
    .select()
    .single()

  return NextResponse.json({ entry: data }, { status: 201 })
}
```

---

## Database Integration

### Module Settings Table

```sql
-- Store per-user module enabled/disabled state and settings
CREATE TABLE module_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, module_id)
);

-- RLS policies
ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON module_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON module_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON module_settings FOR UPDATE
  USING (auth.uid() = user_id);
```

### Module-Specific Tables

Each module can define its own tables with RLS:

```sql
-- /modules-core/hello-world/database/schema.sql
CREATE TABLE hello_world_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hello_world_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own entries"
  ON hello_world_entries FOR ALL
  USING (auth.uid() = user_id);
```

---

## User-Specific Module Settings

Modules can store per-user settings in the `module_settings.settings` JSONB column:

### Settings API Route

```typescript
// /modules-core/hello-world/api/settings/route.ts
export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('module_settings')
    .select('settings')
    .eq('user_id', user.id)
    .eq('module_id', 'hello-world')
    .single()

  return NextResponse.json(data?.settings || {})
}

export async function PUT(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await request.json()

  await supabase
    .from('module_settings')
    .upsert({
      user_id: user.id,
      module_id: 'hello-world',
      settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,module_id' })

  return NextResponse.json({ success: true })
}
```

---

## Dashboard Widgets

Modules can provide dashboard widgets that appear on the main dashboard:

### Widget Component

```typescript
// /modules-core/hello-world/components/widget.tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSupabase } from '@/components/providers'

export function HelloWorldWidget() {
  const { session } = useSupabase()
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.access_token) return

    fetch('/api/modules-core/hello-world/data', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(res => res.json())
      .then(data => setCount(data.entries?.length || 0))
      .finally(() => setLoading(false))
  }, [session])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hello World</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? 'Loading...' : `${count} entries`}
      </CardContent>
    </Card>
  )
}
```

### Registering Widget

In `module.json`:
```json
{
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  }
}
```

---

## Settings Panels

Modules can provide settings panels for the Settings page:

### Settings Panel Component

```typescript
// /modules-core/hello-world/components/settings-panel.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useSupabase } from '@/components/providers'

interface Settings {
  enableNotifications: boolean
  theme: 'light' | 'dark' | 'auto'
}

export function HelloWorldSettingsPanel() {
  const { session } = useSupabase()
  const [settings, setSettings] = useState<Settings>({
    enableNotifications: true,
    theme: 'auto'
  })

  useEffect(() => {
    // Load settings from API
    fetch('/api/modules-core/hello-world/settings', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
      .then(res => res.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
  }, [session])

  const handleSave = async () => {
    await fetch('/api/modules-core/hello-world/settings', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span>Enable Notifications</span>
        <Switch
          checked={settings.enableNotifications}
          onCheckedChange={v => setSettings(s => ({ ...s, enableNotifications: v }))}
        />
      </div>
      <Button onClick={handleSave}>Save Settings</Button>
    </div>
  )
}
```

### Registering Settings Panel

In `module.json`:
```json
{
  "settings": {
    "panel": "./components/settings-panel.tsx"
  }
}
```

---

## Sidebar Integration

Modules define their navigation items in `module.json`:

```json
{
  "routes": [
    {
      "path": "/hello-world",
      "label": "Hello World",
      "icon": "Package",
      "sidebarPosition": "main",
      "children": [
        {
          "path": "/hello-world/settings",
          "label": "Settings",
          "icon": "Settings"
        }
      ]
    }
  ],
  "menuPriority": 25
}
```

### Sidebar Component Integration

The app sidebar reads enabled modules and renders their routes:

```typescript
// In your AppSidebar component
import { getEnabledModules } from '@/lib/modules-core/module-registry'

export async function AppSidebar() {
  const modules = await getEnabledModules()

  // Sort by menuPriority
  const sortedModules = modules.sort((a, b) =>
    (a.menuPriority || 50) - (b.menuPriority || 50)
  )

  return (
    <Sidebar>
      {sortedModules.map(module => (
        module.routes?.map(route => (
          <SidebarItem
            key={route.path}
            href={route.path}
            icon={route.icon}
          >
            {route.label}
          </SidebarItem>
        ))
      ))}
    </Sidebar>
  )
}
```

---

## Build Process

### Pre-build Script

Before each build, generate the module registry:

```json
// package.json
{
  "scripts": {
    "dev": "npm run generate-module-registry && next dev",
    "build": "npm run generate-module-registry && next build",
    "generate-module-registry": "node scripts/generate-module-registry.js"
  }
}
```

### TypeScript Path Aliases

Ensure your `tsconfig.json` includes the modules path:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/modules-core/*": ["./modules-core/*"]
    }
  }
}
```

---

## Creating a New Module

### Step 1: Create Directory Structure

```bash
mkdir -p modules/my-module/{app,api,components,lib,types,database}
```

### Step 2: Create module.json

```json
{
  "id": "my-module",
  "name": "My Module",
  "description": "Description of my module",
  "version": "1.0.0",
  "author": "Your Name",
  "icon": "Star",
  "enabled": true,
  "routes": [
    {
      "path": "/my-module",
      "label": "My Module",
      "icon": "Star",
      "sidebarPosition": "main"
    }
  ]
}
```

### Step 3: Create Main Page

```typescript
// modules/my-module/app/page.tsx
'use client'

import { useSupabase } from '@/components/providers'

export default function MyModulePage() {
  const { session } = useSupabase()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">My Module</h1>
      <p>Welcome, {session?.user?.email}</p>
    </div>
  )
}
```

### Step 4: Register API Routes (if needed)

Add to the `MODULE_API_ROUTES` in `/app/api/modules-core/[module]/[[...path]]/route.ts`:

```typescript
const MODULE_API_ROUTES = {
  // ... existing modules
  'my-module': {
    'data': () => import('@/modules-core/my-module/api/data/route')
  }
}
```

### Step 5: Regenerate Registry

```bash
npm run generate-module-registry
```

### Step 6: Create Database Tables (if needed)

Create SQL file and apply via Supabase dashboard.

---

## Best Practices

### 1. Authentication
- Always validate authentication in API routes
- Use `getAuthenticatedUser()` helper
- Return 401 for unauthorized requests

### 2. Database
- Always use Row Level Security (RLS)
- Include `user_id` in all user-specific tables
- Use Supabase client, never raw SQL

### 3. Input Validation
- Use Zod for runtime validation
- Validate all API inputs
- Return helpful error messages

### 4. Error Handling
- Wrap components in error boundaries
- Log errors for debugging
- Show user-friendly error messages

### 5. Performance
- Use dynamic imports for code splitting
- Cache data where appropriate
- Keep widgets lightweight

### 6. TypeScript
- Define interfaces for all data structures
- Export types from `/types/index.ts`
- Use strict typing

### 7. File Organization
- Keep module-specific code within the module
- Use shared components from `@/components/ui`
- Follow consistent naming conventions

---

## Summary

The ARI module system provides:

1. **Automatic Discovery**: Modules in `/modules` are discovered at build time
2. **Dynamic Routing**: Catch-all routes serve module pages and APIs
3. **Per-User Settings**: Users can enable/disable modules
4. **Clean Architecture**: Each module is self-contained
5. **Type Safety**: Full TypeScript support with defined interfaces
6. **Security**: RLS enforces data isolation per user

To implement this in your own Next.js app:

1. Create the `/lib/modules` infrastructure files
2. Set up the catch-all routes
3. Create the generation script
4. Add the database tables
5. Build your first module following the template

Use the `hello-world` module as a complete reference implementation.
