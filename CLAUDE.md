# ARI Application - Claude Memory & Setup Documentation

This documentation reflects the current state of the ARI application as of September 2025, including the latest priority radar feature and authentication architecture.

## Overview
ARI is a Next.js 15 (React 19) application using Supabase for authentication, database operations, and Row Level Security (RLS).

## Tech Stack
- **Framework**: Next.js 15.2.4 with React 19
- **Authentication**: Supabase Auth (native email/password)
- **Database**: Supabase (PostgreSQL with RLS)
- **Styling**: Tailwind CSS + Shadcn/ui components
- **Font**: DM Sans
- **Deployment**: Vercel-ready

## Authentication Architecture

### Supabase Auth Integration
The app uses native Supabase authentication with the following components:

#### 1. Authentication Flow
- **Sign In/Up**: Custom forms at `/sign-in` using Supabase Auth
- **Session Management**: Handled automatically by Supabase
- **Protected Routes**: Middleware validates sessions before allowing access
- **RLS Policies**: Database uses `auth.uid()` to filter user-specific data

#### 2. Key Authentication Files

##### `/lib/supabase-auth.ts`
```typescript
// Browser client for client components
export function createSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
```

##### `/components/providers.tsx`
- Global context provider for Supabase client and session
- Exposes `useSupabase()` hook for all components
- Manages auth state changes and real-time subscriptions

##### `/middleware.ts`
- Protects routes requiring authentication
- Refreshes sessions automatically
- Redirects unauthenticated users to `/sign-in`
- Protected routes: `/dashboard`, `/tasks`, `/contacts`, `/fitness`, etc.

##### `/components/auth/auth-form.tsx`
- Reusable authentication form component
- Handles both sign-in and sign-up flows
- Email/password authentication only (sign-ups can be disabled)

## Database Schema

### Main Tables
- **`tasks`**: Main tasks table with user isolation via RLS and priority scoring
- **`ari-fitness-database`**: Fitness tracking with RLS
- **`northstar_entries`**: Goal tracking entries
- **`contacts`**: User contacts management
- **`hyrox_workouts`**: HYROX training data
- **`hyrox_workout_stations`**: HYROX station performance

### RLS Implementation
All tables use Row Level Security with policies based on `auth.uid()`:
- Each user can only access their own data
- Policies enforce user isolation at the database level
- No data leakage between users

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
  /supabase-auth.ts  # Supabase client setup
  /supabase.ts       # Legacy client (anon key only)
  /tasks.ts          # Task operations
  /contacts.ts       # Contact operations
  /fitness-stats.ts  # Fitness analytics
  /priority-utils.ts # Priority scoring calculations
  /auth-helpers.ts   # Authentication utilities
  /api-helpers.ts    # API validation helpers

/middleware.ts        # Route protection
```

## Environment Variables

### Required
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key  # Use new publishable key (sb_publishable_...) format
```

**Note**: As of November 2025, Supabase is deprecating legacy anon keys (JWT format starting with `eyJhbGci...`). Use the new publishable key format (`sb_publishable_...`) instead. Both key formats work with the same environment variable name. See `/docs/SUPABASE_KEY_MIGRATION.md` for migration details.

### Optional
```env
SUPABASE_SECRET_KEY=your_service_role_key  # Server-side only, bypasses RLS
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
1. Create test account at `/sign-in`
2. Use Supabase dashboard to manage users
3. Test RLS policies with different users
4. Monitor auth state in browser DevTools

### JWT Signing Key Rotation
The application **does not require code changes** for JWT signing key rotation:
- All JWT verification is handled by Supabase client libraries (`@supabase/ssr`, `@supabase/supabase-js`)
- JWKS is automatically fetched from `/.well-known/jwks.json` endpoint
- No custom JWT verification code exists in the codebase
- Rotation can be performed safely in Supabase dashboard without downtime
- See `/docs/SUPABASE_KEY_MIGRATION.md` for detailed rotation guidance

### Database Management
- Use Supabase dashboard for schema changes
- Test RLS policies before deploying
- Use migrations for production changes
- Monitor database performance in Supabase dashboard

## Security Considerations

### Authentication
- All routes protected by middleware
- Sessions expire and refresh automatically
- No sensitive data in localStorage
- HTTPS required in production

### Database
- RLS policies on all tables
- User isolation at database level
- No direct database access from client
- Service role key never exposed to client

### API Security
- All API routes require authentication via Bearer tokens
- Comprehensive Zod validation on all endpoints
- Rate limiting via Supabase
- Input validation on all endpoints
- CORS configured for production domain

## Deployment

### Vercel Deployment
1. Connect GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy with automatic builds on push
4. Monitor performance and errors

### Post-Deployment
- Verify authentication flow
- Test all protected routes
- Check RLS policies
- Monitor error logs

## Recent Updates

### Supabase API Key Migration (November 2025)
Migrated from legacy anon keys to new publishable keys:
- Updated environment variable to use new `sb_publishable_...` format
- No code changes required (full backward compatibility with existing Supabase client libraries)
- Improved security with independent key rotation
- Aligned with Supabase's timeline (legacy keys removed October 1, 2025)
- See `/docs/SUPABASE_KEY_MIGRATION.md` for complete migration guide

### Authentication Migration (August 2025)
Successfully migrated from Clerk to Supabase Auth:
- Removed all Clerk dependencies
- Implemented custom authentication UI
- Updated all components to use Supabase context
- Maintained full functionality with improved performance
- Simplified authentication architecture

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

### Expected Tables (23 as of November 2025)
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
22. `cape_town` - Cape Town trip tasks and packing list
23. `ohtani_grid_cells` - Ohtani module grid data

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
2. **Authentication failures**: Check Supabase project status
3. **RLS errors**: Verify user is authenticated and policies are correct
4. **Build errors**: Clear `.next` folder and rebuild

### Debug Tools
- Browser DevTools for network requests
- Supabase dashboard for auth logs
- RLS Debug component (development only)
- Next.js error overlay in development

## Performance Optimizations

- Static generation where possible
- Dynamic imports for heavy components
- Image optimization with Next.js Image
- Prefetching enabled for navigation
- Edge middleware for auth checks


## Project Specific Claude Code Rules

- Never start a server. I will start them, usually on port 3000.
- Never edit a database directly, instead provide .sql files which I can manually run.
- Please always ensure eny new page or API or feature alwats follows all the patterns from the existing codebase including authentication, RLS, and theming support!

---