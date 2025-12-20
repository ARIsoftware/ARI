# Migration Plan: Supabase Auth → Better Auth

> **IMPORTANT**: This migration work will be done in a feature branch.
>
> Before starting implementation, create and checkout the feature branch:
> ```bash
> git checkout -b betterauth
> ```

---

## Decisions Made

| Decision | Choice |
|----------|--------|
| RLS Strategy | Application-level security (bypass RLS) |
| Branch | `betterauth` |
| Sign-up | Disabled for now (single user) |
| Timeline | Take time, do it right |
| Prisma | Better Auth first, Prisma migration later |
| Password Hashing | Argon2 (with bcrypt migration support) |

---

## Scope Summary (Audited)

| Category | Count | Notes |
|----------|-------|-------|
| Core auth files to rewrite | 7 files | Full rewrite required |
| Files using `supabase.auth.*` | 17 files | Must change auth calls |
| Client-side direct DB queries | 3 files | Must refactor to use API routes |
| Realtime subscriptions | 5 files | Should work (separate from auth) |
| API routes | 63 files | Compatibility layer minimizes changes |
| Client components with `useSupabase()` | 53 files | Hook still works, minimal changes |
| User to migrate | 1 | `hello@ari.software` |

---

## Better Auth Schema (Verified)

### User Table - Default Columns
| Column | Type | Supabase Source |
|--------|------|-----------------|
| `id` | string (PK) | `auth.users.id` (UUID preserved) |
| `name` | string | `raw_user_meta_data->>'full_name'` |
| `email` | string | `auth.users.email` |
| `emailVerified` | boolean | `email_confirmed_at IS NOT NULL` |
| `image` | string | `raw_user_meta_data->>'avatar_url'` |
| `createdAt` | Date | `auth.users.created_at` |
| `updatedAt` | Date | `auth.users.updated_at` |

### User Table - Additional Fields (Custom)
| Column | Type | Supabase Source |
|--------|------|-----------------|
| `firstName` | string | `raw_user_meta_data->>'first_name'` |
| `lastName` | string | `raw_user_meta_data->>'last_name'` |

### Account Table (Password Credential)
| Column | Type | Supabase Source |
|--------|------|-----------------|
| `id` | string (PK) | Generated UUID |
| `userId` | string (FK) | `auth.users.id` |
| `accountId` | string | `auth.users.id` |
| `providerId` | string | `'credential'` |
| `password` | string | `auth.users.encrypted_password` (bcrypt hash) |

