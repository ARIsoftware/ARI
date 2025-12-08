# HD Dashboard Hook System Proposal

**Version:** 1.0
**Date:** November 2025
**Status:** Proposal

---

## Executive Summary

### Problem Statement

The HD Dashboard (`/app/hd-dashboard/page.tsx`) is currently **hardcoded and inflexible**:

- All sections are manually coded in a single 455-line file
- Module-specific code is directly embedded (Winter Arc goals, etc.)
- Adding new cards requires editing core dashboard code
- No way for modules to contribute their own dashboard sections
- Tight coupling between modules and HD Dashboard

### Proposed Solution

Implement a **WordPress-style hook system** where modules can register custom cards that appear on the HD Dashboard, similar to how WordPress plugins use `add_action()` to inject content.

**Key Concept:**
```typescript
// Module registers card in module.json
{
  "dashboard": {
    "hdCards": {
      "enabled": true,
      "cards": [{
        "id": "stats",
        "component": "./components/hd-card.tsx",
        "position": "top-stats",
        "color": "blue",
        "order": 10
      }]
    }
  }
}

// HD Dashboard automatically renders registered cards
<HDDashboard>
  {/* Dynamically loads and renders cards from enabled modules */}
</HDDashboard>
```

### Expected Benefits

- ✅ **Modularity** - Modules become truly self-contained
- ✅ **Extensibility** - Easy to add new dashboard sections
- ✅ **Maintainability** - Less coupling, easier to debug
- ✅ **Developer Experience** - Clear API for module developers
- ✅ **Consistency** - Enforced styling patterns via wrapper components

---

## Current State Analysis

### HD Dashboard Architecture

**Location:** `/app/hd-dashboard/page.tsx` (455 lines)

**Current Sections:**

1. **Winter Arc Goals** (lines 224-258)
   - Conditionally shown: `enabledModules.has('winter-arc')`
   - 5-column grid of toggleable goal cards
   - Hardcoded directly in HD Dashboard

2. **Contribution Graphs** (lines 260-265)
   - Also checks for winter-arc module
   - Uses `<HDContributionGraph>` component

3. **Top Stats Row** (lines 267-323)
   - 6 ultra-compact stat cards
   - Hardcoded: tasks, overdue, today, fitness, avg/day, active

4. **Main Content Grid** (lines 326-430)
   - 3-column layout
   - Left: Active tasks list
   - Middle: Overdue + priority tasks
   - Right: Notepad

5. **Bottom Section** (lines 432-448)
   - Recently completed tasks grid

**Key Characteristics:**

- **Ultra-compact design** - Text sizes: `text-[10px]`, `text-[11px]`
- **Dense information** - Maximum data in minimum space
- **Pastel color scheme** - Visual differentiation between sections
- **Theme support** - Dark mode, blue theme, clean theme
- **Grid-based layouts** - Precise positioning

### Existing Widget System

The module system **already has infrastructure** for widgets, but HD Dashboard doesn't use it!

**Widget System (for Regular Dashboard):**

```json
// module.json
{
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"]
  }
}
```

**Existing Functions:**
- `getModulesWithWidgets()` - Filters modules with widgets
- `useModulesWithWidgets()` - React hook for widget modules

**Existing Widget Examples:**
- `/modules-core/hello-world/components/widget.tsx`
- `/modules-core/major-projects/components/widget.tsx`
- `/modules-core/quotes/components/widget.tsx`

**Why HD Dashboard Doesn't Use Widgets:**

1. Widgets are **too large** - Designed for regular dashboard cards
2. Different **styling requirements** - HD Dashboard is ultra-compact
3. Different **layout needs** - Precise grid positioning vs flexible grid
4. **Component pattern mismatch** - Widgets use full Card components; HD uses minimal borders

### Gap Analysis

| Feature | Regular Dashboard | HD Dashboard |
|---------|-------------------|--------------|
| Dynamic widgets | ✅ Yes | ❌ No |
| Module registration | ✅ module.json | ❌ Hardcoded |
| Position control | ✅ Auto-grid | ❌ Manual layout |
| Theme support | ✅ Yes | ✅ Yes |
| Compact design | ❌ No | ✅ Yes |
| Module decoupling | ✅ High | ❌ Low (tight coupling) |

**Conclusion:** Need HD-specific card system that leverages existing module infrastructure but with HD-appropriate styling.

---

## Proposed Architecture

