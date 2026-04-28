# ARI Application - Claude Memory & Setup Documentation

This documentation reflects the current state of the ARI application, including Better Auth authentication and the module system.

## Overview
ARI is a Next.js 16 (React 19) application using Better Auth for authentication and Supabase PostgreSQL for database operations.

## Tech Stack
- **Framework**: Next.js 16 with React 19
- **Authentication**: Better Auth (email/password with Argon2 hashing)
- **Database**: Supabase PostgreSQL (with application-level security)
- **ORM**: Drizzle ORM (with RLS support via `withRLS()`)
- **Data Fetching**: TanStack Query (React Query) for client-side data fetching with optimistic updates
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
  rateLimit: {
    enabled: true, window: 60, max: 30,
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 300, max: 3 },
      "/get-session": { window: 60, max: 500 },
    }
  },
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
  // Returns: { user, session, withRLS }
}
```

##### `/components/providers.tsx`
- Global context provider using `authClient.useSession()`
- Exposes `useAuth()` hook for accessing auth context (user, session, isLoading)
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

All table definitions are centralized in `/lib/db/schema/schema.ts` using Drizzle ORM. Key tables include:

- **`tasks`**: Task management with priority scoring
- **`fitness_database`**: Daily fitness tracking
- **`contacts`**: Contact management
- **`northstar`**: Goal tracking
- **`journal`**: Journal entries
- **`hyrox_workouts`**, **`hyrox_workout_stations`**, **`hyrox_station_records`**: HYROX training
- **`shipments`**: Shipment tracking
- **`quotes`**: Quotes collection
- **`major_projects`**: Project tracking
- **`motivation_content`**: Motivation board content
- **`documents`**, **`document_folders`**, **`document_tags`**, **`document_tag_assignments`**: Document management
- **`travel`**, **`travel_activities`**, **`travel_flights`**: Travel planning
- **`gratitude_entries`**: Gratitude journal
- **`contribution_graph`**: Activity contribution tracking
- **`mail_stream_events`**, **`mail_stream_settings`**: Mail stream module
- **`memento_settings`**, **`memento_milestones`**, **`memento_eras`**: Life timeline
- **`ari_launch_entries`**: ARI Launch module
- **`module_settings`**: Per-user module preferences (JSONB)
- **`module_migrations`**: Module migration tracking
- **`user_preferences`**: User settings
- **`backup_metadata`**: Backup system metadata
- **`user`**, **`session`**, **`account`**, **`verification`**: Better Auth system tables

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

#### ARI File Storage System
- Central file storage with authenticated API endpoints
- Upload: `POST /api/storage/upload` (FormData with `bucket` and `file`)
- Serve: `GET /api/storage/serve/{bucket}/{filename}` (streams binary, auth required)
- List: `GET /api/storage/list?bucket={name}`
- Delete: `DELETE /api/storage/delete` (JSON body with `bucket` and `filename`)
- Files stored at `data/storage/{user_id}/{bucket}/` on local filesystem
- All endpoints require authentication — no public file URLs
- Storage provider abstraction in `/lib/storage/` (currently local filesystem, extensible)
- Configure in Settings > Integrations > File Storage

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
- Sidebar module groups display blue outlines with glow effect
- Main content fades to 10% opacity
- Top bar shows instruction text with X button to exit
- Drag entire groups to reorder them (modules within a group stay together)
- Click X to save order and exit
- Order is persisted per-user in `module_settings.settings.menuPriority`
- Uses Swapy library for drag-and-drop functionality

#### Sidebar View Settings
- Go to Settings > Themes > Sidebar section
- **Default**: Shows group labels (Overview, Dashboard, Todo, etc.)
- **Compressed**: Hides group labels for a more compact sidebar

## File Structure

### Key Directories
```
/app                    # Next.js app router pages
  /sign-in             # Authentication
  /profile             # User profile
  /settings            # App settings
  /api                 # API routes
    /auth/[...all]     # Better Auth handler
    /modules/[module]  # Module API router
    /backup            # Backup export/import/verify

/components            # React components
  /ui                  # Shadcn/ui components
  /auth                # Authentication components
  /providers.tsx       # Global providers (useAuth hook)
  /app-sidebar.tsx     # Main navigation
  /query-provider.tsx  # TanStack Query provider

/lib                   # Utilities and helpers
  /auth.ts             # Better Auth server configuration
  /auth-client.ts      # Better Auth client for React
  /auth-helpers.ts     # getAuthenticatedUser() helper
  /db/schema/          # Drizzle ORM schema (auto-generated barrel + core)
    core-schema.ts     # Hand-maintained: auth, system, shared tables
    core-relations.ts  # Hand-maintained: auth relations
    schema.ts          # AUTO-GENERATED barrel re-exporting core + module schemas
    relations.ts       # AUTO-GENERATED barrel re-exporting core + module relations
    index.ts           # Re-exports schema.ts + relations.ts
  /api-helpers.ts      # API validation helpers
  /hooks/              # TanStack Query hooks (use-tasks.ts, use-contacts.ts, etc.)
  /modules/            # Module system infrastructure
  /generated/          # Auto-generated module registry

/middleware.ts          # Route protection & security headers

