# ARI Application - Claude Memory & Setup Documentation

This documentation reflects the current state of the ARI application as of December 2025, including Better Auth authentication and the module system.

## Overview
ARI is a Next.js 15 (React 19) application using Better Auth for authentication and Supabase PostgreSQL for database operations.

## Tech Stack
- **Framework**: Next.js 15.2.4 with React 19
- **Authentication**: Better Auth (email/password with Argon2 hashing)
- **Database**: Supabase PostgreSQL (with application-level security)
- **ORM**: Drizzle ORM (with RLS support via `withRLS()`)
- **Styling**: Tailwind CSS + Shadcn/ui components
- **Font**: DM Sans
- **Deployment**: Vercel-ready

## Authentication Architecture

### Better Auth Integration
The app uses Better Auth for authentication with the following components:

#### 1. Authentication Flow
- **Sign In/Up**: Custom forms at `/sign-in` using Better Auth
- **Session Management**: Handled by Better Auth with secure HTTP-only cookies
- **Protected Routes**: Middleware validates sessions before allowing access
- **Password Hashing**: Argon2id (winner of Password Hashing Competition)
- **Rate Limiting**: Built-in protection against brute force attacks

#### 2. Key Authentication Files

##### `/lib/auth.ts`
Server-side Better Auth configuration:
```typescript
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    password: { minLength: 18, hash: argon2Hash, verify: argon2Verify }
  },
  user: {
    additionalFields: {
      firstName: { type: "string", required: false },
      lastName: { type: "string", required: false },
    }
  },
  rateLimit: { enabled: true, window: 60, max: 10 },
  plugins: [nextCookies()]
})
```

##### `/lib/auth-client.ts`
Client-side auth for React components:
```typescript
import { createAuthClient } from "better-auth/react"
export const authClient = createAuthClient({})
```

##### `/lib/auth-helpers.ts`
API route helper that provides backward-compatible interface:
```typescript
export async function getAuthenticatedUser() {
  // Returns: { user, session, supabase (legacy), withRLS (Drizzle) }
}
```

##### `/components/providers.tsx`
- Global context provider using `authClient.useSession()`
- Exposes `useSupabase()` hook (legacy name) and `useAuth()` for components
- Note: Does NOT provide direct database access - use API routes instead

##### `/middleware.ts`
- Protects routes requiring authentication via `auth.api.getSession()`
- Redirects unauthenticated users to `/sign-in`
- Sets security headers (CSP, HSTS, X-Frame-Options, etc.)

##### `/components/auth/auth-form.tsx`
- Reusable authentication form component
- Uses `authClient.signIn.email()` for sign-in
- Email/password authentication only (sign-ups can be disabled)

##### `/app/api/auth/[...all]/route.ts`
- Better Auth API handler for all auth endpoints
- Handles sign-in, sign-out, session management

## Database Schema

### Main Tables
- **`tasks`**: Main tasks table with user isolation via RLS and priority scoring
- **`ari-fitness-database`**: Fitness tracking with RLS
- **`northstar_entries`**: Goal tracking entries
- **`contacts`**: User contacts management
- **`hyrox_workouts`**: HYROX training data
- **`hyrox_workout_stations`**: HYROX station performance

### Security Implementation
User data isolation is enforced at the application level using Drizzle ORM with RLS:

#### Using `withRLS()` for Database Operations
```typescript
const { user, withRLS } = await getAuthenticatedUser()
if (!user || !withRLS) return unauthorized()

// SELECT - RLS filters automatically by user_id
const tasks = await withRLS((db) =>
  db.select().from(tasks).orderBy(desc(tasks.createdAt))
)

// INSERT - must set user_id explicitly (RLS validates but doesn't auto-populate)
const newTask = await withRLS((db) =>
  db.insert(tasks).values({ title: 'New', user_id: user.id })
)
```

#### Legacy Supabase Client (Deprecated)
The `supabase` client from `getAuthenticatedUser()` uses the service role key and bypasses RLS. It's kept for backward compatibility but new code should use `withRLS()`.

### SQL Development Tips

#### Writing Sample Data SQL
For sample data or seed scripts that need a `user_id`, query the Better Auth `user` table:

