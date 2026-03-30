The user would like to create a custom module in the modules-custom directory. Each new module should start with the modules-core/hello-world module as a starting template.

## Pre-flight Checks

Before doing anything:
1. Read `/docs/MODULES.md` thoroughly - this is the primary module documentation
2. Read `/CLAUDE.md` for project conventions (authentication, RLS, theming)
3. Confirm `modules-core/hello-world` exists. If not, inform the user that this template module is missing.
4. Confirm we are at the repo root and that `modules-custom` exists. If not, create it.

## Security Requirements

**Security is absolutely paramount.** Every module must be secure by default. No exceptions.

### Database Security
- **All Supabase tables MUST have Row Level Security (RLS) policies enabled.** A table without RLS is an open table — any authenticated user can read/write any row.
- RLS policies must enforce `user_id` isolation so users can only access their own data.
- Since Better Auth does not use `auth.uid()`, RLS policies should use application-level enforcement via the `withRLS()` helper. However, if creating raw SQL policies, ensure they restrict access appropriately.
- Never create tables with RLS disabled, even for "temporary" or "simple" modules.

### API Security
- **Every API route MUST call `getAuthenticatedUser()` and verify the user exists** before doing anything else. Unauthenticated requests must be rejected immediately.
- **All database operations MUST use `withRLS()`** — never use the raw Supabase client or unscoped Drizzle queries.
- **All user input MUST be validated with Zod schemas** before use. Never trust client-provided data.
- Never expose internal error details (stack traces, SQL errors) to the client. Return generic error messages.
- **Public/webhook routes** require secret-based validation (HMAC signatures, bearer tokens, etc.). See `/docs/MODULES.md` section 7.5.

### General Security Principles
- Never store secrets, API keys, or credentials in code or client-accessible files. Use environment variables.
- Never log sensitive data (passwords, tokens, PII) in API routes.
- Always use parameterized queries (Drizzle handles this) — never interpolate user input into SQL.
- If a module accepts file uploads, validate file types and sizes server-side.

## MCP Server Tools

This project has the `pg-aiguide` MCP server configured (via `.mcp.json`) which provides PostgreSQL documentation and best practices. When creating database schemas:

- Use `mcp__plugin_pg_pg-aiguide__semantic_search_postgres_docs` to look up PostgreSQL best practices for data types, indexes, constraints, and table design
- Use `mcp__plugin_pg_pg-aiguide__semantic_search_tiger_docs` for TimescaleDB/Tiger Cloud guidance if time-series data is involved

These tools help ensure database tables follow PostgreSQL conventions and best practices.

## Questions to Ask

Ask the user the following questions ONE AT A TIME, waiting for each answer before continuing. When asking each question, prefix it with "ARI:" instead of numbering them (e.g., "ARI: What is the name of the module?"). Do not ask about v0 generated code, unless the user mentions is.

1. **Module Name**: What is the name of the module? (e.g., "Habit Tracker", "Recipe Book", "Budget Manager")
2. **Description**: Please describe this module in detail. What is the purpose of the module? What features does it need? What data will be stored in the database?
3. **Navigation**: Should it appear in the sidebar? If so, what should the page name be?
4. **Submenu**: Does the module have any subpages which require a submenu?
5. **Top Bar**: Should it have a quick-access icon in the top bar?
6. **Onboarding**: Does this module need an onboarding/setup screen to collect initial configuration from the user? (e.g., asking for birthdate, preferences, API keys, etc.)
7. **Dashboard Widget**: Should this module add a card or widget to the main Dashboard? If yes, describe what it should display (e.g., summary stat, chart, recent items list). There are two types: **stat cards** (small cards in the Quick Overview grid) and **widgets** (larger components in the content area below).

If the user provides v0 code:
- Read and analyze all provided v0 code files
- Summarize what the v0 UI does: components, data model, interactions, CRUD operations
- Rephrase the Description question (Q3) as a confirmation: "ARI: Based on the v0 code, this module appears to [summary]. Is this accurate? Any changes or additions needed?"
- When v0 code is provided, skip UI layout clarifying questions (e.g., "list view, cards, calendar?") since the UI is already defined. Focus clarifying questions on data/business logic instead.

Then ask follow-up clarifying questions based on their answers. You can ask any clarifying questions. Here are some examples of clarifying questions:

