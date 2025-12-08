# Module Migration Checklist

This document provides a step-by-step checklist for migrating existing features to the ARI modular architecture. Use this as a reference when converting legacy features into self-contained modules.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Phase 1: Planning & Analysis](#phase-1-planning--analysis)
- [Phase 2: Module Structure](#phase-2-module-structure)
- [Phase 3: Core Files](#phase-3-core-files)
- [Phase 4: API Migration](#phase-4-api-migration)
- [Phase 5: Components](#phase-5-components)
- [Phase 6: Integration](#phase-6-integration)
- [Phase 7: Cleanup](#phase-7-cleanup)
- [Phase 8: Testing](#phase-8-testing)
- [Post-Migration](#post-migration)

---

## Prerequisites

Before starting migration, ensure:

- ✅ Module system is working (`/modules-core/hello-world` loads successfully)
- ✅ You have access to Supabase dashboard
- ✅ Development server can be restarted
- ✅ Git working directory is clean (recommended)

---

## Phase 1: Planning & Analysis

**Objective:** Understand the existing feature completely before migration.

### Step 1.1: Identify Feature Files

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

### Step 1.2: Document Dependencies

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

### Step 1.3: Test Current Functionality

- [ ] Test all CRUD operations
- [ ] Verify RLS policies work
- [ ] Check error handling
- [ ] Test with multiple users (if possible)
- [ ] Take screenshots for comparison

---

## Phase 2: Module Structure

**Objective:** Create the module directory and configuration.

### Step 2.1: Create Directory Structure

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
mkdir -p /modules-core/[module-id]/{app,api/data,api/settings,components,lib,types,database/migrations}
```

### Step 2.2: Create module.json

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

**Template:**
```json
{
  "id": "module-id",
  "name": "Module Name",
  "description": "Brief description of what this module does",
  "version": "1.0.0",
  "author": "ARI Team <ari@ari.software>",
  "icon": "IconName",
  "enabled": true,
  "fullscreen": false,
  "menuPriority": 10,
  "permissions": {
    "database": true,
    "api": true,
    "dashboard": true
  },
  "routes": [
    {
      "path": "/module-path",
      "label": "Module Label",
      "icon": "IconName",
      "sidebarPosition": "main"
    }
  ],
  "database": {
    "tables": ["table_name"],
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

---

## Phase 3: Core Files

**Objective:** Create foundational files with comprehensive documentation.

### Step 3.1: TypeScript Types

- [ ] Create `/types/index.ts`
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

### Step 3.2: Database Schema

- [ ] Create `/database/schema.sql`
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

### Step 3.3: Utility Functions

- [ ] Create `/lib/utils.ts`
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

---

## Phase 4: API Migration

**Objective:** Create modular API routes with proper validation and security.

### Step 4.1: Data Endpoints (GET/POST)

- [ ] Create `/api/data/route.ts`
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

### Step 4.2: Individual Resource Endpoints (PATCH/DELETE)

- [ ] Create `/api/data/[id]/route.ts`
- [ ] Implement PATCH handler (update by ID)
- [ ] Implement DELETE handler (delete by ID)
- [ ] Add UUID validation for path parameters
- [ ] Add Zod validation for update data
- [ ] Add authentication checks
- [ ] Add explicit user_id filtering
- [ ] Handle not found cases (404)
- [ ] Add comprehensive comments

### Step 4.3: Settings Endpoints (Optional)

- [ ] Create `/api/settings/route.ts`
- [ ] Implement GET handler (fetch user settings)
- [ ] Implement PUT handler (upsert settings)
- [ ] Return defaults if no settings exist
- [ ] Merge with defaults on GET
- [ ] Use upsert pattern for PUT
- [ ] Store in `module_settings` table

---

## Phase 5: Components

**Objective:** Create UI components with proper documentation and error handling.

### Step 5.1: Main Page Component

- [ ] Create `/app/page.tsx`
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

### Step 5.2: Dashboard Widget

- [ ] Create `/components/widget.tsx`
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

### Step 5.3: Settings Panel

- [ ] Create `/components/settings-panel.tsx`
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

---

## Phase 6: Integration

**Objective:** Update integration points to use the new module.

### Step 6.1: Update Imports in Other Files

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

### Step 6.2: Remove Static Menu Entry

- [ ] Check `/lib/menu-config.ts` for hardcoded entry
- [ ] Remove module entry from `menuConfig` array
- [ ] Remove unused icon imports
- [ ] Remove from feature descriptions
- [ ] Module system will handle menu entry dynamically

### Step 6.3: Verify Middleware

- [ ] Check `/middleware.ts` includes module route
- [ ] Ensure route is in `protectedRoutes` array
- [ ] Test that unauthenticated users are redirected

### Step 6.4: Update Debug Page

- [ ] Add module ID to `registeredModules` array in `/app/debug/page.tsx` (line ~274)
- [ ] Increment `expectedTables` count in `/app/debug/page.tsx` (line ~595)
- [ ] Run debug tests to verify module is recognized

### Step 6.5: Update Backup System

- [ ] Add table name to `COMPLETE_TABLE_LIST` in `/app/api/backup/export/route.ts`
- [ ] Add table name to `COMPLETE_TABLE_LIST` in `/app/api/backup/verify/route.ts`
- [ ] Update expected table count in `CLAUDE.md` (Expected Tables section)
- [ ] Add table to the numbered list in `CLAUDE.md`
- [ ] Test backup export includes module data

---

## Phase 7: Cleanup

**Objective:** Remove old files safely after verifying new module works.

### Step 7.1: Verify Module Loads

- [ ] Run `npm run generate-module-registry`
- [ ] Verify module appears in registry file
- [ ] Start dev server
- [ ] Navigate to module URL
- [ ] Verify module loads without errors

### Step 7.2: Test All Functionality

- [ ] Test create operation
- [ ] Test read/list operation
- [ ] Test update operation
- [ ] Test delete operation
- [ ] Test dashboard widget
- [ ] Test settings panel
- [ ] Test module enable/disable toggle

### Step 7.3: Delete Old Files

**IMPORTANT:** Only delete after confirming new module works!

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
rm -rf /app/old-feature
rm -rf /app/api/old-feature
rm /lib/old-feature.ts
```

---

## Phase 8: Testing

**Objective:** Comprehensively test the migrated module.

### Step 8.1: Functional Testing

- [ ] **Create**: Add new items successfully
- [ ] **Read**: List displays all user items
- [ ] **Update**: Edit items and see changes
- [ ] **Delete**: Remove items successfully
- [ ] **Validation**: Form validation works
- [ ] **Error Handling**: Errors display properly
- [ ] **Loading States**: Spinners show during async operations
- [ ] **Empty States**: Shows when no data

### Step 8.2: Integration Testing

- [ ] **Tasks Integration**: If applicable, test task linking
- [ ] **Dashboard Widget**: Appears on dashboard
- [ ] **Settings Panel**: Appears in settings
- [ ] **Menu Entry**: Shows in sidebar
- [ ] **Module Toggle**: Enable/disable works
- [ ] **Route Protection**: Unauthenticated users redirected

### Step 8.3: Security Testing

- [ ] **RLS Policies**: Users only see their own data
- [ ] **API Authentication**: Endpoints require auth
- [ ] **User Isolation**: No data leakage between users
- [ ] **Validation**: Invalid inputs rejected
- [ ] **UUID Validation**: Malformed IDs rejected

### Step 8.4: Cross-Browser Testing

- [ ] Test in Chrome/Edge
- [ ] Test in Firefox
- [ ] Test in Safari (if Mac)
- [ ] Test responsive design (mobile/tablet/desktop)

---

## Post-Migration

**Objective:** Document and finalize the migration.

### Step 9.1: Documentation

- [ ] Update main project README if needed
- [ ] Verify module README is complete
- [ ] Document any breaking changes
- [ ] Update CHANGELOG if applicable
- [ ] Add migration notes

### Step 9.2: Git Commit

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

### Step 9.3: Deployment Considerations

- [ ] Ensure database schema is deployed to production
- [ ] Verify environment variables are set
- [ ] Test in staging environment first
- [ ] Monitor for errors after deployment
- [ ] Have rollback plan ready

---

## Common Issues & Solutions

### Issue: "Module not found" error

**Solution:**
- Run `npm run generate-module-registry`
- Restart dev server
- Check module.json has correct structure
- Verify app/page.tsx exists and exports default

### Issue: Widget not showing on dashboard

**Solution:**
- Check module.json has `dashboard.widgets: true`
- Verify widget component exports both named and default
- Check user settings have module enabled
- Restart dev server

### Issue: Settings panel not showing

**Solution:**
- Check module.json has `settings.panel` path
- Verify settings component exports both named and default
- Check path is relative to module directory
- Restart dev server

### Issue: RLS policy errors

**Solution:**
- Verify RLS is enabled on table
- Check all 4 policies exist (SELECT, INSERT, UPDATE, DELETE)
- Verify `auth.uid() = user_id` in all policies
- Test with different users

### Issue: Old imports still referenced

**Solution:**
- Search globally: `grep -r "@/lib/old-file" .`
- Update all imports to module paths
- Clear Next.js cache: `rm -rf .next`
- Restart dev server

---

## Checklist Summary

Quick verification checklist:

- [ ] Module directory created with proper structure
- [ ] module.json configured correctly
- [ ] Types defined in types/index.ts
- [ ] Database schema in database/schema.sql
- [ ] Utilities in lib/utils.ts
- [ ] API routes in api/data/ and api/data/[id]/
- [ ] Settings API in api/settings/route.ts
- [ ] Main page in app/page.tsx (default export)
- [ ] Widget in components/widget.tsx (named + default export)
- [ ] Settings panel in components/settings-panel.tsx (named + default export)
- [ ] README.md created
- [ ] Module registry regenerated
- [ ] API routes registered in `/app/api/modules-core/[module]/[[...path]]/route.ts`
- [ ] Debug page updated (`registeredModules` array + `expectedTables` count)
- [ ] Backup system updated (both export and verify `COMPLETE_TABLE_LIST`)
- [ ] CLAUDE.md updated (Expected Tables count and list)
- [ ] Old imports updated in other files
- [ ] Static menu entry removed
- [ ] Old files deleted
- [ ] All tests passing
- [ ] Git commit created

---

## Estimated Time

- **Simple module** (no integrations): 2-3 hours
- **Medium module** (some integrations): 4-6 hours
- **Complex module** (heavy integrations): 8-12 hours

---

## Reference Implementation

See `/modules-core/hello-world/` for a complete reference implementation demonstrating all patterns and best practices.

See `/modules-core/major-projects/` (formerly "Delulu Projects") for a real-world migration example.

---

## Questions or Issues?

- Review Hello World module for patterns
- Check module system documentation
- Consult CLAUDE.md for project-specific rules
- Ask for help in team chat/issues

---

**Last Updated:** November 2025
**Version:** 1.0.0
