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
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

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