- What data needs to be stored?
- How do you envision the main UI/layout? (list view, cards, calendar, etc.)
- Do you need to create, edit, and delete entries? Or just view them?
- Are there any statuses, categories, or tags needed?
- Do you need any sorting, filtering, or search capabilities?
- Should entries have dates/timestamps? Due dates? Recurring items?
- Do you need any calculations, totals, or statistics displayed?
- Are there any relationships to other modules or data (e.g., linking to tasks, contacts)? What should happen if the other data/module is not available or installed?
- Are there any existing apps or tools that do something similar to what you want?
- **Does this module need to receive data from external services?** (e.g., webhooks from Stripe, Resend, GitHub, etc.) If yes, a public route with security validation will be needed.

Continue asking questions until you have a very clear picture of what to build. The goal is to avoid building the wrong thing or missing important requirements.

Note: The user may have requested to create the module in the modules-core directory. If so, please inform them that it is highly recommended that all new modules are placed in the modules-custom directory, and confirm with them that the new module should be placed in the modules-custom directory as recommended. Give the user the opportunity to confirm that the module can be placed in the the modules-custom directory. If they reply that the module should be in the modules-core directory please comply with that request.

## Validation Rules

- Derive a folder slug from the module name in kebab-case (e.g., "Habit Tracker" -> "habit-tracker").
- Only lowercase alphanumeric characters and hyphens allowed.
- Ensure the target folder does not already exist at that location. If it does, ask for a new name.
- Module ID in module.json must match the folder slug.

## Before Proceeding

After collecting answers:
1. Ask any additional clarifying questions if required.
2. Present a detailed summary with your understandings and then ask for explicit approval to proceed.

## v0 Code Integration

If the user provided v0.dev code, perform the following analysis and preparation before
starting the Implementation Steps. Present findings to the user for confirmation.

### v0 Code Analysis

