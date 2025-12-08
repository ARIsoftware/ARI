# Module Architecture Migration Guide

You have access to a reference document called `/docs/MODULE-DETAILS.md` that describes a proven module architecture for Next.js applications. Your task is to help migrate this application to use a similar modular structure.

## Phase 1: Learn the Reference Architecture

First, read and understand the `/docs/MODULE-DETAILS.md` file thoroughly. Pay special attention to:

1. **Core Concepts**
   - How modules are self-contained in `/modules/{module-id}/` directories
   - The `module.json` manifest format and required fields
   - How catch-all routes (`/app/[module]/[[...slug]]/page.tsx`) dynamically serve module pages
   - The registry-based approach for dynamic imports (required because Next.js/Turbopack can't resolve fully dynamic imports)

2. **Infrastructure Components**
   - `/lib/modules/module-types.ts` - TypeScript interfaces
   - `/lib/modules/module-loader.ts` - Server-side discovery
   - `/lib/modules/module-registry.ts` - Module state management
   - `/lib/modules/module-hooks.ts` - Client-side React hooks
   - `/lib/modules/reserved-routes.ts` - Protected route names
   - `/lib/generated/module-pages-registry.ts` - Auto-generated before build

3. **Key Patterns**
   - Build-time registry generation via `scripts/generate-module-registry.js`
   - Per-user module enable/disable via `module_settings` database table
   - API routes proxied through `/api/modules/[module]/[[...path]]/route.ts`
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
   - List of files to create in `/lib/modules/`
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
