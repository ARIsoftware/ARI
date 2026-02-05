The user would like to create a custom module in the modules-custom directory. Each new module should start with the modules-core/hello-world module as a starting template.

## Pre-flight Checks

Before doing anything:
1. Read `/docs/MODULES.md` thoroughly - this is the primary module documentation
2. Read `/CLAUDE.md` for project conventions (authentication, RLS, theming)
3. Confirm `modules-core/hello-world` exists. If not, inform the user that this template module is missing.
4. Confirm we are at the repo root and that `modules-custom` exists. If not, create it.

## MCP Server Tools

This project has the `pg-aiguide` MCP server configured (via `.mcp.json`) which provides PostgreSQL documentation and best practices. When creating database schemas:

- Use `mcp__plugin_pg_pg-aiguide__semantic_search_postgres_docs` to look up PostgreSQL best practices for data types, indexes, constraints, and table design
- Use `mcp__plugin_pg_pg-aiguide__semantic_search_tiger_docs` for TimescaleDB/Tiger Cloud guidance if time-series data is involved

These tools help ensure database tables follow PostgreSQL conventions and best practices.

## Questions to Ask

Ask the user the following questions ONE AT A TIME, waiting for each answer before continuing:

1. **Module Name**: What is the name of the module? (e.g., "Habit Tracker")
2. **Description**: Please describe this module in detail. What is the purpose of the module? What features does it need? What data will be stored in the database?
3. **Navigation**: Should it appear in the sidebar? If so, what should the page name be?
4. **Submenu**: Does the module have any subpages which require a submenu?
5. **Top Bar**: Should it have a quick-access icon in the top bar?
6. **Onboarding**: Does this module need an onboarding/setup screen to collect initial configuration from the user? (e.g., asking for birthdate, preferences, API keys, etc.)

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

## Implementation Steps

When approved, create the module following this order:

1. **Copy template structure** from `modules-core/hello-world/`
2. **Update module.json** with:
   - Correct id, name, description
   - Proper icon and route
   - topBarIcon if requested
   - submenu configuration if requested (see Submenu section below)
   - Required dependencies
3. **Create/update page component** in `app/page.tsx`
4. **Create API routes** if needed:
   - Use `const { user, withRLS } = await getAuthenticatedUser()` (NOT supabase client)
   - Use `withRLS((db) => db.select()...)` for all database operations
   - Import tables from `@/lib/db/schema`
   - Use `toSnakeCase()` from `@/lib/api-helpers` for responses
   - See `modules-core/hello-world/api/data/route.ts` as the reference
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
6. **Create database migration** in `database/schema.sql` if tables needed
   - Use `mcp__plugin_pg_pg-aiguide__semantic_search_postgres_docs` to verify best practices for data types, indexes, and constraints
   - Use `TEXT` type for `user_id` (matches Better Auth)
   - Do NOT add `auth.uid()` RLS policies (Better Auth doesn't use this)
7. **Add Drizzle schema definition** to `/lib/db/schema/schema.ts` (REQUIRED for API routes to work)
   - See existing table definitions in that file for examples
   - Use `text("user_id")` for the user_id column
8. **Update types** in `types/index.ts`
9. **Create TanStack Query hooks** in `/lib/hooks/use-[module-name].ts` (see below)
10. **Run `npm run generate-module-registry`** to register the new module (pages only - API routes were registered in step 5)
11. **If public routes needed** (webhooks, external API access):
    - Add `publicRoutes` array to module.json with security configuration
    - Create route handler using `createPublicRouteHandler` wrapper
    - Document the required environment variable for the secret
    - See `/docs/MODULES.md` section 7.5 for detailed guidance
12. Ask the user for permission to execute the .sql file, or ask if they want to run the .SQL statements themselves.
13. If the user needs to take any action to complete the setup of the module (run a .sql file, restart the dev server etc), please clearly indicate the actions they need to take with clear instructions.

## Data Fetching Best Practices

**Always use TanStack Query** for modules that fetch data. Do NOT use the old `useState` + `useEffect` + `fetch` pattern.

### Create TanStack Query Hooks

Create `/lib/hooks/use-[module-name].ts` with:
- `useModuleEntries()` - fetches data with `useQuery`
- `useCreateModuleEntry()` - creates with `useMutation` + optimistic updates
- `useUpdateModuleEntry()` - updates with `useMutation` + optimistic updates
- `useDeleteModuleEntry()` - deletes with `useMutation` + optimistic updates

**IMPORTANT**: When importing types from modules, always use `@/modules/` alias:
```typescript
import type { MyModuleEntry } from '@/modules/my-module/types'  // Correct!
// NOT: '@/modules-custom/my-module/types' or '@/modules-core/my-module/types'
```

See `/lib/hooks/use-ari-launch.ts` or `/lib/hooks/use-tasks.ts` for examples.

### Optimistic Updates Pattern

All mutations should implement optimistic updates:
1. Close modals immediately after user clicks save (don't wait for `onSuccess`)
2. Update cache in `onMutate` so UI reflects changes instantly
3. Rollback in `onError` if the server request fails
4. Show toast notification on error

### Don't Block on Session

Do NOT add `if (!session) return <Loading />` at the start of the page component. This causes a visible "Authenticating..." delay. Instead:
- Render the page structure immediately
- Let TanStack Query handle the loading state with `isLoading`
- Middleware already protects routes from unauthenticated users
- API routes use cookies/headers for auth automatically

See `/docs/MODULES.md` section 9 "Data Fetching with TanStack Query" for full documentation.

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

## Quality Assurance Checklist

Before marking complete, verify:
- [ ] module.json is valid and complete
- [ ] All API routes use `withRLS()` helper (NOT Supabase client) - see hello-world/api/data/route.ts
- [ ] **If module has API routes**: Routes registered in `MODULE_API_ROUTES` in `/app/api/modules/[module]/[[...path]]/route.ts`
- [ ] Drizzle schema added to `/lib/db/schema/schema.ts` (required for API routes)
- [ ] Database schema.sql created (for reference/manual setup)
- [ ] TanStack Query hooks created in `/lib/hooks/use-[module-name].ts`
- [ ] **All imports use `@/modules/` alias** (NOT `@/modules-custom/` or `@/modules-core/`)
- [ ] Page uses TanStack Query hooks (not manual useState/useEffect/fetch)
- [ ] Optimistic updates implemented for all mutations
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

## Important Reminders

- NEVER start the dev server - the user will do this
- Never run a .sql statement without explicit approval.
- Follow existing code patterns exactly - **use hello-world as the template**
- **API routes must use Drizzle + withRLS()** - NOT Supabase client
- **Do NOT use `auth.uid()` in database RLS policies** - Better Auth doesn't support this
- User isolation is enforced at the **application level** via `withRLS()` helper
- **API route registration is MANUAL**: The `generate-module-registry` script only auto-generates page routes. API routes MUST be manually registered in `MODULE_API_ROUTES` in `/app/api/modules/[module]/[[...path]]/route.ts` - this is a Next.js/Turbopack limitation.
- **Module Portability**: Always use `@/modules/` alias for imports (NOT `@/modules-custom/` or `@/modules-core/`). This allows modules to be moved between directories without code changes. The alias resolves `modules-custom` first, then `modules-core`.