Analyze all provided v0 code and extract:
1. **Component hierarchy** — identify the main page component vs. sub-components
2. **Data model** — what entities/data structures are implied by mock/static data arrays
3. **shadcn imports** — list all `@/components/ui/*` imports used
4. **External dependencies** — any npm imports beyond react, next, @/components/ui/*, @/lib/*, lucide-react
5. **CRUD operations** — what create/read/update/delete actions are implied by buttons and handlers
6. **State classification** — which useState calls are "data state" (→ becomes TanStack Query) vs. "UI state" (→ stays as useState, e.g. dialog open/close, form inputs)

### Dependency Resolution

1. List all `@/components/ui/*` imports found in the v0 code
2. Check which components exist in `components/ui/` directory (use `ls components/ui/`)
3. Report any missing components to the user
4. With user approval, install missing components: `npx shadcn@latest add [component1] [component2] ...`
5. Check for non-standard npm package imports and install with `npm install` if needed
6. Note: if v0 imports `recharts` directly, prefer ARI's existing `@/components/ui/chart` wrapper

### Code Restructuring Rules

When transforming v0 output into module structure:
- The main/root component becomes `app/page.tsx` with `export default function`
- Extract sub-components into separate files in `components/` directory
- Remove any v0 layout wrappers (`<html>`, `<body>`, root divs with font/theme setup)
- Ensure `'use client'` directive is present
- Preserve ALL Tailwind classes and visual styling exactly as-is
- If a shadcn component is already installed in ARI with customizations, keep ARI's version — do NOT overwrite with v0's version
- Replace mock/static data with placeholder comments (e.g., `// TODO: wire to TanStack Query`) during initial restructuring

### Data Layer Derivation

Reverse-engineer the database schema from v0's mock data:
- Each mock data array → a database table
- Each object key → a column
- Type inference: strings → TEXT, numbers → INTEGER or NUMERIC, dates → TIMESTAMPTZ, booleans → BOOLEAN
- Status/category fields with fixed string values → suggest CHECK constraint or enum
- Always include `user_id TEXT` and standard timestamps (`created_at`, `updated_at`)
- Use the pg-aiguide MCP tools to validate the derived schema design

Present the derived data model to the user for confirmation before building API routes.

## Implementation Steps

When approved, create the module following this order:

1. **Copy template structure** from `modules-core/hello-world/`
   - **If v0 code was provided:** Copy the template for module.json, API, hooks, types, and database structure only. Do NOT use hello-world's `app/page.tsx` — the v0 code will replace it.
1.5. **If v0 code was provided — Install dependencies:**
   - Follow the Dependency Resolution steps from the "v0 Code Integration" section
   - Install any missing shadcn components and npm packages before proceeding
2. **Update module.json** with:
   - Correct id, name, description
   - Proper icon and route
   - topBarIcon if requested
   - submenu configuration if requested (see Submenu section below)
   - Dashboard widget configuration if requested (see Dashboard Widgets section below)
   - Required dependencies
3. **Create/update page component** in `app/page.tsx`
   - **If v0 code was provided:** Use the v0 component as the base for `app/page.tsx`. Apply the Code Restructuring Rules from the "v0 Code Integration" section. Extract sub-components to `components/` directory.
   - **Random Quote under title**: Every module page MUST include a random quote displayed under the page title when the Quotes module is enabled. Follow the Hello World pattern:
     1. Import `useModuleEnabled` from `@/lib/modules/module-hooks` and `useEffect`
     2. Check if quotes is enabled: `const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')`
     3. Add state: `const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)`
     4. Fetch a random quote in `useEffect` when `quotesEnabled && !quotesLoading` (fetch from `/api/modules/quotes/quotes`, pick random)
     5. Display below the `<h1>` title:
        ```tsx
        {quotesEnabled && randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">
            {randomQuote.quote}
          </p>
        )}
        ```
     See `modules-core/hello-world/app/page.tsx` for the complete implementation.
4. **Create API routes** if needed:
   - Use `const { user, withRLS } = await getAuthenticatedUser()` (NOT supabase client)
   - Use `withRLS((db) => db.select()...)` for all database operations
   - Import tables from `@/lib/db/schema`
   - Use `toSnakeCase()` from `@/lib/api-helpers` for responses
   - **Drizzle `numeric()` columns return STRINGS** - convert to `Number()` in GET responses before sending to client (see "Drizzle Numeric Column Handling" section below)
   - **Zod schemas MUST have human-readable error messages** on every constraint (see "Zod Validation Rules" section below)
   - See `modules-core/hello-world/api/data/route.ts` as the reference
   - **If v0 code was provided:** Use the derived data model from the "v0 Code Integration" analysis to inform API route data shapes. Build routes that serve data in the same shape the v0 components already expect (matching the mock data structure).
5. **Register API routes in MODULE_API_ROUTES** (REQUIRED if module has API routes):
   - Edit `/app/api/modules/[module]/[[...path]]/route.ts`
   - Add your module to the `MODULE_API_ROUTES` object with all API endpoints
   - **This step is NOT auto-generated** - Next.js/Turbopack cannot resolve dynamic imports at runtime
   - Example:
     ```typescript
     'my-module': {
       'data': () => import('@/modules/my-module/api/data/route'),
       'settings': () => import('@/modules/my-module/api/settings/route'),
       'data/[id]': () => import('@/modules/my-module/api/data/[id]/route'), // For dynamic routes
     },
     ```
   - See existing modules in that file for patterns (hello-world, tasks, etc.)
6. **Create database schema** in `[module-folder]/database/schema.sql` if tables needed (this path is git-tracked so the module is fully portable as a self-contained folder)
   - Use `mcp__plugin_pg_pg-aiguide__semantic_search_postgres_docs` to verify best practices for data types, indexes, and constraints
   - Use `TEXT` type for `user_id` (matches Better Auth)
   - **MUST include `ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;`** for every table
   - **MUST include RLS policies** that restrict SELECT/INSERT/UPDATE/DELETE to rows matching the authenticated user's `user_id`
   - Do NOT add `auth.uid()` RLS policies (Better Auth doesn't use this) — use application-level enforcement via `withRLS()`
7. **Add Drizzle schema definition** to `/lib/db/schema/schema.ts` (REQUIRED for API routes to work)
   - See existing table definitions in that file for examples
   - Use `text("user_id")` for the user_id column
8. **Update types** in `types/index.ts`
   - **If v0 code was provided:** Derive TypeScript interfaces from the v0 mock data structures identified during analysis.
9. **Create TanStack Query hooks** in the module's `hooks/` directory (e.g., `modules-custom/[module]/hooks/use-[module-name].ts`) (see below)
9.5. **If v0 code was provided — Wire components to real data:**
   - Replace all static/mock data arrays with TanStack Query hook calls (e.g., `useModuleEntries()`)
   - Replace mock event handlers with real mutation calls (e.g., `createEntry.mutate(...)`)
   - Add loading states using `isLoading` from `useQuery`
   - Add error handling with toast notifications
   - Add optimistic updates following the patterns in "Optimistic Updates Pattern" section
   - Ensure dialogs follow the "Dialog & Form Validation Pattern" section
   - Verify no hardcoded mock data remains in any component
10. **Run `npm run generate-module-registry`** to register the new module (pages only - API routes were registered in step 5)
11. **If public routes needed** (webhooks, external API access):
    - Add `publicRoutes` array to module.json with security configuration
    - Create route handler using `createPublicRouteHandler` wrapper
    - Document the required environment variable for the secret
    - See `/docs/MODULES.md` section 7.5 for detailed guidance
12. Ask the user for permission to execute the .sql file, or ask if they want to run the .SQL statements themselves.

## Data Fetching Best Practices

**Always use TanStack Query** for modules that fetch data. Do NOT use the old `useState` + `useEffect` + `fetch` pattern.

### Create TanStack Query Hooks

Create hooks inside the module directory at `hooks/use-[module-name].ts` (e.g., `modules-custom/my-module/hooks/use-my-module.ts`). All module hooks MUST live inside the module folder — never in `/lib/hooks/`.

Each hook file should export:
- `useModuleEntries()` - fetches data with `useQuery`
- `useCreateModuleEntry()` - creates with `useMutation` + optimistic updates
- `useUpdateModuleEntry()` - updates with `useMutation` + optimistic updates
- `useDeleteModuleEntry()` - deletes with `useMutation` + optimistic updates

**IMPORTANT**: When importing types from modules, always use `@/modules/` alias:
```typescript
import type { MyModuleEntry } from '@/modules/my-module/types'  // Correct!
// NOT: '@/modules-custom/my-module/types' or '@/modules-core/my-module/types'
```

See `modules-core/hello-world/hooks/` for the reference pattern.

### Optimistic Updates Pattern

All mutations should implement optimistic updates:
1. **Do NOT close dialogs before server confirms** - only close in `onSuccess` callback (see "Dialog & Form Validation Pattern" below)
2. Update cache in `onMutate` so UI reflects changes instantly
3. Rollback in `onError` if the server request fails
4. Show toast notification on error with the actual error message from the server

### Don't Block on Session

Do NOT add `if (!session) return <Loading />` at the start of the page component. This causes a visible "Authenticating..." delay. Instead:
- Render the page structure immediately
- Let TanStack Query handle the loading state with `isLoading`
- Middleware already protects routes from unauthenticated users
- API routes use cookies/headers for auth automatically

See `/docs/MODULES.md` section 9 "Data Fetching with TanStack Query" for full documentation.

## Dashboard Widgets Implementation

If the user wants their module to contribute cards or widgets to the main Dashboard, configure the `dashboard` field in `module.json`:

```json
"dashboard": {
  "widgets": true,
  "statCards": ["./components/dashboard-stat-card.tsx"],
  "widgetComponents": ["./components/dashboard-widget.tsx"]
}
```

**Two types of dashboard components:**

1. **`statCards`** — Small cards rendered in the "Quick Overview" grid row at the top of the dashboard (alongside System Status). Best for: summary counts, scores, single metrics.

2. **`widgetComponents`** — Larger widgets rendered in the content area below the stats grid. Best for: charts, lists, multi-card sections.

**Rules for dashboard components:**
- Must be **self-contained**: fetch their own data via API calls, handle their own loading states
- Must `export default` (dynamic imports expect a default export)
- Must include `'use client'` directive
- Use `@tanstack/react-query` for data fetching (useQuery)
- Wrap content in Shadcn `<Card>` components to match dashboard styling
- Include a "View All" or navigation button linking to the module's main page
- See `modules-core/tasks/components/dashboard-stat-card.tsx` as a stat card reference
- See `modules-core/daily-fitness/components/dashboard-widget.tsx` as a widget reference

After creating dashboard components, run `npm run generate-module-registry` to register them in the auto-generated dashboard registry.

## Submenu Implementation

If the module requires a sidebar submenu, follow the Hello World module as the template:

**Note:** Submenus should only contain the actual navigation links (Overview, Settings, etc.). Do NOT include the module name as a header item - the Back button provides sufficient context for users to know which module they're in.

1. **Read the Hello World submenu component** at `modules-core/hello-world/components/sidebar-submenu.tsx` - copy and adapt this for your module
2. **Read the Hello World module.json** to see how the `submenu` field is configured
3. **Register your submenu** in `/components/sidebar-submenu-renderer.tsx`:
   - Add a static import at the top: `import YourModuleSubmenu from '@/modules/your-module/components/sidebar-submenu'`
   - **IMPORTANT**: Always use `@/modules/` alias (NOT `@/modules-custom/` or `@/modules-core/`) - this allows modules to be moved between directories without code changes
   - Add an entry to the `SUBMENU_COMPONENTS` registry: `'your-module': YourModuleSubmenu`
4. **Create sub-pages** for each submenu item (e.g., `app/settings/page.tsx`)

Always reference the Hello World module's actual code as the source of truth for submenu implementation.

## Onboarding Section Implementation

If the module requires an onboarding/setup screen, follow the **Hello World module** pattern at `modules-core/hello-world/app/page.tsx`. This provides a clean, centered card-based setup experience.

**IMPORTANT**: Hello World is a template module that ALWAYS shows the onboarding screen (with a skip button) so developers can see the pattern. When creating a real module, you must modify the condition to only show onboarding until the user completes it.

### Onboarding Pattern Overview

1. **Settings storage**: Use the existing `module_settings` table with JSONB settings column (no separate table needed)
2. **Conditional render**: Check if `settings?.onboardingCompleted` is true; if not, show onboarding screen
3. **Centered card UI**: Use a centered Card component with icon, title, and form fields
4. **Flag completion**: Set `onboardingCompleted: true` when user completes setup

### Implementation Steps

1. **Use existing module_settings table**: No separate table needed. Settings are stored in the `module_settings` table's JSONB `settings` column, keyed by `module_id`.

2. **Add onboarding fields to your types** in `types/index.ts`:
   ```typescript
   export interface ModuleSettings {
     onboardingCompleted: boolean
     // Add your configuration fields here
     myField1: string
     myField2: string
   }
   ```

3. **Create settings API route** (`api/settings/route.ts`) - copy from Hello World:
   - GET: Fetch user settings (returns empty object `{}` if none exist)
   - PUT: Create/update settings (upsert pattern using `module_id`)

4. **Create TanStack Query hooks** for settings (see `modules-core/hello-world/hooks/use-hello-world.ts`):
   ```typescript
   export function useModuleSettings() {
     return useQuery({
       queryKey: ['module-name-settings'],
       queryFn: async (): Promise<Partial<ModuleSettings>> => {
         const res = await fetch('/api/modules/module-name/settings')
         if (!res.ok) return {}
         return await res.json()
       },
     })
   }

   export function useUpdateModuleSettings() {
     const queryClient = useQueryClient()
     return useMutation({
       mutationFn: async (settings: Partial<ModuleSettings>): Promise<void> => {
         const res = await fetch('/api/modules/module-name/settings', {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(settings),
         })
         if (!res.ok) throw new Error('Failed to save settings')
       },
       onMutate: async (newSettings) => {
         await queryClient.cancelQueries({ queryKey: ['module-name-settings'] })
         const previous = queryClient.getQueryData<Partial<ModuleSettings>>(['module-name-settings'])
         queryClient.setQueryData<Partial<ModuleSettings>>(['module-name-settings'], (old = {}) => ({
           ...old,
           ...newSettings,
         }))
         return { previous }
       },
       onError: (_err, _newSettings, context) => {
         if (context?.previous) {
           queryClient.setQueryData(['module-name-settings'], context.previous)
         }
       },
       onSettled: () => {
         queryClient.invalidateQueries({ queryKey: ['module-name-settings'] })
       },
     })
   }
   ```

5. **Implement onboarding UI in page component**:

   **NOTE**: Hello World uses `showOnboardingDemo` state to always show the onboarding as a demo.
   For real modules, remove that state and use `!settings?.onboardingCompleted` directly:

   ```tsx
   const { data: settings, isLoading: settingsLoading } = useModuleSettings()
   const updateSettings = useUpdateModuleSettings()

   // Loading state
   if (settingsLoading) {
     return (
       <div className="flex items-center justify-center h-96">
         <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
       </div>
     )
   }

   // Onboarding screen - shows until user completes it
   // NOTE: Hello World uses `showOnboardingDemo` state instead - remove that for real modules!
   if (!settings?.onboardingCompleted) {
     return (
       <div className="p-6 max-w-md mx-auto">
         <Card>
           <CardHeader className="text-center">
             <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
               <YourIcon className="w-8 h-8 text-primary" />
             </div>
             <CardTitle className="text-2xl">Welcome to Module Name</CardTitle>
             <CardDescription>
               Brief description of what this module does.
             </CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             {/* Form fields for initial setup */}
             <div className="space-y-2">
               <Label htmlFor="fieldName">Field Label</Label>
               <Input
                 id="fieldName"
                 value={fieldValue}
                 onChange={(e) => setFieldValue(e.target.value)}
               />
             </div>
             <Button
               className="w-full"
               onClick={handleSetup}
               disabled={updateSettings.isPending}
             >
               {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
               Get Started
             </Button>
             {/* NOTE: Remove the "Skip to Module Demo" button from Hello World - that's only for the template */}
           </CardContent>
         </Card>
       </div>
     )
   }

   // Main view (after onboarding complete)
   return (
     <div className="p-6">
       {/* Main module content */}
       {/* NOTE: Remove the "View Onboarding Demo" button from Hello World - that's only for the template */}
     </div>
   )
   ```

### Key Components Used
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card`
- `Button` from `@/components/ui/button`
- `Input` from `@/components/ui/input`
- `Label` from `@/components/ui/label`
- `Select` components for dropdown options
- `Loader2` from `lucide-react` for loading spinner

