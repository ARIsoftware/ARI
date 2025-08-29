# ARI Application - Claude Memory & Setup Documentation

## Overview
ARI is a Next.js 15 (React 19) application using Supabase for both authentication and database operations with Row Level Security (RLS) enabled.

## Authentication & Database Architecture

### Supabase Auth + RLS Integration
The app uses native Supabase authentication:
- **Supabase Auth** for user authentication and session management
- **Supabase Database** for all data operations with PostgreSQL
- **Row Level Security (RLS)** for database-level user isolation
- **SSR Support** via @supabase/ssr package for server-side rendering

### Key Components:

#### 1. Authentication Flow
- Users sign in via Supabase Auth with email/password
- Session tokens are managed by Supabase automatically
- RLS policies use `auth.uid()` to filter user data
- Middleware handles protected routes

#### 2. Supabase Client Setup (`lib/supabase-auth.ts`)
```typescript
// Browser client for client components
export function createSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
```

#### 3. Context Provider (`components/providers.tsx`)
- Provides Supabase client and session to all components
- Handles auth state changes automatically
- Exposes `useSupabase()` hook for easy access

### Database Schema
Main tables:
- `ari-database` - Main tasks table with RLS policies
- `ari-fitness-database` - Fitness tasks with RLS
- User isolation enforced at database level via RLS policies using `auth.uid()`

### Key Files:
- `/lib/supabase-auth.ts` - Supabase client setup with SSR support
- `/components/providers.tsx` - App-level providers with auth context
- `/middleware.ts` - Route protection and auth checks
- `/components/auth/auth-form.tsx` - Sign in/sign up forms

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
- Custom auth UI components
- Next.js 15 with React 19

## Development Notes
- RLS policies use `auth.uid()` to filter by authenticated user
- Middleware handles session refresh and route protection
- Use `useSupabase()` hook in client components for auth access
- Server components can use server-side Supabase client
- Component state management uses global window object for cross-component communication

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Optional: `SUPABASE_SECRET_KEY` (server-side only, bypasses RLS)

## Recent Changes
- Migrated from Clerk to native Supabase Auth
- Updated all components to use Supabase context provider
- Removed deprecated @supabase/auth-helpers-react package
- Implemented custom user profile dropdown with Supabase auth

This setup ensures secure, user-isolated data access with native Supabase authentication and RLS policies.