/modules-core           # Core modules (self-contained features)
  /[module-id]/         # Each module folder
    module.json         # Module manifest (see /docs/MODULES.md)
    /app/page.tsx       # Module main page
    /api/               # Module API routes
    /components/        # Module components
    /hooks/             # Module-specific TanStack Query hooks
    /database/          # Database files
      schema.sql        # Idempotent SQL — auto-run on every module enable
      schema.ts         # Drizzle table definitions (auto-included in barrel)
      relations.ts      # Drizzle relations (optional, auto-included)
      uninstall.sql     # Manual-only teardown script — never auto-runs

/modules-custom         # User-created modules (same structure as modules-core)
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

### Local Development
`.env.supabase.local` is auto-generated by the installer and `./ari start`. It contains only the local Supabase connection vars and overrides `.env.local` via `next.config.mjs` (dotenv with `override: true`).

```env
# Auto-generated by ./ari start — only Supabase connection vars
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

All other env vars (`BETTER_AUTH_SECRET`, `ARI_FIRST_RUN_ADMIN_*`, `OPENAI_API_KEY`, etc.) are configured in `.env.local` via the `/welcome` setup flow or manually.

### Production / Cloud Supabase
For production or Supabase Cloud, configure `.env.local`:
```env
# Better Auth
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=https://your-domain.com
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
# Start ARI (Supabase + dev server)
./ari start

# Stop Supabase containers
./ari stop

# Check Supabase status
./ari status
```

`./ari start` checks Docker, starts Supabase (idempotent), regenerates `.env.supabase.local`, and runs `pnpm dev`. On Windows, use `.\ari.cmd start`.

For manual control without the CLI:
```bash
pnpm install          # Install dependencies
supabase start        # Start local Supabase (requires Docker)
pnpm dev              # Run development server
pnpm build            # Build for production
pnpm start            # Run production build
```

### Authentication Testing
1. Sign in at `/sign-in` with existing credentials
2. For local dev, create your account via the `/welcome` setup flow on first run
3. Better Auth stores users in `public."user"` and sessions in `public."session"` tables
4. Test protected routes redirect to `/sign-in` when not authenticated
5. Monitor auth state via `authClient.useSession()` in browser DevTools

### Database Management
- Local: Supabase Studio at http://127.0.0.1:54323
- Cloud: Use Supabase dashboard for schema changes
- Test RLS policies before deploying
- Use migrations for production changes

## Security Considerations

### Authentication
- All routes protected by middleware using Better Auth sessions
- Sessions stored in HTTP-only cookies (not localStorage)
- Passwords hashed with Argon2id (OWASP recommended)
- Rate limiting on auth endpoints (5 sign-in attempts/minute, 3 sign-up attempts/5 minutes)
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

## Backup System

Comprehensive database backup and restore system with dynamic table discovery. Managed via `/settings` > Backups tab or the backup-manager module.

- **Export**: `/app/api/backup/export/route.ts` — auto-discovers all tables via `information_schema`, exports as executable SQL with checksums
- **Import**: `/app/api/backup/import/route.ts` — restores from SQL backup with transaction rollback on error
- **Verify**: `/app/api/backup/verify/route.ts` — preview what will be backed up before exporting
- **Setup**: Backup RPC functions (`get_all_user_tables`, `get_all_table_columns`, `get_table_row_counts`, `exec_sql`) are installed automatically by `lib/db/setup.sql` during initial setup. Re-run that file if discovery ever fails on an existing install.
- **Debug**: `/debug` page includes backup system diagnostic tests

## Troubleshooting

### Common Issues
1. **"Module not found" errors**: Run `pnpm install`
2. **Authentication failures**: Check `BETTER_AUTH_SECRET` and `DATABASE_URL` env vars
3. **Database errors**: Verify Supabase is running (`./ari status`) and check connectivity
4. **Build errors**: Clear `.next` folder and rebuild
5. **Docker not running**: `./ari start` requires Docker for local Supabase

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
- Please always ensure any new page or API or feature always follows all the patterns from the existing codebase including authentication, RLS, and theming support!

## Multi-Agent Support (Claude Code + OpenAI Codex)

This repo supports both Claude Code and OpenAI Codex CLI. Because each tool looks for its config in different paths and Windows doesn't reliably support symlinks, **shared content is duplicated as real files in each tool-specific location**. When updating any of these, update **all copies**.

| Concept | Claude path | Codex path | Shared source (informational) |
|---|---|---|---|
| Project instructions | `CLAUDE.md` | `AGENTS.md` | — (edit both) |
| Slash commands / prompts | `.claude/commands/*.md` | Repo copy only: `.codex/prompts/*.md` | `.agents/commands/*.md` |
| Skills | `.claude/skills/*` | *(no equivalent)* | — (Claude-only) |

- **When adding or editing a shared command prompt:** update the file in `.agents/commands/`, `.claude/commands/`, AND the repo copy in `.codex/prompts/`. They must stay in sync manually.
- **Important for Codex:** repo-local `.codex/prompts/` files are only portable reference copies. Codex custom prompts are loaded from `~/.codex/prompts/` and invoked as `/prompts:<name>`. Custom prompts are deprecated upstream in favor of skills.
- **When editing project instructions:** update both `CLAUDE.md` and `AGENTS.md`.
- Claude-only (no Codex equivalent): `.claude/agents/` subagents, `.claude/settings.local.json` permissions, hooks. Don't try to port these.
- MCP servers: Claude reads project-level `.mcp.json`; Codex only reads global `~/.codex/config.toml`. If MCP servers are added, configure both separately.

---