### Reference Files
- **Main example**: `modules-core/hello-world/app/page.tsx` (onboarding UI pattern)
- **Settings API**: `modules-core/hello-world/api/settings/route.ts`
- **Hooks**: `modules-core/hello-world/hooks/use-hello-world.ts` (useHelloWorldSettings, useUpdateHelloWorldSettings)
- **Types**: `modules-core/hello-world/types/index.ts`

## Drizzle Numeric Column Handling

**CRITICAL**: Drizzle ORM returns `numeric()` / `decimal()` columns as **strings**, not numbers. This WILL crash any code that calls `.toFixed()`, does arithmetic, or passes values to charts/sorting.

**Rule**: Always convert numeric columns to `Number()` in the API GET response before sending to the client. Do this once in the API layer so every UI consumer gets proper numbers.

```typescript
// In GET route - after fetching from DB, before returning response:
const normalized = rows.map((r) => ({
  ...r,
  // Convert every numeric() column to a real number
  battingAvg: Number(r.battingAvg),
  percentage: Number(r.percentage),
  score: Number(r.score),
}))

return NextResponse.json({ items: toSnakeCase(normalized) })
```

**Also applies to POST/PATCH `.returning()`** - if your create/update route uses `.returning()` and sends the result back, those numeric columns will also be strings. Normalize them before responding.

