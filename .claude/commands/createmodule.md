The user would like to create a custom module in the modules-custom directory. Each new module should start with the modules-core/hello-world module as a starting template.

## Pre-flight Checks

Before doing anything:
1. Read `/docs/MODULES.md` thoroughly - this is the primary module documentation
2. Read `/CLAUDE.md` for project conventions (authentication, RLS, theming)
3. Confirm `modules-core/hello-world` exists. If not, inform the user that this template module is missing.
4. Confirm we are at the repo root and that `modules-custom` exists. If not, create it.

## Questions to Ask

Ask the user the following questions ONE AT A TIME, waiting for each answer before continuing:

1. **Module Name**: What is the name of the module? (e.g., "Habit Tracker")
2. **Description**: Please describe this module in detail. What is the purpose of the module? What features does it need? What data will be stored in the database?
4. **Navigation**: Should it appear in the sidebar? If so, what should the page name be?
5. **Top Bar**: Should it have a quick-access icon in the top bar?

Note: The user may have requested to create the module in the modules-core directory. If so, please inform them that it is highly recommended that all new modules are placed in the modules-custom directory, and confirm with them that the new module should be placed in the modules-custom directory as recommended. Give the user the opportunity to confirm that the module can be placed in the the modules-custom directory. If they reply that the module should be in the modules-core directory please comply with that request.

## Validation Rules

- Derive a folder slug from the module name in kebab-case (e.g., "Habit Tracker" -> "habit-tracker").
- Only lowercase alphanumeric characters and hyphens allowed.
- Ensure the target folder does not already exist at that location. If it does, ask for a new name.
- Module ID in module.json must match the folder slug.

## Before Proceeding

After collecting answers:
1. Ask any clarifying questions about unclear requirements
2. Present a detailed summary with your understandings and then ask for explicit approval to proceed.

## Implementation Steps

When approved, create the module following this order:

1. **Copy template structure** from `modules-core/hello-world/`
2. **Update module.json** with:
   - Correct id, name, description
   - Proper icon and route
   - topBarIcon if requested
   - Required dependencies
3. **Create/update page component** in `app/page.tsx`
4. **Create API routes** if needed (follow auth patterns from hello-world)
5. **Create database migration** in `database/schema.sql` if tables needed
6. **Update types** in `types/index.ts`
7. **Create TanStack Query hooks** in `/lib/hooks/use-[module-name].ts` (see below)
8. **Run `npm run generate-module-registry`** to register the new module
9. Ask the user for permission to execute the .sql file, or ask if they want to run the .SQL statements themselves.
10. If the user needs to take any action to complete the setup of the module (run a .sql file, restart the dev server etc), please clearly indicate the actions they need to take with clear instructions.
11. If database tables are created, remind the user to enable RLS on each new table. If the project is using Supabase you can tell them to enable RLS via Supabase Dashboard > Table Editor > [table] > RLS policies > Enable RLS.

## Data Fetching Best Practices

**Always use TanStack Query** for modules that fetch data. Do NOT use the old `useState` + `useEffect` + `fetch` pattern.

### Create TanStack Query Hooks

Create `/lib/hooks/use-[module-name].ts` with:
- `useModuleEntries()` - fetches data with `useQuery`
- `useCreateModuleEntry()` - creates with `useMutation` + optimistic updates
- `useUpdateModuleEntry()` - updates with `useMutation` + optimistic updates
- `useDeleteModuleEntry()` - deletes with `useMutation` + optimistic updates

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

## Quality Assurance Checklist

Before marking complete, verify:
- [ ] module.json is valid and complete
- [ ] All API routes use proper authentication (see hello-world patterns)
- [ ] Database schema includes RLS policies with `auth.uid()`
- [ ] TanStack Query hooks created in `/lib/hooks/use-[module-name].ts`
- [ ] Page uses TanStack Query hooks (not manual useState/useEffect/fetch)
- [ ] Optimistic updates implemented for all mutations
- [ ] Page does NOT block on session check (no "Authenticating..." spinner)
- [ ] Component uses proper theming (Tailwind classes, not hardcoded colors)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Module appears in sidebar after registry generation
- [ ] Page loads without errors in dev server

## Important Reminders

- NEVER start the dev server - the user will do this
- Never run a .sql statement without explicit approval.
- Follow existing code patterns exactly (auth, RLS, theming)
- The module registry auto-generates on `npm run dev` or `npm run build`