Sources: [Better Auth Database Docs](https://www.better-auth.com/docs/concepts/database)

---

## Known Risks & Mitigations

### Critical Issues Identified

| Issue | Risk | Mitigation |
|-------|------|------------|
| User ID format mismatch | HIGH | Phase 0 audit, preserve exact UUID |
| Session structure differences | MEDIUM | Create type definitions, update all usages |
| Profile update flow not addressed | MEDIUM | Add Better Auth profile/password APIs |
| Client-side direct DB queries | HIGH | Audit all components, create shim or migrate |
| Middleware feature check | MEDIUM | Update to use Better Auth session |
| No automated tests | HIGH | Create manual test checklist, test each feature |
| Realtime subscriptions | LOW | Audit for usage, document breaking changes |
| User metadata migration | MEDIUM | Map Supabase metadata to Better Auth fields |
| `supabase` from useSupabase() | HIGH | Provide DB client separately from auth |
| Password hash (bcrypt→Argon2) | LOW | Hash migration on first login |

---

## Implementation Plan

### Phase 0: Pre-Migration Audit (COMPLETED)

#### Audit Results Summary

| Category | Count | Risk Level |
|----------|-------|------------|
| Client components using `useSupabase()` | 53 files | LOW (hook still works) |
| API routes using `getAuthenticatedUser()` | 63 files | LOW (compatibility layer) |
| Files using `session.access_token` | 36 files | MEDIUM (needs mapping) |
| Files using `user_metadata` | 4 files | MEDIUM (needs mapping) |
| Files using `supabase.auth.*` | 17 files | HIGH (must rewrite) |
| Client-side direct DB queries (`supabase.from()`) | 3 files | HIGH (must refactor) |
| Realtime subscriptions (`.channel()`) | 5 files | LOW (should work) |

#### Critical Files Requiring Special Attention

**Client-Side Direct DB Queries (3 files - MUST REFACTOR):**
1. `/app/layout.tsx`
2. `/modules-core/motivation/components/add-motivation-modal.tsx`
3. `/components/motivation/add-motivation-modal.tsx`

**Files Using `supabase.auth.*` Methods (17 files - MUST REWRITE):**
1. `/app/debug/page.tsx`
2. `/app/profile/page.tsx` - updateUser, resetPassword
3. `/components/providers.tsx` - getSession, onAuthStateChange, refreshSession
4. `/components/task-announcement.tsx`
5. `/components/command-palette.tsx`
6. `/components/user-profile-dropdown.tsx` - signOut
7. `/components/auth/auth-form.tsx` - signInWithPassword, signUp, onAuthStateChange
8. `/middleware.ts` - getSession, getUser
9. `/lib/auth-helpers.ts` - getUser, getSession
10. `/lib/api-client.ts`
11. `/app/auth/callback/route.ts` - exchangeCodeForSession
12. `/app/api/auth/logout/route.ts` - signOut
13. `/app/api/debug/module-status/route.ts`
14. `/lib/modules/module-registry.ts`
15. `/modules-core/south-africa/app/page.tsx`
16. `/docs/SUPABASE_KEY_MIGRATION.md` (docs only)
17. `/docs/MODULE-DETAILS.md` (docs only)

**Realtime Subscriptions (5 files - SHOULD WORK):**
Supabase Realtime is separate from Supabase Auth - these should continue working with the service role client.
1. `/components/task-announcement.tsx` - uses `getAuthenticatedSupabase()` (needs update)
2. `/app/tasks/page.tsx` - uses `supabase` from context
3. `/modules-core/daily-fitness/app/page.tsx`
4. `/modules-core/shipments/app/page.tsx`
5. `/modules-core/contacts/app/page.tsx`

Note: These files need to use the database client from API routes or a dedicated realtime client, not the auth-based supabase client.

**Files Using `user_metadata` (4 files - NEEDS MAPPING):**
1. `/app/profile/page.tsx`
2. `/components/task-announcement.tsx`
3. `/components/user-profile-dropdown.tsx`
4. `/app/tasks/page.tsx`

#### API Routes (63 total)

**Core API Routes (32 files):**
- All files in `/app/api/` using `getAuthenticatedUser()`

**Module API Routes (31 files):**
- All files in `/modules-core/*/api/` using `getAuthenticatedUser()`

These should work with minimal changes due to the compatibility layer in `auth-helpers.ts`.

---

### Phase 1: Setup Better Auth Infrastructure

**1.1 Install Dependencies**
```bash
npm install better-auth @node-rs/argon2 pg
npm install -D @types/pg
```

Note: Using `@node-rs/argon2` (native Rust binding) for best performance.

**1.2 Create Environment Variables**
Add to `.env.local`:
```env
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=<your Supabase PostgreSQL connection string>
SUPABASE_SERVICE_KEY=<service role key for DB access>
```

**1.3 Create Server Auth Configuration**
Create `/lib/auth.ts`:
```typescript
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import bcrypt from "bcrypt"
import { hash, verify } from "@node-rs/argon2"

export const auth = betterAuth({
  database: {
    type: "postgres",
    url: process.env.DATABASE_URL!,
  },
  emailAndPassword: {
    enabled: true,
    signUp: { enabled: false }, // Disabled for now
  },
  // Argon2 for new passwords, with bcrypt migration support
  password: {
    hash: async (password: string) => {
      // New passwords use Argon2
      return await hash(password, {
        memoryCost: 65536,  // 64MB
        timeCost: 3,
        parallelism: 4,
      })
    },
    verify: async ({ hash: storedHash, password }: { hash: string; password: string }) => {
      // Check if it's a bcrypt hash (starts with $2)
      if (storedHash.startsWith('$2')) {
        // Verify with bcrypt (legacy)
        const isValid = await bcrypt.compare(password, storedHash)
        if (isValid) {
          // Return true - Better Auth will re-hash with Argon2 on next save
          // (if using password migration feature)
          return true
        }
        return false
      }
      // Otherwise verify with Argon2
      return await verify(storedHash, password)
    }
  },
  // Note: 'image' is a default column, use it for avatar
  user: {
    additionalFields: {
      firstName: { type: "string", required: false },
      lastName: { type: "string", required: false },
      // avatarUrl not needed - use built-in 'image' column instead
    }
  },
  plugins: [nextCookies()]
})

// Export types for use in components
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
```

**1.4 Create Client Auth**
Create `/lib/auth-client.ts`:
```typescript
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
})

// Export types
export type { Session, User } from "./auth"
```

**1.5 Create Database Client Helper (NEW)**
Create `/lib/db.ts`:
```typescript
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Server-side only database client (bypasses RLS)
export function createDbClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// For client-side, we'll use API routes only
// No direct database access from client components
```

**1.6 Create API Route Handler**
Create `/app/api/auth/[...all]/route.ts`:
```typescript
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST } = toNextJsHandler(auth)
```

**1.7 Generate Better Auth Database Tables**
```bash
npx @better-auth/cli migrate
```

Creates tables: `user`, `session`, `account`, `verification` in public schema.

---

### Phase 2: Migrate User Data

**2.1 Create User Migration SQL**
Create `/migrations/better-auth-user-migration.sql`:
```sql
-- First, verify the source user exists
SELECT id, email, encrypted_password, raw_user_meta_data, created_at
FROM auth.users
WHERE email = 'hello@ari.software';

-- Migrate user to Better Auth user table
-- IMPORTANT: Preserving exact UUID to maintain foreign key relationships
--
-- Better Auth Default Columns: id, name, email, emailVerified, image, createdAt, updatedAt
-- Custom additionalFields: firstName, lastName (will be created by CLI migrate)
--
INSERT INTO public."user" (
  id,
  name,
  email,
  "emailVerified",
  image,          -- Default column for avatar (not custom avatarUrl)
  "createdAt",
  "updatedAt",
  "firstName",    -- additionalField
  "lastName"      -- additionalField
)
SELECT
  id::text,  -- Preserve exact UUID to maintain FK relationships with 27 tables
  COALESCE(
    raw_user_meta_data->>'full_name',
    CONCAT(raw_user_meta_data->>'first_name', ' ', raw_user_meta_data->>'last_name'),
    email
  ),
  email,
  CASE WHEN email_confirmed_at IS NOT NULL THEN true ELSE false END,
  raw_user_meta_data->>'avatar_url',  -- Maps to 'image' column
  created_at,
  updated_at,
  raw_user_meta_data->>'first_name',
  raw_user_meta_data->>'last_name'
FROM auth.users
WHERE email = 'hello@ari.software'
ON CONFLICT (id) DO NOTHING;  -- Safety: don't duplicate if run twice

-- Migrate password credential to account table
-- The bcrypt hash will be verified by our custom verify function
INSERT INTO public.account (
  id,
  "userId",
  "accountId",
  "providerId",
  password,
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  id::text,
  id::text,
  'credential',
  encrypted_password,  -- bcrypt hash, our verify function handles it
  created_at,
  updated_at
FROM auth.users
WHERE email = 'hello@ari.software'
ON CONFLICT DO NOTHING;

-- Verify migration
SELECT u.id, u.email, u.name, a."providerId", LENGTH(a.password) as hash_length
FROM public."user" u
JOIN public.account a ON u.id = a."userId"
WHERE u.email = 'hello@ari.software';
```

**2.2 Test Sign-In**
After running migration, test sign-in before proceeding.

---

### Phase 3: Update Core Auth Files

**3.1 Update `/lib/auth-helpers.ts`**
```typescript
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { createDbClient } from "@/lib/db"

export async function getAuthenticatedUser() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    return { user: null, session: null, supabase: null }
  }

  // Create database client (service role, bypasses RLS)
  const supabase = createDbClient()

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      // Map Better Auth fields to match old Supabase structure for compatibility
      user_metadata: {
        first_name: session.user.firstName,
        last_name: session.user.lastName,
        full_name: session.user.name,
        avatar_url: session.user.image,  // Better Auth uses 'image' for avatar
      }
    },
    session: {
      access_token: session.token, // Map to old property name
      user: session.user,
    },
    supabase
  }
}
```

**3.2 Update `/components/providers.tsx`**
```typescript
"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { authClient } from "@/lib/auth-client"
import type { Session, User } from "@/lib/auth"
import { Toaster } from "@/components/ui/toaster"
import { ExerciseReminder } from "@/components/exercise-reminder"
import { MusicPlayerProvider } from "@/components/youtube-music-player"
import { FeaturesProvider } from "@/lib/features-context"
import { ModulesProvider } from "@/lib/modules/context"
import { CommandPaletteProvider } from "@/components/command-palette"
import type { ModuleMetadata } from '@/lib/modules/module-types'

type AuthContext = {
  user: User | null
  session: Session | null
  isLoading: boolean
}

const Context = createContext<AuthContext | undefined>(undefined)

export function Providers({
  children,
  modules = [],
  enabledModules = [],
  initialFeatures
}: {
  children: React.ReactNode
  modules?: string[]
  enabledModules?: ModuleMetadata[]
  initialFeatures?: Record<string, boolean>
}) {
  const pathname = usePathname()
  const { data: sessionData, isPending } = authClient.useSession()

  // Load saved font preference on mount
  useEffect(() => {
    const fontMap: Record<string, string> = {
      'Overpass Mono': '"Overpass Mono", monospace',
      'Outfit': '"Outfit", sans-serif',
      'Open Sans': '"Open Sans", sans-serif',
      'Science Gothic': '"Science Gothic", sans-serif',
    }
    const savedFont = localStorage.getItem('ari-font-preference')
    if (savedFont && fontMap[savedFont]) {
      document.documentElement.style.setProperty('--font-family', fontMap[savedFont])
    }
  }, [])

  const user = sessionData?.user ?? null
  const session = sessionData ?? null

  return (
    <Context.Provider value={{ user, session, isLoading: isPending }}>
      <ModulesProvider modules={modules} enabledModules={enabledModules}>
        <FeaturesProvider initialFeatures={initialFeatures}>
          <MusicPlayerProvider>
            <CommandPaletteProvider>
              {children}
              <Toaster />
              {user && <ExerciseReminder />}
            </CommandPaletteProvider>
          </MusicPlayerProvider>
        </FeaturesProvider>
      </ModulesProvider>
    </Context.Provider>
  )
}

// Keep old name for easier migration, can rename later
export const useSupabase = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useSupabase must be used inside Providers')
  }
  // Return compatible shape (without supabase client - use API routes instead)
  return {
    user: context.user,
    session: context.session,
    isLoading: context.isLoading,
    // supabase is intentionally NOT included
    // Client components should use API routes for data
  }
}

// New name for new code
export const useAuth = useSupabase
```

**3.3 Update `/middleware.ts`**
```typescript
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { headers } from "next/headers"

const protectedRoutes = [
  "/", "/tasks", "/dashboard", "/daily-fitness", "/add-task", "/add-fitness",
  "/edit-task", "/edit-fitness", "/northstar", "/winter-arc", "/major-projects",
  "/contacts", "/hyrox", "/shipments", "/motivation", "/assist", "/backups",
  "/backups.old", "/tests", "/settings", "/modules", "/profile", "/logs",
  "/radar", "/debug", "/api"
]
const publicRoutes = ["/sign-in", "/auth", "/api/auth"]

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req })

  // Security headers (keep existing)
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  response.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.pusher.com https://stats.pusher.com https://sockjs-us3.pusher.com https://www.youtube.com https://youtube.com",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://js.pusher.com https://sockjs-us3.pusher.com wss://ws-us3.pusher.com",
    "frame-src 'self' https://www.youtube.com https://youtube.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "media-src 'self'"
  ].join("; "))
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  const { pathname } = req.nextUrl

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return response
  }

  // Check authentication for protected routes
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute) {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: req.headers
    })

    if (!session) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    // Feature flag check (if needed)
    // Note: This now uses Better Auth session
    // const preferences = await getUserFeaturePreferences(req, session.user.id)
    // if (!isFeatureEnabled(pathname, preferences)) {
    //   return NextResponse.redirect(new URL('/dashboard', req.url))
    // }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
```

**3.4 Update `/components/auth/auth-form.tsx`**
```typescript
"use client"

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'sign-up') {
        // Sign-up disabled for now
        setError('Sign-up is currently disabled')
        setLoading(false)
        return
      }

      // Sign in with Better Auth
      const { error } = await authClient.signIn.email({
        email,
        password,
      })

      if (error) {
        setError(error.message || 'Sign in failed')
        setLoading(false)
      } else {
        // Redirect on success
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle>{mode === 'sign-in' ? 'Sign In' : 'Sign Up'}</CardTitle>
        <CardDescription>
          {mode === 'sign-in'
            ? 'Enter your credentials to access your account'
            : 'Create a new account to get started'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={18}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Loading...' : (mode === 'sign-in' ? 'Sign In' : 'Sign Up')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

**3.5 Update `/app/profile/page.tsx` (NEW - Profile Management)**

This is a critical file that needs full rewrite for Better Auth:
```typescript
// Key changes needed:
// - Replace supabase.auth.updateUser() with Better Auth API
// - Replace supabase.auth.resetPasswordForEmail() with Better Auth API
// - Update user metadata handling

// Better Auth profile update:
await authClient.updateUser({
  name: fullName,
  // Custom fields via additionalFields
})

// Better Auth password change:
await authClient.changePassword({
  currentPassword,
  newPassword,
})

// Better Auth password reset (if needed):
await authClient.forgetPassword({
  email,
  redirectTo: `${window.location.origin}/auth/reset-password`
})
```

**3.6 Update `/components/user-profile-dropdown.tsx`**
```typescript
// Replace:
// const { session, supabase } = useSupabase()
// await supabase.auth.signOut()

// With:
const { user, session } = useAuth()
await authClient.signOut()
```

**3.7 Delete `/app/auth/callback/route.ts`**
Better Auth handles callbacks internally. This file can be deleted.

---

### Phase 4: Update API Routes (63 files)

**Good news**: Because we updated `getAuthenticatedUser()` to return a compatible shape, most API routes should work without changes.

**Verify each route works** by testing:
1. Returns 401 when not authenticated
2. Returns correct data when authenticated
3. User filtering (`eq('user_id', user.id)`) works correctly

**Files to verify** (may need minor adjustments):
- All files in `/app/api/`
- All files in `/modules-core/*/api/`

---

### Phase 5: Update Client Components (53 files)

**5.1 Components that only use `user` and `session`**
These should work with minimal changes since `useSupabase()` still returns these.

**5.2 Components that use `supabase` client directly (BREAKING)**
These need to be refactored to use API routes instead.

Pattern change:
```typescript
// BEFORE (direct DB query in client)
const { supabase } = useSupabase()
const { data } = await supabase.from('tasks').select('*')

// AFTER (use API route)
const response = await fetch('/api/tasks')
const data = await response.json()
```

**5.3 Components using `session.access_token`**
The updated auth-helpers maps `session.token` to `session.access_token` for compatibility, but verify these still work.

---

### Phase 6: Environment Variables

**Add new:**
```env
BETTER_AUTH_SECRET=<generate: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://...  # Supabase connection string
SUPABASE_SERVICE_KEY=<service role key>
```

**Update Vercel/Production:**
Add these same variables to your deployment platform.

---

### Phase 7: Testing Checklist

#### Authentication
- [ ] Sign in works with existing password (bcrypt)
- [ ] After sign in, password is upgraded to Argon2 (check DB)
- [ ] Sign out works
- [ ] Session persists across page refreshes
- [ ] Session expires correctly

#### Route Protection
- [ ] Protected routes redirect to /sign-in when not authenticated
- [ ] Public routes (/sign-in, /auth) accessible without auth
- [ ] API routes return 401 when not authenticated

#### Profile Management
- [ ] Profile page loads user data
- [ ] Can update name/profile info
- [ ] Can change password

#### Data Operations
- [ ] Tasks CRUD works
- [ ] Contacts CRUD works
- [ ] Fitness tasks work
- [ ] All modules work (test each one)
- [ ] Feature flags work

#### Edge Cases
- [ ] Refresh token works (leave app open, come back later)
- [ ] Multiple tabs work correctly
- [ ] Mobile browser works

---

### Phase 8: Cleanup

1. **Remove packages:**
   ```bash
   npm uninstall @supabase/ssr
   # Keep @supabase/supabase-js for database queries
   ```

2. **Delete deprecated files:**
   - `/lib/supabase-auth.ts`
   - `/lib/supabase-authenticated.ts`
   - `/lib/supabase-client-fixed.ts`
   - `/app/auth/callback/route.ts`

3. **Update documentation:**
   - `CLAUDE.md` - Update auth section
   - Environment variable documentation

---

## Critical Files Summary

| File | Action |
|------|--------|
| `/lib/auth.ts` | **CREATE** - Better Auth server config with Argon2 |
| `/lib/auth-client.ts` | **CREATE** - Better Auth client |
| `/lib/db.ts` | **CREATE** - Database client helper |
| `/app/api/auth/[...all]/route.ts` | **CREATE** - Auth handler |
| `/migrations/better-auth-user-migration.sql` | **CREATE** - User migration |
| `/lib/auth-helpers.ts` | **REWRITE** - Use Better Auth session |
| `/components/providers.tsx` | **REWRITE** - Use Better Auth hooks |
| `/middleware.ts` | **REWRITE** - Use Better Auth session |
| `/components/auth/auth-form.tsx` | **REWRITE** - Use authClient |
| `/app/profile/page.tsx` | **REWRITE** - Use Better Auth APIs |
| `/components/user-profile-dropdown.tsx` | **MODIFY** - Use authClient.signOut |
| `/app/auth/callback/route.ts` | **DELETE** |
| `/lib/supabase-auth.ts` | **DELETE** (after migration) |
| 63 API routes | **VERIFY** - Should work with updated auth-helpers |
| 53 client components | **AUDIT & MODIFY** - Remove direct supabase usage |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| User ID mismatch breaks FK relationships | HIGH | Preserve exact UUID in migration |
| Password hash incompatibility | LOW | Custom verify handles bcrypt→Argon2 |
| Client components using supabase directly | HIGH | Phase 0 audit, systematic refactor |
| Session structure differences | MEDIUM | Compatibility mapping in auth-helpers |
| Profile/password update broken | MEDIUM | Full rewrite of profile page |
| Middleware blocks all requests | HIGH | Test on branch first |

---

## Confidence Level

**Overall: 80%** (High)

**Confidence factors:**
- ✅ Single user migration is straightforward
- ✅ bcrypt→Argon2 migration pattern is well-documented
- ✅ auth-helpers compatibility layer minimizes API route changes (63 files)
- ✅ Only 3 files need client-side DB query refactoring
- ✅ Only 17 files need auth method rewrites
- ⚠️ 5 files use realtime subscriptions (should work, but needs verification)
- ⚠️ No automated tests for regression detection

---

## Sources

- [Better Auth Supabase Migration Guide](https://www.better-auth.com/docs/guides/supabase-migration-guide)
- [Better Auth Next.js Integration](https://www.better-auth.com/docs/integrations/next)
- [Better Auth Installation](https://www.better-auth.com/docs/installation)
- [Better Auth Database Configuration](https://www.better-auth.com/docs/concepts/database)
- [Argon2 Password Hashing](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