**When to watch out**: Any Drizzle schema column defined with `numeric()`, `decimal()`, or `real()`. Integer columns (`integer()`) are fine - they return as numbers.

**Design tip**: If a column only needs whole numbers or simple decimals (no precision requirements), prefer `integer()` or `doublePrecision()` over `numeric()` to avoid this issue entirely. Use `numeric(precision, scale)` only when exact decimal precision matters (e.g., currency, batting averages).

## Zod Validation Rules

**Every Zod constraint MUST have a human-readable error message.** Never use bare `.min()` / `.max()` without a message - the default errors are cryptic and unhelpful.

```typescript
// WRONG - cryptic default errors like "Number must be less than or equal to 1"
z.number().min(0).max(1)
z.string().min(1).max(100)

// RIGHT - clear, user-friendly messages
z.number().min(0, 'AVG must be between 0 and 1.000').max(1, 'AVG must be between 0 and 1.000')
z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less')
```

**API routes must return Zod issue details** so the client can display them. This pattern is already used in the codebase:
```typescript
const parseResult = Schema.safeParse(body)
if (!parseResult.success) {
  return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
}
```

**In mutation hooks**, surface the Zod details from the API response so the user sees specific errors:

```typescript
mutationFn: async (data: CreateRequest): Promise<Item> => {
  const res = await fetch('/api/modules/my-module/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const details = err.details?.map((d: any) => d.message).join(', ')
    throw new Error(details || err.error || 'Failed to create item')
  }
  const json = await res.json()
  return json.item
},
```

