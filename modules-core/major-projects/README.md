# Delulu Projects Module

A comprehensive project management module for tracking and organizing your most delulu initiatives with task integration and deadline tracking.

## Overview

The Delulu Projects module provides a complete solution for managing your wildest projects within the ARI ecosystem. It includes project creation, editing, deletion, task integration, and customizable settings.

### Key Features

- ✅ **Full CRUD Operations** - Create, read, update, and delete projects
- ✅ **Task Integration** - Link tasks to projects and filter by project
- ✅ **Status Indicators** - Visual badges showing project urgency (overdue, due soon, upcoming, active)
- ✅ **Dashboard Widget** - Real-time delulu project statistics on main dashboard
- ✅ **Settings Panel** - Customizable user preferences
- ✅ **Statistics Cards** - Total projects, due soon, on track counts
- ✅ **Responsive Design** - Works on mobile, tablet, and desktop
- ✅ **Authentication** - Full RLS security with user isolation
- ✅ **Type Safety** - Complete TypeScript definitions throughout

---

## Table of Contents

- [Installation](#installation)
- [Database Setup](#database-setup)
- [File Structure](#file-structure)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Components](#components)
- [Customization](#customization)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Installation

This module is part of the ARI modular plugin system and is already integrated.

### Prerequisites

- Node.js 18+ and npm/pnpm
- Supabase project configured
- ARI core application installed

### Steps

1. **Module is Already Installed**

   The module files are located at `/modules-core/major-projects/`

2. **Database Setup** (Required - see next section)

3. **Register Module**
   ```bash
   npm run generate-module-registry
   ```

4. **Start Dev Server**
   ```bash
   npm run dev
   # or
   pnpm run dev
   ```

5. **Access Module**

   Navigate to: `http://localhost:3000/major-projects`

---

## Database Setup

### Step 1: Run the Schema SQL

1. Open your Supabase Dashboard → SQL Editor
2. Copy the contents of `database/schema.sql`
3. Paste and click **Run**

### Step 2: Verify Installation

Run these verification queries:

```sql
-- Check if table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'major_projects';

-- Check RLS policies (should return 4 policies)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'major_projects';

-- Check indexes (should return 3 indexes)
SELECT indexname FROM pg_indexes WHERE tablename = 'major_projects';

-- Check triggers (should return 1 trigger)
SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'major_projects';
```

### Expected Results

- ✅ Table `major_projects` exists
- ✅ 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)
- ✅ 3 indexes (user_id, due_date, created_at)
- ✅ 1 trigger (updated_at auto-update)

---

## File Structure

```
modules/major-projects/
├── module.json                      # Module manifest and configuration
├── README.md                        # This file
│
├── app/
│   └── page.tsx                    # Main page component (563 lines)
│
├── components/
│   ├── widget.tsx                  # Dashboard widget
│   └── settings-panel.tsx          # Settings UI
│
├── api/
│   ├── data/
│   │   ├── route.ts               # GET/POST endpoints
│   │   └── [id]/
│   │       └── route.ts           # PATCH/DELETE endpoints
│   └── settings/
│       └── route.ts               # Settings GET/PUT endpoints
│
├── lib/
│   └── utils.ts                   # Utility functions (20+ helpers)
│
├── types/
│   └── index.ts                   # TypeScript type definitions
│
└── database/
    ├── schema.sql                 # Database schema with RLS
    └── migrations/
        └── (future migrations)
```

---

## Usage

### Basic Workflow

1. **Create a Project**
   - Click "New Project" button
   - Enter project name (required)
   - Add description (optional)
   - Set due date (optional)
   - Click "Create Project"

2. **View Projects**
   - Projects displayed in responsive grid (1-3 columns)
   - Status badges show urgency (Overdue, Due Soon, Upcoming, Active)
   - Statistics cards show totals, due soon, and on track counts

3. **Edit a Project**
   - Click "Edit" button on project card
   - Modify any fields
   - Click "Update Project"

4. **Delete a Project**
   - Click trash icon on project card
   - Confirm deletion
   - Project permanently removed

5. **View Tasks for Project**
   - Click "View Tasks" button on project card
   - Redirects to Tasks page filtered by project_id
   - Shows only tasks linked to that project

### Status System

Projects are automatically categorized based on due date:

| Status | Days Until Due | Badge Color | Icon | Border |
|--------|----------------|-------------|------|--------|
| **Overdue** | < 0 (past due) | Red | ⚠️ | Thick (h-1) |
| **Due Soon** | 0-7 days | Orange | 🔥 | Thick (h-1) |
| **Upcoming** | 8-30 days | Yellow | ⏰ | Normal (h-0.5) |
| **Active** | > 30 days | Green | ✨ | Normal (h-0.5) |
| **No Due Date** | null | Gray | 📋 | Normal (h-0.5) |

### Dashboard Widget

The widget shows:
- **Total Projects** - Count of all projects
- **Due Soon** - Projects due within 7 days (configurable)
- **On Track** - Projects due in 8+ days
- **Overdue** - Projects past their due date

---

## API Documentation

### Endpoints

#### `GET /api/modules-core/major-projects/data`
Fetch all projects for authenticated user.

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "project_name": "Website Redesign",
    "project_description": "Complete overhaul",
    "project_due_date": "2025-12-31",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
]
```

#### `POST /api/modules-core/major-projects/data`
Create a new project.

**Request Body:**
```json
{
  "project_name": "Q1 Marketing Campaign",
  "project_description": "Launch new product line",
  "project_due_date": "2025-03-31"
}
```

**Response:** `201 Created` with created project object

#### `PATCH /api/modules-core/major-projects/data/[id]`
Update an existing project.

**Request Body:** (all fields optional)
```json
{
  "project_name": "Updated Name",
  "project_due_date": "2025-12-31"
}
```

**Response:** `200 OK` with updated project object

#### `DELETE /api/modules-core/major-projects/data/[id]`
Delete a project.

**Response:**
```json
{
  "success": true
}
```

#### `GET /api/modules-core/major-projects/settings`
Fetch user's module settings.

**Response:**
```json
{
  "showInDashboard": true,
  "enableNotifications": false,
  "defaultSortBy": "due_date",
  "defaultSortOrder": "asc",
  "dueSoonThreshold": 7
}
```

#### `PUT /api/modules-core/major-projects/settings`
Update user's settings (upsert).

**Request Body:** (partial updates supported)
```json
{
  "dueSoonThreshold": 14,
  "enableNotifications": true
}
```

---

## Components

### Main Page (`app/page.tsx`)

The primary user interface for managing projects.

**Features:**
- Project list with status indicators
- Create/Edit/Delete operations via dialog
- Statistics cards (Total, Due Soon, On Track)
- Task integration via "View Tasks" button
- Loading and error states
- Toast notifications for feedback

**Props:** None (uses hooks for data)

**Example Usage:**
```typescript
// Automatically loaded by module system at /major-projects
// No manual import needed
```

### Dashboard Widget (`components/widget.tsx`)

Displays project summary on dashboard.

**Features:**
- Total project count
- Due soon indicator
- On track and overdue counts
- Quick link to module page
- Loading and error states

**Export:**
```typescript
export function MajorProjectsWidget() { ... }
export default MajorProjectsWidget
```

**Integration:**
Registered in `module.json` under `dashboard.widgetComponents`

### Settings Panel (`components/settings-panel.tsx`)

User preferences configuration UI.

**Settings Available:**
- Show in Dashboard (toggle)
- Due Soon Threshold (3, 5, 7, 14, 30 days)
- Default Sort By (name, due_date, created_at)
- Default Sort Order (asc, desc)
- Enable Notifications (toggle)

**Export:**
```typescript
export function MajorProjectsSettingsPanel() { ... }
export default MajorProjectsSettingsPanel
```

**Integration:**
Registered in `module.json` under `settings.panel`

---

## Customization

### Change Status Thresholds

Edit `lib/utils.ts` → `getProjectStatus()` function:

```typescript
export function getProjectStatus(dueDate: string | null): ProjectStatus {
  const days = calculateDaysUntilDue(dueDate)

  if (days === null) return 'no_due_date'
  if (days < 0) return 'overdue'
  if (days <= 7) return 'due_soon'      // Change this threshold
  if (days <= 30) return 'upcoming'     // Change this threshold
  return 'active'
}
```

### Change Color Scheme

Edit badge colors in `lib/utils.ts` → `getStatusBadgeColor()`:

```typescript
export function getStatusBadgeColor(status: ProjectStatus): string {
  const colors = {
    overdue: 'bg-red-100 text-red-800 border-red-200',      // Overdue color
    due_soon: 'bg-orange-100 text-orange-800 border-orange-200', // Due soon color
    upcoming: 'bg-yellow-100 text-yellow-800 border-yellow-200', // Upcoming color
    active: 'bg-green-100 text-green-800 border-green-200',      // Active color
    no_due_date: 'bg-gray-100 text-gray-800 border-gray-200'    // No date color
  }
  return colors[status] || colors.no_due_date
}
```

### Add New Fields to Projects

1. **Update Database Schema:**
   ```sql
   ALTER TABLE major_projects ADD COLUMN priority VARCHAR(50);
   ```

2. **Update TypeScript Types** (`types/index.ts`):
   ```typescript
   export interface MajorProject {
     // ... existing fields
     priority?: string | null
   }
   ```

3. **Update API Validation** (`api/data/route.ts`):
   ```typescript
   const createSchema = z.object({
     // ... existing fields
     priority: z.string().max(50).optional()
   })
   ```

4. **Update UI** (`app/page.tsx`):
   - Add form field in dialog
   - Display priority in project cards

### Change Grid Layout

Edit `app/page.tsx` → grid classes:

```typescript
// Current: 1 column mobile, 2 tablet, 3 desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Example: 2 columns mobile, 3 tablet, 4 desktop
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
```

---

## Development

### Running Tests

Currently no automated tests. To manually test:

1. **Create Project**
   - ✅ Required field validation works
   - ✅ Project appears in list
   - ✅ Toast notification shows

2. **Edit Project**
   - ✅ Form pre-fills with existing data
   - ✅ Updates save correctly
   - ✅ UI updates immediately

3. **Delete Project**
   - ✅ Confirmation dialog appears
   - ✅ Project removed from list
   - ✅ Database record deleted

4. **Status Indicators**
   - ✅ Overdue projects show red badge
   - ✅ Due soon shows orange
   - ✅ Correct icons display

5. **Task Integration**
   - ✅ "View Tasks" button works
   - ✅ Tasks page filters by project_id
   - ✅ Correct project name displays

### Adding Features

Follow these patterns from the codebase:

1. **Authentication:** Always use `getAuthenticatedUser()` in API routes
2. **Validation:** Use Zod schemas for all inputs
3. **RLS:** Add explicit `.eq('user_id', user.id)` checks (defense-in-depth)
4. **Error Handling:** Try-catch with toast notifications
5. **Loading States:** Show spinners during async operations
6. **TypeScript:** Define types in `types/index.ts` first

### Code Style

- ✅ Use functional components with hooks
- ✅ Comprehensive JSDoc comments on all functions
- ✅ Organize code with section comments
- ✅ Extract repeated logic to utility functions
- ✅ Keep components under 600 lines (split if larger)

---

## Troubleshooting

### Module Not Found (404)

**Symptom:** `/major-projects` returns 404 error

**Solution:**
```bash
npm run generate-module-registry
npm run dev
```

**Verify:** Check `lib/generated/module-pages-registry.ts` includes `'major-projects'`

---

### Database Errors

**Symptom:** "relation major_projects does not exist"

**Solution:**
1. Run `database/schema.sql` in Supabase SQL Editor
2. Verify table exists:
   ```sql
   SELECT * FROM major_projects LIMIT 1;
   ```

**Symptom:** "new row violates row-level security policy"

**Solution:**
1. Check RLS policies exist:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'major_projects';
   ```
2. Ensure user is authenticated (check session)

---

### Widget Not Showing

**Symptom:** Dashboard widget doesn't appear

**Solution:**
1. Check `module.json` has `"dashboard": { "widgets": true }`
2. Verify widget exported correctly in `components/widget.tsx`
3. Check Settings → Major Projects → "Show in Dashboard" is enabled
4. Restart dev server after registry generation

---

### Settings Not Saving

**Symptom:** Settings revert after page refresh

**Solution:**
1. Check browser console for API errors
2. Verify `module_settings` table exists:
   ```sql
   SELECT * FROM module_settings WHERE module_id = 'major-projects';
   ```
3. Check API endpoint: `/api/modules-core/major-projects/settings`

---

### Import Errors

**Symptom:** "Cannot find module '@/modules-core/major-projects/...'"

**Solution:**
1. Verify module files exist at `/modules-core/major-projects/`
2. Check TypeScript paths in `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./*"]
       }
     }
   }
   ```
3. Restart TypeScript server in IDE

---

## Performance Considerations

- **Projects List:** No pagination needed (users typically have < 50 projects)
- **Statistics:** Calculated in-memory (fast for typical project counts)
- **API Calls:** Data fetched once per session, cached in component state
- **Database Indexes:** Optimized for common query patterns (user_id, due_date)

---

## Security

### Authentication
- All routes protected by middleware
- All API endpoints validate authentication
- Sessions expire and refresh automatically

### Database
- RLS policies on all operations (SELECT, INSERT, UPDATE, DELETE)
- User isolation enforced at database level
- Defense-in-depth with explicit user_id filtering
- Cascade delete when users are removed

### Validation
- Zod schemas validate all inputs
- String length limits enforced
- UUID format validation on path parameters
- No SQL injection possible (parameterized queries)

---

## Related Modules

- **Tasks** - Link tasks to projects via `project_id` field
- **Dashboard** - Displays Major Projects widget
- **Settings** - Hosts Major Projects settings panel

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review code comments in source files
3. Check ARI documentation at `/docs`

---

## Changelog

### Version 1.0.0 (November 2025)
- ✨ Initial module release
- ✅ Full CRUD operations
- ✅ Task integration
- ✅ Dashboard widget
- ✅ Settings panel
- ✅ Complete TypeScript support
- ✅ Comprehensive documentation

---

## License

Part of the ARI application. See main project license.

---

## Credits

**Module Author:** ARI Team
**Template:** Based on Hello World module
**Framework:** Next.js 15 + React 19 + Supabase

---

**Last Updated:** November 2025
**Version:** 1.0.0