```sql
DO $$
DECLARE
  my_user_id TEXT;
  my_collection_id UUID;
BEGIN
  -- Get user ID from Better Auth user table
  SELECT id INTO my_user_id FROM public."user" LIMIT 1;

  -- Use RETURNING INTO to capture generated IDs for foreign keys
  INSERT INTO collections (user_id, name)
  VALUES (my_user_id, 'My Collection')
  RETURNING id INTO my_collection_id;

  -- Now use both IDs
  INSERT INTO items (user_id, collection_id, title)
  VALUES (my_user_id, my_collection_id, 'My Item');
END $$;
```

**Key patterns:**
- Use PL/pgSQL `DO $$ ... END $$` blocks for multi-step inserts
- `RETURNING id INTO variable` captures auto-generated UUIDs
- Query `public."user"` (Better Auth table) to get user IDs for sample data

## Application Features

### Core Features

#### Task Management
- Create, edit, delete tasks
- Advanced priority scoring system with radar chart visualization
- Task prioritization based on Impact, Severity, Timeliness, Effort, and Strategic Fit (1-5 scale)
- Bulk operations support
- Real-time updates

#### Fitness Tracking
- Daily fitness tasks
- HYROX training module
- Progress tracking and analytics
- Performance statistics dashboard

#### Contact Management
- Add and manage contacts
- Contact categorization
- Quick contact actions

#### Northstar Goals
- Goal setting and tracking
- Progress visualization
- Milestone management

#### AI Assistant
- ChatGPT-powered conversational interface
- Located at `/assist` route
- Real-time streaming responses
- Clean, minimal chat UI with user/assistant message distinction

#### Task Priority Radar System
- Interactive radar chart visualization showing task priorities
- 5-axis priority calculation: Impact, Severity, Timeliness, Effort, Strategic Fit
- Tasks closer to center = higher priority (lower calculated score)
- Color-coded by due date urgency (red=overdue, orange=soon, green=not urgent)
- Click-to-edit priority factors via modal interface
- Automatic priority score calculation using weighted Euclidean distance

### UI Components

#### Focus Timer System
- Global timer state using window object
- Integrated with TaskAnnouncement component
- Visual feedback in topbar (expands when active)
- Time options: 5, 10, 20, 30 minutes
- Completion notification: "FOCUS TIME COMPLETE 💪"