## Dialog & Form Validation Pattern

**All create/edit dialogs MUST implement inline validation with red outlines.** Never rely only on toast messages for validation errors.

### Required Pattern:

1. **Client-side validation function** that mirrors the Zod schema:
```typescript
type FieldErrors = Record<string, string>

function validateForm(form: CreateRequest): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (form.score < 0 || form.score > 100) errors.score = 'Must be 0-100'
  // ... mirror all Zod rules
  return errors
}
```

2. **Error state in the component**:
```typescript
const [errors, setErrors] = useState<FieldErrors>({})
```

3. **Validate on submit, show inline errors**:
```typescript
const handleSave = () => {
  const fieldErrors = validateForm(form)
  setErrors(fieldErrors)
  if (Object.keys(fieldErrors).length > 0) return // Stop - don't close dialog

  // Only close on success, NOT before the API call
  createMutation.mutate(form, {
    onSuccess: () => setDialogOpen(false),
    onError: (err) => toast({ variant: 'destructive', title: 'Failed to create item', description: err.message }),
  })
}
```

4. **Red outlines on invalid fields**:
```typescript
const inputClass = (field: string) =>
  errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''

const selectTriggerClass = (field: string) =>
  errors[field] ? 'border-red-500 ring-red-500' : ''
```

5. **Error messages below fields**:
```tsx
<Input className={inputClass('name')} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
{errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
```