### Overview Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Module: winter-arc                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ module.json                                             │ │
│ │ {                                                       │ │
│ │   "dashboard": {                                        │ │
│ │     "hdCards": {                                        │ │
│ │       "enabled": true,                                  │ │
│ │       "cards": [{ /* config */ }]                       │ │
│ │     }                                                   │ │
│ │   }                                                     │ │
│ │ }                                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ components/hd-goals-card.tsx                            │ │
│ │ - Ultra-compact component                               │ │
│ │ - Follows HD Dashboard styling                          │ │
│ │ - Receives config props                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ HD Card Registry (Build Time)                               │
│ /app/hd-dashboard/hd-card-registry.ts                       │
│                                                              │
│ const HD_DASHBOARD_CARDS = {                                │
│   'winter-arc': {                                           │
│     'goals': () => import('@/modules-core/winter-arc/...')       │
│   },                                                         │
│   'major-projects': { /* ... */ }                           │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ HD Dashboard (Runtime)                                       │
│ /app/hd-dashboard/page.tsx                                   │
│                                                              │
│ 1. useModulesWithHDCards() → Get enabled modules            │
│ 2. Group cards by position                                  │
│ 3. Dynamically load from registry                           │
│ 4. Render in appropriate positions                          │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. HD Card Registry (Build Time)

**File:** `/app/hd-dashboard/hd-card-registry.ts`

**Purpose:** Static registry of module cards (required for Next.js/Turbopack)

**Why Registry?** Next.js cannot resolve dynamic imports with runtime-constructed paths. Must use static import paths for build-time optimization.

```typescript
/**
 * HD Dashboard Card Registry
 *
 * IMPORTANT: This registry must be manually updated when adding new HD cards.
 * Next.js/Turbopack requires static import paths for code splitting.
 *
 * Pattern: { 'module-id': { 'card-id': () => import('static-path') } }
 */
export const HD_DASHBOARD_CARDS: Record<string, Record<string, any>> = {
  'winter-arc': {
    'goals': () => import('@/modules-core/winter-arc/components/hd-goals-card'),
    'stats': () => import('@/modules-core/winter-arc/components/hd-stats-card')
  },
  'major-projects': {
    'summary': () => import('@/modules-core/major-projects/components/hd-card')
  },
  'fitness': {
    'stats': () => import('@/modules-core/daily-fitness/components/hd-stats-card')
  }
}

/**
 * Load a specific HD card component
 */
export async function loadHDCard(moduleId: string, cardId: string) {
  const loader = HD_DASHBOARD_CARDS[moduleId]?.[cardId]
  if (!loader) {
    throw new Error(`HD Card not found: ${moduleId}/${cardId}`)
  }
  return await loader()
}
```

#### 2. Module Type Extensions

**File:** `/lib/modules-core/module-types.ts`

```typescript
/**
 * HD Dashboard Card Configuration
 */
export interface HDCardConfig {
  // Required
  id: string                    // Unique within module (e.g., "goals", "stats")
  component: string             // Path relative to module root
  position: HDCardPosition      // Where to render on dashboard

  // Optional styling
  size?: 'small' | 'medium' | 'large' | 'full-width'
  color?: HDCardColor           // Pastel background color
  order?: number                // Sort order within position (default: 50)

  // Optional sizing overrides (use sparingly)
  gridSpan?: number             // How many grid columns to span
  minWidth?: string             // CSS min-width (e.g., "500px")
  height?: string               // CSS height (e.g., "200px")
}

/**
 * Available positions on HD Dashboard
 */
export type HDCardPosition =
  | 'above-stats'     // Before stats row (like Winter Arc goals)
  | 'top-stats'       // 6-column stat row at top
  | 'left-column'     // Main content left side (tasks area)
  | 'middle-column'   // Main content middle (priority area)
  | 'right-column'    // Main content right (notepad area)
  | 'bottom'          // Full-width bottom section

/**
 * Pastel color themes for cards
 */
export type HDCardColor =
  | 'blue' | 'red' | 'green' | 'yellow'
  | 'purple' | 'orange' | 'pink' | 'gray'

/**
 * HD Dashboard configuration in module.json
 */
export interface ModuleDashboardConfig {
  // Existing widget system (for regular dashboard)
  widgets?: boolean
  widgetComponents?: string[]

  // NEW: HD Dashboard cards
  hdCards?: {
    enabled: boolean
    cards: HDCardConfig[]
  }
}
```

#### 3. Module Registry Functions

**File:** `/lib/modules-core/module-registry.ts`

```typescript
/**
 * Get all enabled modules that have HD Dashboard cards
 */
export async function getModulesWithHDCards(userId?: string): Promise<ModuleMetadata[]> {
  const enabledModules = await getEnabledModules(userId)
  return enabledModules.filter(module =>
    module.dashboard?.hdCards?.enabled === true
  )
}

/**
 * Get all HD cards from enabled modules, sorted by position and order
 */
export async function getHDDashboardCards(userId?: string): Promise<HDCardInstance[]> {
  const modules = await getModulesWithHDCards(userId)

  const cards: HDCardInstance[] = []

  for (const module of modules) {
    const hdCards = module.dashboard?.hdCards?.cards || []
    for (const card of hdCards) {
      cards.push({
        moduleId: module.id,
        cardId: card.id,
        config: card,
        order: card.order ?? 50
      })
    }
  }

  // Sort by position, then order
  return cards.sort((a, b) => {
    if (a.config.position !== b.config.position) {
      return POSITION_ORDER[a.config.position] - POSITION_ORDER[b.config.position]
    }
    return a.order - b.order
  })
}

interface HDCardInstance {
  moduleId: string
  cardId: string
  config: HDCardConfig
  order: number
}

const POSITION_ORDER: Record<HDCardPosition, number> = {
  'above-stats': 0,
  'top-stats': 1,
  'left-column': 2,
  'middle-column': 3,
  'right-column': 4,
  'bottom': 5
}
```

#### 4. React Hooks

**File:** `/lib/modules-core/module-hooks.ts`

```typescript
/**
 * Hook to get modules with HD Dashboard cards
 */
export function useModulesWithHDCards() {
  const { modules, loading, error } = useModules()

  const hdCardModules = modules.filter(module =>
    module.dashboard?.hdCards?.enabled === true
  )

  return { modules: hdCardModules, loading, error }
}

/**
 * Hook to get all HD cards grouped by position
 */
export function useHDDashboardCards() {
  const { modules, loading, error } = useModulesWithHDCards()
  const [cardsByPosition, setCardsByPosition] = useState<Record<HDCardPosition, HDCardInstance[]>>({})

  useEffect(() => {
    const cards: HDCardInstance[] = []

    for (const module of modules) {
      const hdCards = module.dashboard?.hdCards?.cards || []
      for (const card of hdCards) {
        cards.push({
          moduleId: module.id,
          cardId: card.id,
          config: card,
          order: card.order ?? 50
        })
      }
    }

    // Group by position
    const grouped = groupBy(cards, card => card.config.position)

    // Sort within each position by order
    for (const position in grouped) {
      grouped[position].sort((a, b) => a.order - b.order)
    }

    setCardsByPosition(grouped)
  }, [modules])

  return { cardsByPosition, loading, error }
}
```

#### 5. Dynamic Card Loader

**File:** `/app/hd-dashboard/components/dynamic-hd-card.tsx`

```typescript
'use client'

import { lazy, Suspense } from 'react'
import { HDCardSkeleton } from './hd-card-skeleton'
import { HDCardWrapper } from './hd-card-wrapper'
import type { HDCardConfig } from '@/lib/modules-core/module-types'
import { HD_DASHBOARD_CARDS } from '../hd-card-registry'

interface DynamicHDCardProps {
  moduleId: string
  cardId: string
  config: HDCardConfig
}

export function DynamicHDCard({ moduleId, cardId, config }: DynamicHDCardProps) {
  // Dynamically load component from registry
  const CardComponent = lazy(async () => {
    const loader = HD_DASHBOARD_CARDS[moduleId]?.[cardId]
    if (!loader) {
      throw new Error(`HD Card not found: ${moduleId}/${cardId}`)
    }
    return await loader()
  })

  return (
    <HDCardWrapper config={config}>
      <Suspense fallback={<HDCardSkeleton config={config} />}>
        <CardComponent config={config} />
      </Suspense>
    </HDCardWrapper>
  )
}
```

#### 6. Card Wrapper (Consistent Styling)

**File:** `/app/hd-dashboard/components/hd-card-wrapper.tsx`

```typescript
'use client'

import { cn } from '@/lib/utils'
import type { HDCardConfig } from '@/lib/modules-core/module-types'

interface HDCardWrapperProps {
  config: HDCardConfig
  children: React.ReactNode
}

/**
 * Wrapper component that applies consistent HD Dashboard styling
 * Ensures all cards follow the ultra-compact design system
 */
export function HDCardWrapper({ config, children }: HDCardWrapperProps) {
  const colorClasses = getColorClasses(config.color)
  const sizeClasses = getSizeClasses(config.size)

  return (
    <div
      className={cn(
        // Base HD Dashboard card styling
        'border rounded p-1.5',
        'dark:border-gray-700 blue:border-white clean:border-gray-200',

        // Color theme
        colorClasses,

        // Size/position specific
        sizeClasses,

        // Custom overrides
        config.minWidth && `min-w-[${config.minWidth}]`,
        config.height && `h-[${config.height}]`,
        config.gridSpan && `col-span-${config.gridSpan}`
      )}
      style={{
        minWidth: config.minWidth,
        height: config.height,
        gridColumn: config.gridSpan ? `span ${config.gridSpan}` : undefined
      }}
    >
      {children}
    </div>
  )
}

function getColorClasses(color?: string): string {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 blue:bg-transparent clean:bg-transparent',
    red: 'bg-red-50 dark:bg-red-900/20 blue:bg-transparent clean:bg-transparent',
    green: 'bg-green-50 dark:bg-green-900/20 blue:bg-transparent clean:bg-transparent',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 blue:bg-transparent clean:bg-transparent',
    purple: 'bg-purple-50 dark:bg-purple-900/20 blue:bg-transparent clean:bg-transparent',
    orange: 'bg-orange-50 dark:bg-orange-900/20 blue:bg-transparent clean:bg-transparent',
    pink: 'bg-pink-50 dark:bg-pink-900/20 blue:bg-transparent clean:bg-transparent',
    gray: 'bg-gray-50 dark:bg-gray-900/20 blue:bg-transparent clean:bg-transparent'
  }
  return colors[color as keyof typeof colors] || colors.gray
}

function getSizeClasses(size?: string): string {
  // Size classes can add responsive behavior
  const sizes = {
    small: '',
    medium: 'p-2',
    large: 'p-3',
    'full-width': 'col-span-full'
  }
  return sizes[size as keyof typeof sizes] || ''
}
```

---

## Developer Experience

### How to Add an HD Dashboard Card

#### Step 1: Create HD Card Component

**File:** `/modules-core/my-module/components/hd-card.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/components/providers'
import type { HDCardConfig } from '@/lib/modules-core/module-types'

interface MyModuleHDCardProps {
  config: HDCardConfig
}

/**
 * HD Dashboard card for My Module
 *
 * IMPORTANT: Follow HD Dashboard styling conventions:
 * - Ultra-compact text (text-[10px], text-[11px])
 * - Small icons (w-3 h-3, w-3.5 h-3.5)
 * - Minimal padding
 * - Use muted colors
 */
export function MyModuleHDCard({ config }: MyModuleHDCardProps) {
  const { session } = useSupabase()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      // Fetch data from your module's API
      const response = await fetch('/api/modules-core/my-module/stats')
      const result = await response.json()
      setData(result)
      setLoading(false)
    }

    if (session) {
      loadData()
    }
  }, [session])

  if (loading) {
    return <div className="text-[10px] text-gray-400">Loading...</div>
  }

  return (
    <div className="space-y-1">
      {/* Header with icon */}
      <div className="flex items-center gap-1">
        <MyIcon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
          My Stat
        </span>
      </div>

      {/* Main content - ultra compact */}
      <div className="text-lg font-bold text-blue-900 dark:text-blue-300">
        {data?.value}
      </div>

      {/* Subtitle - tiny text */}
      <div className="text-[9px] text-gray-500 dark:text-gray-400">
        {data?.subtitle}
      </div>
    </div>
  )
}

// Must export default for dynamic import
export default MyModuleHDCard
```

#### Step 2: Update module.json

**File:** `/modules-core/my-module/module.json`

```json
{
  "id": "my-module",
  "name": "My Module",
  "version": "1.0.0",
  "dashboard": {
    "widgets": true,
    "widgetComponents": ["./components/widget.tsx"],

    "hdCards": {
      "enabled": true,
      "cards": [
        {
          "id": "stats",
          "component": "./components/hd-card.tsx",
          "position": "top-stats",
          "size": "small",
          "color": "blue",
          "order": 10
        }
      ]
    }
  }
}
```

#### Step 3: Register in HD Card Registry

**File:** `/app/hd-dashboard/hd-card-registry.ts`

```typescript
export const HD_DASHBOARD_CARDS: Record<string, Record<string, any>> = {
  // ... existing registrations

  'my-module': {
    'stats': () => import('@/modules-core/my-module/components/hd-card')
  }
}
```

#### Step 4: Done!

The card will automatically appear on HD Dashboard when:
- Module is enabled for the user
- User visits `/hd-dashboard`

---

## Card Configuration API

### Required Properties

```typescript
{
  id: string              // Unique within module, e.g., "stats", "goals"
  component: string       // Relative path from module root
  position: HDCardPosition // Where to render
}
```

### Position Options

| Position | Description | Grid | Typical Use |
|----------|-------------|------|-------------|
| `above-stats` | Before stats row | Full-width | Large features like Winter Arc goals |
| `top-stats` | Stats row | 6 columns | Single metrics, KPIs |
| `left-column` | Left main content | Variable | Lists, tables |
| `middle-column` | Middle main content | Variable | Priority items, alerts |
| `right-column` | Right main content | Variable | Notes, quick actions |
| `bottom` | Bottom section | Full-width | Completion lists, archives |

### Optional Styling Properties

```typescript
{
  size?: 'small' | 'medium' | 'large' | 'full-width'
  // Affects padding and potentially grid behavior
  // Default: 'small'

  color?: 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'gray'
  // Pastel background color for visual differentiation
  // Default: 'gray'

  order?: number
  // Sort order within position (0-100)
  // Lower numbers render first
  // Default: 50

  gridSpan?: number
  // How many grid columns to span (1-6 for top-stats, 1-3 for main grid)
  // Use carefully - can break layout if too large
  // Default: 1

  minWidth?: string
  // CSS min-width value (e.g., "500px")
  // Use only when necessary
  // Default: undefined

  height?: string
  // CSS height value (e.g., "200px")
  // Use only when necessary
  // Default: auto
}
```

### Styling Guidelines

**Typography:**
- Headers: `text-[10px] font-medium`
- Main values: `text-lg font-bold`
- Subtitles: `text-[9px]`

**Icons:**
- Small: `w-3 h-3`
- Medium: `w-3.5 h-3.5`

**Spacing:**
- Between items: `gap-1` or `space-y-1`
- Padding is handled by wrapper

**Colors:**
- Use semantic colors: `text-blue-600 dark:text-blue-400`
- Muted text: `text-gray-500 dark:text-gray-400`
- Always provide dark mode variants

**Hover States:**
- Interactive elements: `hover:bg-gray-50 dark:hover:bg-gray-700`

---

## Implementation Phases

### Phase 1: Core Infrastructure (3-4 days)

**Goal:** Build foundational systems

**Tasks:**
1. Create HD card registry file (`/app/hd-dashboard/hd-card-registry.ts`)
2. Extend module type definitions (`/lib/modules-core/module-types.ts`)
   - Add `HDCardConfig` interface
   - Add `HDCardPosition` type
   - Add `HDCardColor` type
   - Extend `ModuleDashboardConfig`
3. Add registry functions (`/lib/modules-core/module-registry.ts`)
   - `getModulesWithHDCards()`
   - `getHDDashboardCards()`
4. Create React hooks (`/lib/modules-core/module-hooks.ts`)
   - `useModulesWithHDCards()`
   - `useHDDashboardCards()`
5. Create card wrapper component (`/app/hd-dashboard/components/hd-card-wrapper.tsx`)
6. Create card skeleton (`/app/hd-dashboard/components/hd-card-skeleton.tsx`)
7. Create dynamic card loader (`/app/hd-dashboard/components/dynamic-hd-card.tsx`)

**Acceptance Criteria:**
- All types compile without errors
- Registry pattern works with test imports
- Hooks return expected data structure

### Phase 2: HD Dashboard Integration (3-4 days)

**Goal:** Refactor HD Dashboard to use new system

**Tasks:**
1. Update HD Dashboard page to use `useHDDashboardCards()`
2. Create position-based rendering sections
3. Add error boundaries for card failures
4. Extract Winter Arc section to separate HD card component
5. Register Winter Arc card in registry
6. Test with Winter Arc card (proof of concept)
7. Ensure existing hardcoded sections still work
8. Add loading states and error handling

**Acceptance Criteria:**
- Winter Arc section works as HD card
- No regressions in existing functionality
- Dynamic cards render correctly
- Loading states work properly
- Errors don't crash entire dashboard

### Phase 3: Documentation & Templates (2-3 days)

**Goal:** Make it easy for developers to create HD cards

**Tasks:**
1. Create HD card component template (`/templates/hd-card-template.tsx`)
2. Write developer guide section in this document
3. Update `/docs/MODULE-MIGRATION-CHECKLIST.md` with HD card steps
4. Add to `CLAUDE.md` as a system pattern
5. Create validation script for registry consistency
6. Add code snippets to documentation
7. Create troubleshooting guide

**Deliverables:**
- Template file developers can copy
- Step-by-step guide with examples
- Validation tooling
- Updated project documentation

### Phase 4: Module Migration (Ongoing, 1-2 days per module)

**Goal:** Migrate existing sections to use hook system

**Priority Order:**
1. **Winter Arc** (already started in Phase 2)
2. **Major Projects** - Create summary stat card
3. **Tasks** - Extract priority tasks section
4. **Fitness** - Extract fitness stats section
5. **Notepad** - Extract to positioned card

**Per-Module Steps:**
1. Create HD card component in module
2. Update module.json with hdCards config
3. Register in HD_DASHBOARD_CARDS
4. Test in isolation
5. Remove hardcoded section from HD Dashboard
6. Test full integration
7. Document any lessons learned

---

## Examples & Use Cases

### Example 1: Winter Arc Goals Card

**Module.json:**
```json
{
  "id": "winter-arc",
  "dashboard": {
    "hdCards": {
      "enabled": true,
      "cards": [
        {
          "id": "goals",
          "component": "./components/hd-goals-card.tsx",
          "position": "above-stats",
          "size": "full-width",
          "order": 0
        }
      ]
    }
  }
}
```

**Component** (`/modules-core/winter-arc/components/hd-goals-card.tsx`):
```typescript
'use client'

import { getWinterArcGoals, toggleWinterArcGoal } from '../lib/winter-arc-goals'
import { useSupabase } from '@/components/providers'
import { useState, useEffect } from 'react'

export function WinterArcGoalsHDCard() {
  const { session } = useSupabase()
  const [goals, setGoals] = useState([])

  useEffect(() => {
    async function load() {
      const data = await getWinterArcGoals()
      setGoals(data)
    }
    if (session) load()
  }, [session])

  return (
    <div className="grid grid-cols-5 gap-2">
      {goals.map((goal, index) => {
        const pastelColors = [
          'bg-blue-50 dark:bg-blue-900/20',
          'bg-purple-50 dark:bg-purple-900/20',
          'bg-green-50 dark:bg-green-900/20',
          'bg-orange-50 dark:bg-orange-900/20',
          'bg-pink-50 dark:bg-pink-900/20'
        ]

        return (
          <button
            key={goal.id}
            onClick={() => toggleGoal(goal)}
            className={`relative border rounded p-4 ${pastelColors[index % 5]}`}
            style={{ opacity: goal.completed ? 0.3 : 1 }}
          >
            <div className="text-sm font-semibold uppercase">
              {goal.title}
            </div>
            {goal.completed && (
              <CheckIcon className="absolute top-2 right-2" />
            )}
          </button>
        )
      })}
    </div>
  )
}

export default WinterArcGoalsHDCard
```

**Registry:**
```typescript
const HD_DASHBOARD_CARDS = {
  'winter-arc': {
    'goals': () => import('@/modules-core/winter-arc/components/hd-goals-card')
  }
}
```

### Example 2: Major Projects Summary Card

**Module.json:**
```json
{
  "id": "major-projects",
  "dashboard": {
    "hdCards": {
      "enabled": true,
      "cards": [
        {
          "id": "summary",
          "component": "./components/hd-summary-card.tsx",
          "position": "top-stats",
          "size": "small",
          "color": "purple",
          "order": 15
        }
      ]
    }
  }
}
```

**Component:**
```typescript
'use client'

import { Briefcase } from 'lucide-react'
import { getMajorProjects, getProjectStatistics } from '../lib/utils'
import { useSupabase } from '@/components/providers'
import { useState, useEffect } from 'react'

export function MajorProjectsSummaryHDCard() {
  const { session } = useSupabase()
  const [stats, setStats] = useState({ total: 0, dueSoon: 0 })

  useEffect(() => {
    async function load() {
      const projects = await getMajorProjects()
      const statistics = getProjectStatistics(projects)
      setStats({ total: statistics.total, dueSoon: statistics.dueSoon })
    }
    if (session) load()
  }, [session])

  return (
    <>
      <div className="flex items-center gap-1">
        <Briefcase className="w-3 h-3 text-purple-600 dark:text-purple-400" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
          Projects
        </span>
      </div>
      <div className="text-lg font-bold text-purple-900 dark:text-purple-300">
        {stats.total}
      </div>
      <div className="text-[9px] text-gray-500 dark:text-gray-400">
        {stats.dueSoon} due soon
      </div>
    </>
  )
}

export default MajorProjectsSummaryHDCard
```

### Example 3: Custom Module with Multiple Cards

**Module.json:**
```json
{
  "id": "analytics",
  "dashboard": {
    "hdCards": {
      "enabled": true,
      "cards": [
        {
          "id": "kpi-summary",
          "component": "./components/hd-kpi-card.tsx",
          "position": "top-stats",
          "color": "blue",
          "order": 20
        },
        {
          "id": "recent-events",
          "component": "./components/hd-events-card.tsx",
          "position": "middle-column",
          "size": "medium",
          "color": "yellow",
          "order": 10
        },
        {
          "id": "chart",
          "component": "./components/hd-chart-card.tsx",
          "position": "bottom",
          "size": "full-width",
          "minWidth": "800px",
          "height": "300px",
          "order": 0
        }
      ]
    }
  }
}
```

This shows how one module can contribute multiple cards to different positions.

---

## Considerations & Trade-offs

### Technical Challenges

#### 1. Build-time Registry Requirement

**Challenge:** Must manually update `HD_DASHBOARD_CARDS` registry for each card

**Why:** Next.js/Turbopack cannot resolve dynamic imports with runtime-constructed paths like:
```typescript
// This DOES NOT WORK in production builds:
const path = `/modules-core/${moduleId}/components/${cardId}.tsx`
const component = await import(path)
```

**Solution:** Use static import registry (same pattern as `MODULE_API_ROUTES`)

**Trade-off:**
- ❌ Not fully automatic - developers must register cards
- ✅ Optimal bundle splitting and performance
- ✅ Type-safe at build time
- ✅ Works reliably in production

**Mitigation:**
- Clear documentation
- Validation script to check registry completeness
- Error messages guide developers to registration step

#### 2. Grid Layout Complexity

**Challenge:** HD Dashboard has precise, multi-level grid layouts

**Current Layout:**
- 6-column stats row
- 3-column main content grid
- Full-width sections above and below

**Dynamic cards must:**
- Fit grid constraints
- Not break layouts
- Respect responsive breakpoints

**Solution:**
- Position-based rendering (cards know their position)
- `HDCardWrapper` enforces appropriate grid behavior
- `gridSpan` property for flexibility (with limits)

**Mitigation:**
- Document grid constraints per position
- Provide size presets (small/medium/large)
- Warn on invalid configurations

#### 3. Theme Support

**Challenge:** HD Dashboard supports 3 themes: dark, blue, clean

**Every card must:**
- Provide dark mode variants: `dark:text-white`
- Provide blue theme variants: `blue:bg-[#056baa]`
- Provide clean theme fallbacks: `clean:bg-white`

**Solution:**
- `HDCardWrapper` handles base theme classes
- Template provides theme-aware examples
- Documentation includes theme checklist

**Mitigation:**
- Wrapper component provides theme foundation
- Component validation checks for theme classes
- Documentation emphasizes theme requirements

#### 4. Performance

**Challenge:** Dynamic imports add overhead

**Concerns:**
- Initial bundle size
- Lazy loading delays
- Too many cards = slow render

**Solution:**
- Code splitting per card (automatic via dynamic import)
- Suspense boundaries with skeletons
- Prioritized loading (render top cards first)

**Best Practices:**
- Keep card components small (<200 lines)
- Optimize data fetching (parallel requests)
- Use React.memo for expensive renders
- Lazy load images/charts

### Design Considerations

#### 1. Card Size Consistency

**Issue:** HD Dashboard is **ultra-compact** (text-[10px]), regular widgets are **normal size**

**Decision:** Separate HD card components from regular widgets

**Reasoning:**
- Different design goals (density vs. readability)
- Different use cases (glanceable vs. interactive)
- Reusing widgets would require conditional styling (complex)

**Outcome:** Modules have two dashboard components:
- `widget.tsx` - For regular dashboard (large, detailed)
- `hd-card.tsx` - For HD Dashboard (compact, glanceable)

#### 2. Position Management

**Issue:** How to handle position conflicts?

**Scenarios:**
- Multiple cards want same position
- Cards specify invalid positions
- Cards don't fit in grid

**Solution:**
- `order` property for sorting (0-100)
- Position is grouped, then sorted by order
- Invalid positions logged + skipped

**Example:**
```typescript
// Two cards in top-stats, rendered left-to-right by order
Card A: { position: 'top-stats', order: 10 }
Card B: { position: 'top-stats', order: 20 }
// Renders: [A] [B] [other cards...]
```

#### 3. Responsive Design

**Issue:** HD Dashboard is designed for **desktop/large screens**

**Current behavior:**
- 6-column → 3-column → 1-column on mobile
- Some sections hidden on small screens
- Ultra-compact design not suitable for tiny screens

**Recommendation:**
- HD Dashboard remains desktop-focused
- Mobile users see regular dashboard
- Cards can provide mobile hints in config (future)

**Future enhancement:**
```json
{
  "responsive": {
    "hideOnMobile": true,
    "mobilePosition": "bottom"
  }
}
```

### Maintenance Requirements

#### Registry Updates

**When:** Every time a new HD card is added

**Steps:**
1. Module developer creates card component
2. Module developer updates module.json
3. **Module developer updates HD_DASHBOARD_CARDS** ⚠️
4. Test locally
5. Commit all changes together

**Automation:**
- Validation script: `npm run validate-hd-cards`
- Checks module.json vs registry
- Warns on missing registrations
- Can be run in CI/CD

#### Testing

**Per-Card Testing:**
- Render in isolation
- Loading states work
- Error states don't crash
- Themes render correctly
- Data fetching succeeds

**Integration Testing:**
- Multiple cards render together
- Grid layouts don't break
- Order sorting works
- Module enable/disable works
- No performance regressions

**Regression Testing:**
- Existing sections still work
- No theme issues
- No responsive breakage
- No console errors

---

## Future Enhancements

### Phase 5: User Customization (Future)

**Not included in initial implementation**, but designed with these features in mind:

#### Drag-and-Drop Reordering

**Concept:** Users can rearrange cards within positions

**Technical:**
- Store card order per-user in `module_settings` table
- Use `react-beautiful-dnd` or similar library
- Override default `order` with user preferences

**UI:**
- "Customize Dashboard" mode button
- Drag handles on cards
- Save/Cancel buttons
- Reset to defaults option

#### Hide/Show Cards

**Concept:** Users can hide specific cards

**Technical:**
- Add `hiddenCards` array to user preferences
- Filter out hidden cards before rendering
- "Hidden Cards" settings panel

**UI:**
- Eye icon on each card (show/hide)
- Settings page lists all available cards
- Toggle visibility per card

#### Card Settings

**Concept:** Some cards have user-configurable options

**Example:** Major Projects card could have:
- Show overdue projects only (toggle)
- Group by due date (toggle)
- Max projects to show (dropdown: 5, 10, 20)

**Technical:**
- Card components accept `userSettings` prop
- Stored in module_settings.settings JSONB
- Card provides settings UI (gear icon → modal)

**Implementation:**
```typescript
// In card component
export function MyHDCard({ config, userSettings }: HDCardProps) {
  const showOverdueOnly = userSettings?.showOverdueOnly ?? false
  // Use settings in render logic
}

// In module.json (future)
{
  "hdCards": {
    "cards": [{
      "id": "stats",
      "userConfigurable": true,
      "defaultSettings": {
        "showOverdueOnly": false
      }
    }]
  }
}
```

### Phase 6: Advanced Features (Future)

#### Card Communication

**Concept:** Cards can send messages to each other

**Example:** Clicking "Create Task" in Projects card opens Tasks card's create dialog

**Technical:**
- Event bus system
- Cards emit events: `emitHDEvent('task:create', { projectId: 123 })`
- Cards subscribe: `onHDEvent('task:create', handler)`

**Use sparingly** - can create tight coupling

#### Conditional Rendering

**Concept:** Cards only render when certain conditions are met

**Example:** "Overdue Tasks" card only shows if tasks are overdue

**Technical:**
```json
{
  "id": "overdue-alert",
  "component": "./components/hd-overdue-card.tsx",
  "condition": "overdueTasks > 0"
}
```

**Challenge:** How to evaluate condition? Options:
- Server-side: Check in `getHDDashboardCards()`
- Client-side: Card renders null if condition false
- Hybrid: Config provides function

**Recommendation:** Start without this, add if needed

#### Card Refresh Controls

**Concept:** Cards can request refreshes of data

**Example:** "Refresh All" button re-fetches data for all cards

**Technical:**
- Cards expose `refresh()` method
- Dashboard maintains card refs
- Refresh button calls all refs

**Implementation:**
```typescript
// Card component
export const MyHDCard = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({
    refresh: async () => {
      await refetchData()
    }
  }))
  // ...
})

// Dashboard
const cardRefs = useRef<Map<string, HDCardRef>>(new Map())
const refreshAll = () => {
  cardRefs.current.forEach(ref => ref.refresh())
}
```

---

## Conclusion

### Summary

This proposal outlines a **WordPress-style hook system** for HD Dashboard that:

1. **Leverages existing infrastructure** - Builds on module system and widget patterns
2. **Maintains HD Dashboard's unique design** - Ultra-compact, dense, glanceable
3. **Uses proven patterns** - Registry approach (same as MODULE_API_ROUTES)
4. **Provides clear developer experience** - Simple API, good documentation
5. **Allows gradual adoption** - Can migrate sections one at a time

### Key Benefits

- ✅ **Modularity** - Features become self-contained
- ✅ **Extensibility** - Easy to add new dashboard sections
- ✅ **Maintainability** - Less coupling between modules and core
- ✅ **Consistency** - Enforced styling via wrapper components
- ✅ **Future-proof** - Designed for user customization later

### Recommended Next Steps

1. **Review this proposal** - Gather feedback, refine approach
2. **Prototype with Winter Arc** - Validate technical approach
3. **Implement core infrastructure** - Build foundational systems
4. **Document thoroughly** - Create templates and guides
5. **Migrate gradually** - Move existing sections one by one

### Estimated Timeline

- **Core Infrastructure**: 3-4 days
- **HD Dashboard Integration**: 3-4 days
- **Documentation**: 2-3 days
- **Per-module Migration**: 1-2 days each
- **Total (with 3 migrations)**: ~2-3 weeks

### Questions or Feedback?

This is a proposal - the design can be adjusted based on:
- Technical constraints discovered during prototyping
- Developer feedback on the API
- Performance requirements
- User experience considerations

---

**Document Version:** 1.0
**Last Updated:** November 2025
**Status:** Awaiting Review & Approval