#### Exercise Reminder System
- Hourly reminders at :50 and :51 minutes
- Modal popup with exercise prompt
- Dark blue background (#091a32)
- Dismissible only via "DONE" button

#### User Profile Dropdown
- Custom profile management UI
- Update user information
- Change password functionality
- Sign out option
- Located in sidebar footer

#### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Cmd+B` | Toggle sidebar visibility |
| `Cmd+D` | Enter drag-and-drop mode for sidebar reordering |

#### Sidebar Module Reordering
- Press `Cmd+D` to enter drag-and-drop mode
- Sidebar modules display dashed lightblue outlines
- Main content fades to 10% opacity
- Top bar shows instruction text with X button to exit
- Drag modules to reorder them
- Click X to save order and exit
- Order is persisted per-user in `module_settings.settings.menuPriority`
- Uses Swapy library for drag-and-drop functionality

## File Structure

### Key Directories
```
/app                    # Next.js app router pages
  /dashboard           # Main dashboard
  /tasks              # Task management
  /radar              # Task priority radar visualization
  /contacts           # Contact management
  /daily-fitness      # Fitness tracking
  /hyrox             # HYROX training
  /northstar         # Goal tracking
  /sign-in           # Authentication
  /profile           # User profile
  /api                # API routes
    /tasks            # Task CRUD operations
      /priorities     # Priority scoring endpoints

/components            # React components
  /ui                # Shadcn/ui components
  /auth              # Authentication components
  /providers.tsx     # Global providers
  /app-sidebar.tsx   # Main navigation
  /radar-task-dots.tsx  # Radar chart task visualization
  /task-priority-modal.tsx  # Priority editing modal

/lib                  # Utilities and helpers
  /auth.ts           # Better Auth server configuration
  /auth-client.ts    # Better Auth client for React
  /auth-helpers.ts   # getAuthenticatedUser() helper
  /db.ts             # Drizzle ORM with RLS support
  /db-supabase.ts    # Supabase client (legacy)
  /tasks.ts          # Task operations
  /contacts.ts       # Contact operations
  /fitness-stats.ts  # Fitness analytics
  /priority-utils.ts # Priority scoring calculations
  /api-helpers.ts    # API validation helpers

/middleware.ts        # Route protection

/modules-core          # Core modules (self-contained features)
  /[module-id]/       # Each module folder
    module.json       # Module manifest (see /docs/MODULES.md)
    /app/page.tsx     # Module main page
    /api/             # Module API routes
    /components/      # Module components

/lib/modules          # Module system infrastructure
```

### Module Top Bar Icons

Modules can add quick access icons to the global top navigation bar by configuring `topBarIcon` in their `module.json`:

```json
{
  "topBarIcon": {
    "icon": "CheckSquare",
    "route": "/tasks",
    "tooltip": "Open Tasks"
  }
}
```

For full module documentation, see `/docs/MODULES.md`.

## Environment Variables

### Required
```env
# Better Auth
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000  # Or your production URL
DATABASE_URL=postgresql://...  # Supabase PostgreSQL connection string

# Supabase (for database access)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_service_role_key  # Server-side only
```

### Optional
```env
NEXT_PUBLIC_APP_URL=https://your-domain.com  # For trusted origins
OPENAI_API_KEY=your_openai_api_key  # For AI Assistant feature
```

## Development Guide

### Local Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

### Authentication Testing
1. Sign in at `/sign-in` with existing credentials
2. Better Auth stores users in `public."user"` and sessions in `public."session"` tables
3. Test protected routes redirect to `/sign-in` when not authenticated
4. Monitor auth state via `authClient.useSession()` in browser DevTools

### Database Management
- Use Supabase dashboard for schema changes
- Test RLS policies before deploying
- Use migrations for production changes
- Monitor database performance in Supabase dashboard

## Security Considerations

### Authentication
- All routes protected by middleware using Better Auth sessions
- Sessions stored in HTTP-only cookies (not localStorage)
- Passwords hashed with Argon2id (OWASP recommended)
- Rate limiting on auth endpoints (5 sign-in attempts/minute)
- HTTPS required in production

### Database
- Application-level RLS via `withRLS()` helper
- User isolation enforced in Drizzle queries
- No direct database access from client components
- Service role key only used server-side

### API Security
- All API routes require authentication via `getAuthenticatedUser()`
- Comprehensive Zod validation on all endpoints
- Rate limiting via Better Auth
- Input validation on all endpoints
- Security headers set in middleware (CSP, HSTS, X-Frame-Options)

## Deployment

### Vercel Deployment
1. Connect GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy with automatic builds on push
4. Monitor performance and errors

### Post-Deployment
- Verify authentication flow works with Better Auth
- Test all protected routes redirect properly
- Confirm `withRLS()` queries filter by user correctly
- Monitor error logs

## Recent Updates

### Better Auth Migration (December 2025)
Successfully migrated from Supabase Auth to Better Auth:
- Replaced Supabase Auth with Better Auth for authentication
- Implemented Argon2id password hashing (OWASP recommended)
- Added built-in rate limiting on auth endpoints
- Sessions stored in HTTP-only cookies for security
- Created backward-compatible `getAuthenticatedUser()` helper
- Added Drizzle ORM with `withRLS()` for database operations
- See `/docs/BETTERAUTH-MIGRATION-PLAN.md` for migration details

### Priority Radar Feature (September 2025)
Added comprehensive task priority visualization system:
- Interactive radar chart at `/radar` route
- 5-axis priority scoring: Impact, Severity, Timeliness, Effort, Strategic Fit
- Automatic priority score calculation using weighted Euclidean distance
- Task database schema extended with priority columns
- Real-time priority editing with modal interface
- Color-coded urgency indicators based on due dates

## Backup System Architecture (v2.1)

### Overview
Comprehensive database backup and restore system with 3-tier table discovery, ensuring ALL database tables are always exported.

### Key Components

#### 1. Database Functions (`/migrations/backup_system_functions.sql`)
Three PostgreSQL functions for reliable table discovery:
- `get_all_user_tables()`: Returns all public schema tables with metadata
- `get_table_row_counts()`: Returns actual row counts for each table
- `exec_sql(text)`: Executes raw SQL for backup operations

**Setup**: Run this SQL file once in Supabase SQL Editor for optimal performance.

#### 2. Export API (`/app/api/backup/export/route.ts`)
**3-Tier Discovery Approach** (with automatic fallbacks):
1. **Method 1 (Optimal)**: RPC function `get_all_user_tables()` - Fast, reliable, accurate
2. **Method 2 (Fallback)**: Raw SQL via `exec_sql()` - Works without migration
3. **Method 3 (Manual)**: Individual table validation - Always works

**Features**:
- Automatically discovers ALL tables (including future tables)
- Exports complete database as executable SQL file
- Includes table schemas, constraints, indexes
- Generates checksums for data integrity verification
- Tracks discovery method used and provides warnings
- Version 2.1 includes discovery metadata in exports

**Export includes**:
- All 19+ tables (auto-discovered)
- Complete schemas with data types and constraints
- All data with proper SQL escaping
- Primary keys, unique constraints, indexes
- Checksums for integrity verification

#### 3. Verification Endpoint (`/app/api/backup/verify/route.ts`)
**Purpose**: Preview what will be backed up BEFORE exporting

**Returns**:
- Discovery method used (rpc_function / raw_sql / individual_validation / hardcoded_fallback)
- Number of tables found vs expected
- Total row count across all tables
- Detailed table list with row counts
- Warnings if using fallback methods
- Missing or extra tables detected

**Access**: Any authenticated user can verify (no admin required)

#### 4. Settings UI (`/app/settings/page.tsx` - Backups tab)
User-friendly interface with:
- **Preview Backup** button - Shows what will be exported before downloading
- **Export Database** button - Downloads complete SQL backup
- **Import Database** - Restores from previous backup (with confirmation)
- Discovery method display - Shows which method was used
- Friendly warnings - Clear messages if fallback methods used
- Post-export statistics - Shows tables exported, rows, and method used

#### 5. Debug Page Tests (`/app/debug/page.tsx`)
**4th diagnostic card**: "Backup System Tests"

**Tests**:
1. **Backup Endpoint Accessibility** - Verifies `/api/backup/verify` is accessible
2. **Table Discovery Test** - Which method is working (RPC / SQL / Manual / Hardcoded)
3. **Table Count Verification** - Confirms all 19 expected tables are found
4. **Row Count Summary** - Shows total rows and per-table breakdown
5. **System Warnings** - Displays any warnings or issues
6. **Export Endpoint Test** - Verifies export endpoint is accessible

**Results Display**:
- Color-coded status (green=ok, yellow=warning, red=error)
- Clear recommendations (e.g., "Run migration for optimal performance")
- Detailed data breakdown for debugging

### Table Discovery Methods Explained

| Method | Speed | Reliability | Requirements | Status |
|--------|-------|-------------|--------------|--------|
| **RPC Function** | Fast | 100% | Requires migration | ✅ Optimal |
| **Raw SQL** | Fast | 95% | `exec_sql()` function | ⚠️ Fallback |
| **Individual Validation** | Slow | 90% | None | ⚠️ Manual |
| **Hardcoded List** | Instant | 80% | None | 🚨 Critical |

**If using fallback**: The system still works but may not discover new tables automatically. Run `/migrations/backup_system_functions.sql` for optimal performance.

### Expected Tables (27 as of December 2025)
1. `tasks` - Task management
2. `fitness_database` - Fitness tasks
3. `contacts` - Contact management
4. `fitness_completion_history` - Fitness tracking
5. `hyrox_station_records` - HYROX performance
6. `hyrox_workouts` - HYROX training
7. `hyrox_workout_stations` - HYROX station data
8. `northstar` - Goal tracking
9. `motivation_content` - Motivational content
10. `shipments` - Shipment tracking
11. `journal` - Journal entries
12. `notepad` - Note-taking
13. `notepad_revisions` - Note history
14. `user_feature_preferences` - Feature toggles
15. `winter_arc_goals` - Winter Arc goals
16. `contribution_graph` - Activity tracking
17. `hello_world_entries` - Module demo data
18. `module_migrations` - Module version tracking
19. `module_settings` - Module configuration
20. `major_projects` - Major Projects / Delulu Projects management
21. `quotes` - Quotes module data
22. `travel` - South Africa trip tasks and packing list
23. `travel_activities` - South Africa trip activities (stays and events)
24. `ohtani_grid_cells` - Ohtani module grid data
25. `gratitude_entries` - Daily gratitude journal entries
26. `knowledge_articles` - Knowledge Manager articles with tags
27. `knowledge_collections` - Knowledge Manager collections/folders

### Usage Guide

#### First Time Setup
1. Navigate to Supabase SQL Editor
2. Copy and paste contents of `/migrations/backup_system_functions.sql`
3. Execute the SQL (creates 3 functions with proper permissions)
4. Go to `/settings` > Backups tab > Click "Preview Backup"
5. Verify discovery method shows "RPC Function (optimal)"

#### Regular Backups
1. Go to `/settings` > Backups tab
2. Click "Preview Backup" to verify system status
3. Review tables and row counts
4. Click "Export Database" to download SQL file
5. Store backup file securely (includes timestamp in filename)

#### Verification via Debug Page
1. Go to `/debug` page
2. Click "Run Backup Tests" in 4th card
3. Review all 6 test results
4. Green = working perfectly
5. Yellow = working but could be optimized
6. Red = needs attention

#### Restoring from Backup
1. Go to `/settings` > Backups tab
2. Select SQL file to import
3. System validates file structure
4. Confirm import (warns about data replacement)
5. Import executes in transaction (rolls back on error)
6. Page refreshes after successful import

### Validation Checklist

Before trusting your backup system, verify:
- ✅ All 19 tables discovered (check `/debug` or Preview)
- ✅ Discovery method is "RPC Function" (optimal) or "Raw SQL" (acceptable)
- ✅ No critical warnings displayed
- ✅ Export includes correct row counts
- ✅ Can successfully import exported backup

### Warnings and Error Messages

**Friendly Warnings** (system still works):
- "Using Method 2 (raw SQL) - consider running migration"
- "Using Method 3 (fallback) - RPC functions not available"
- "Found new tables not in known list" - Update expected table list

**Critical Warnings** (needs attention):
- "CRITICAL: All discovery methods failed - using hardcoded list"
- "Missing expected tables" - Some tables not accessible
- "Only found X/19 tables" - Database access issues

### Files Modified/Created (October 2025)

**New Files**:
- `/migrations/backup_system_functions.sql` - Database functions (run manually)
- `/app/api/backup/verify/route.ts` - Verification endpoint

**Modified Files**:
- `/app/api/backup/export/route.ts` - 3-tier discovery, v2.1 metadata
- `/app/settings/page.tsx` - Preview button, warnings, discovery method display
- `/app/debug/page.tsx` - Added 4th card for backup system tests

## Troubleshooting

### Common Issues
1. **"Module not found" errors**: Run `npm install`
2. **Authentication failures**: Check `BETTER_AUTH_SECRET` and `DATABASE_URL` env vars
3. **Database errors**: Verify `SUPABASE_SERVICE_KEY` and database connectivity
4. **Build errors**: Clear `.next` folder and rebuild

### Debug Tools
- Browser DevTools for network requests and cookies
- Check `public."user"` and `public."session"` tables for auth state
- `/debug` page for system diagnostics
- Next.js error overlay in development

## Performance Optimizations

- Static generation where possible
- Dynamic imports for heavy components
- Image optimization with Next.js Image
- Prefetching enabled for navigation
- Middleware for auth checks and security headers

## Project Specific Claude Code Rules

- Never start a server. I will start them, usually on port 3000.
- Never edit a database directly, instead provide .sql files which I can manually run.
- Please always ensure eny new page or API or feature alwats follows all the patterns from the existing codebase including authentication, RLS, and theming support!

---