6. **Clear errors as user fixes them**:
```typescript
const updateField = (field: keyof CreateRequest, value: any) => {
  setForm((prev) => ({ ...prev, [field]: value }))
  if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
}
```

7. **Reset errors when opening dialog**:
```typescript
const openCreate = () => {
  setForm(emptyForm)
  setErrors({})
  setDialogOpen(true)
}
```

**NEVER close the dialog before the server confirms success.** If validation fails (client or server), the dialog stays open so the user can fix their input without re-entering everything.

## Code Review & Simplification

Before running the QA checklist, review ALL generated code for the new module. Spawn three review agents in parallel using the Agent tool:

1. **Code Reuse Agent** — Find duplicate code, shared logic opportunities, and unnecessary abstractions across the module's files
2. **Code Quality Agent** — Identify quality issues, inconsistencies with existing codebase patterns, and readability problems
3. **Efficiency Agent** — Spot performance issues, unnecessary operations, redundant re-renders, and memory concerns

After all three agents report back, apply fixes to the module code. Then apply these simplification rules to all generated files:

- **No nested ternaries** — use switch statements or if/else chains for multiple conditions
- **Clarity over brevity** — prefer explicit, readable code over dense one-liners
- **Reduce nesting** — flatten deeply nested logic with early returns or guard clauses
- **Remove obvious comments** — delete comments that just restate what the code does
- **Clean up imports** — remove unused imports, sort them logically
- **Consistent naming** — ensure all variables, functions, and components follow codebase conventions

Then proceed to the QA checklist.

## Quality Assurance Checklist

Before marking complete, verify:
- [ ] **SECURITY: All API routes authenticate via `getAuthenticatedUser()` and reject unauthenticated requests**
- [ ] **SECURITY: All database operations use `withRLS()` — no raw/unscoped queries**
- [ ] **SECURITY: All user input validated with Zod before use**
- [ ] **SECURITY: Database tables have RLS enabled** (verify in schema.sql: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] **SECURITY: No secrets, credentials, or sensitive data hardcoded or logged**
- [ ] module.json is valid and complete
- [ ] All API routes use `withRLS()` helper (NOT Supabase client) - see hello-world/api/data/route.ts
- [ ] **If module has API routes**: Routes registered in `MODULE_API_ROUTES` in `/app/api/modules/[module]/[[...path]]/route.ts`
- [ ] Drizzle schema added to `/lib/db/schema/schema.ts` (required for API routes)
- [ ] Database `database/schema.sql` created inside the module folder (git-tracked, keeps module self-contained)
- [ ] TanStack Query hooks created inside the module directory (`hooks/use-[module-name].ts`) — NOT in `/lib/hooks/`
- [ ] **All imports use `@/modules/` alias** (NOT `@/modules-custom/` or `@/modules-core/`)
- [ ] Page uses TanStack Query hooks (not manual useState/useEffect/fetch)
- [ ] Optimistic updates implemented for all mutations
- [ ] **If tables use `numeric()` columns**: API GET routes convert them to `Number()` before responding
- [ ] **All Zod constraints have human-readable error messages** (no bare `.min()` / `.max()`)
- [ ] **Mutation hooks surface API error details** (parse `err.details` from Zod validation responses)
- [ ] **All create/edit dialogs have inline validation** (red outlines + error text below fields)
- [ ] **Dialogs only close on `onSuccess`** (never before API confirms - user must not lose form data on error)
- [ ] **Random quote displayed under page title** when Quotes module is enabled (follows Hello World pattern)
- [ ] Page does NOT block on session check (no "Authenticating..." spinner)
- [ ] **Page does NOT include layout wrappers** (no SidebarProvider, AppSidebar, DarkModeProvider, SidebarInset, or header with breadcrumbs - these are already provided by the module routing system)
- [ ] Component uses proper theming (Tailwind classes, not hardcoded colors)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Module appears in sidebar after registry generation
- [ ] Page loads without errors in dev server (no duplicate toolbars)
- [ ] **If public routes exist**: `publicRoutes` configured in module.json with security
- [ ] **If public routes exist**: Route handler uses `createPublicRouteHandler` wrapper
- [ ] **If public routes exist**: Endpoint visible in `/debug` → Endpoints tab
- [ ] **If onboarding exists**: Settings types include `onboardingCompleted` flag
- [ ] **If onboarding exists**: Settings API with GET (fetch) and PUT (upsert) endpoints
- [ ] **If onboarding exists**: Conditional render shows onboarding when `!settings?.onboardingCompleted`
- [ ] **If onboarding exists**: Centered card UI follows Hello World pattern
- [ ] **If onboarding exists**: Removed Hello World demo-specific code (`showOnboardingDemo` state, "Skip to Module Demo" button, "View Onboarding Demo" button)
- [ ] **If v0 import used**: All mock/static data replaced with TanStack Query hooks
- [ ] **If v0 import used**: No hardcoded data arrays remain in components
- [ ] **If v0 import used**: All event handlers wired to real mutations
- [ ] **If v0 import used**: All missing shadcn components installed (no import errors)
- [ ] **If v0 import used**: Any non-standard npm dependencies installed
- [ ] **If v0 import used**: v0 layout wrappers removed (no extra html/body wrappers)
- [ ] **If v0 import used**: Component has default export and 'use client' directive

