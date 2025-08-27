# ARI Application - Claude Memory & Setup Documentation

## Overview
ARI is a Next.js 15 (React 19) application using Clerk for authentication and Supabase for database operations with Row Level Security (RLS) enabled.

## Authentication & Database Architecture

### Clerk + Supabase + JWT Integration
The app uses a sophisticated setup combining:
- **Clerk** for user authentication and session management
- **Supabase** for database operations with PostgreSQL
- **JWT Tokens** for secure communication between Clerk and Supabase
- **Row Level Security (RLS)** for database-level user isolation

### Key Components:

#### 1. JWT Token Flow
- Clerk generates JWT tokens with a custom "supabase" template
- These tokens contain user claims (sub, email, iss, exp)
- Supabase uses these tokens to enforce RLS policies
- Token obtained via: `getToken({ template: "supabase" })`

#### 2. Supabase Client Setup (`lib/supabase-with-clerk.ts`)
```typescript
// Dynamic Supabase client that updates with Clerk auth
export function useSupabaseWithClerk() {
  const { getToken } = useAuth()
  
  // Gets Clerk JWT token and creates authenticated Supabase client
  const token = await getToken({ template: "supabase" })
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
}
```

#### 3. RLS Debug Component (`components/rls-debug.tsx`)
- Provides real-time debugging of JWT tokens in development
- Logs user info, token claims, and authentication status
- Helps troubleshoot RLS policy issues

### Database Schema
Main tables:
- `ari-database` - Main tasks table with RLS policies
- `ari-fitness-database` - Fitness tasks with RLS
- User isolation enforced at database level via RLS policies

### Key Files:
- `/lib/supabase.ts` - Basic Supabase client (legacy, now uses anon key only)
- `/lib/supabase-with-clerk.ts` - Authenticated Supabase with Clerk JWT
- `/components/rls-debug.tsx` - JWT debugging component
- `/components/providers.tsx` - App-level providers including Clerk and RLS debug

## Application Features

### Focus Timer System
- Global state management using window object
- Timer display integrated with TaskAnnouncement component
- Uses existing `.topbar` infrastructure (90vh when active, 45px normally)
- Completion message shows "FOCUS TIME COMPLETE 💪" for 5 seconds
- Time options: 5, 10, 20, 30 minutes

### Exercise Reminder System
- Triggers at :50 and :51 minutes past each hour
- Checks every 90 seconds for performance
- Centered popup with dark blue background (#091a32)
- Uses Dialog component, dismissible only via "DONE" button
- Integrated via ExerciseReminder component in providers

### UI Framework
- Tailwind CSS for styling
- Shadcn/ui components
- DM Sans font family
- Clerk components for auth UI
- Next.js 15 with React 19

## Development Notes
- RLS policies must match JWT token claims
- Always test with RLSDebug component enabled
- Use `getAuthenticatedSupabase()` for operations requiring user context
- Secret keys deprecated for browser use - all operations through authenticated clients
- Component state management uses global window object for cross-component communication

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- Optional: `SUPABASE_SECRET_KEY` (server-side only)

## Recent Commits
- "Working RLS Enabled" - Final RLS implementation
- "Supabase RLS Fixes" - RLS policy corrections
- "RLS compatible Backups" - Backup system with RLS

This setup ensures secure, user-isolated data access while maintaining real-time capabilities and proper authentication flow.