## Critical Rules

1. **Security is paramount.** Every module must be secure by default — no exceptions. All API routes must authenticate, all DB operations must use `withRLS()`, all input must be Zod-validated, all tables must have RLS enabled. See the Security Requirements section above for full details.
2. **ALL module code MUST be self-contained within the module directory.** Hooks, components, types, utilities — everything lives inside `modules-core/<id>/` or `modules-custom/<id>/`. NEVER place module-specific code in shared directories like `lib/hooks/`, `lib/`, or `components/`. A module must be installable by adding its single folder. A module must be deletable by removing its single folder. The ONLY exceptions are the required registration touchpoints: Drizzle schema in `/lib/db/schema/schema.ts`, API routes in `MODULE_API_ROUTES`, and submenu registration in `sidebar-submenu-renderer.tsx`.
3. **NEVER start the dev server** — the user will do this.
4. **Never run a .sql statement without explicit approval.**
5. **Follow existing code patterns exactly** — use hello-world as the template.
6. **API routes must use Drizzle + withRLS()** — NOT Supabase client.
7. **Do NOT use `auth.uid()` in database RLS policies** — Better Auth doesn't support this. User isolation is enforced at the application level via `withRLS()` helper.
8. **API route registration is MANUAL**: The `generate-module-registry` script only auto-generates page routes. API routes MUST be manually registered in `MODULE_API_ROUTES` in `/app/api/modules/[module]/[[...path]]/route.ts` — this is a Next.js/Turbopack limitation.
9. **Module Portability**: Always use `@/modules/` alias for imports (NOT `@/modules-custom/` or `@/modules-core/`). This allows modules to be moved between directories without code changes. The alias resolves `modules-custom` first, then `modules-core`.
10. **v0 code is a visual starting point only**: Always build proper API routes, hooks, and database schema. Never leave mock data in production components.
11. **Use the pg-aiguide MCP tools** when creating database schemas. These are configured in `.mcp.json` and must be used to validate data types, indexes, and constraints — do not skip this step.
12. **Don't use PostgreSQL array casts in Drizzle's `sql` template literal** (e.g. `${value}::uuid[]`). Drizzle parameterizes values for safety, so the array gets passed as a bound parameter (`$1`) that PostgreSQL can't cast to a typed array. Instead, use Drizzle's query builder methods (e.g. individual `update().where()` calls with `Promise.all` for batch operations).
13. If the user must take any action to complete the module setup (for example, run a .sql file or restart the dev server), make that your last message so it is clearly visible. Use these statement: "🧑🏼‍💻 USER ACTION REQUIRED:" followed by clear, step-by-step instructions for what they need to do.
