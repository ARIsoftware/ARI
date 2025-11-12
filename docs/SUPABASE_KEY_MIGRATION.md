# Supabase Key Management Guide

**Last Updated**: November 12, 2025
**Status**: ✅ Active
**Risk Level**: Very Low

## Overview

This document covers two types of Supabase key management operations:
1. **API Key Migration** - Legacy anon keys → New publishable keys
2. **JWT Signing Key Rotation** - Rotating keys used to sign authentication tokens

Both operations can be performed **without code changes** in this application.

---

# Part 1: API Key Migration (Anon → Publishable)

## Background

### What Changed?

Supabase introduced a new publishable key format to improve security and key management:

- **Legacy Anon Key** (deprecated): JWT format starting with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **New Publishable Key** (current): Opaque token format starting with `sb_publishable_...`

### Why Migrate?

1. **Supabase Timeline**: Legacy keys were removed on October 1, 2025
2. **Better Security**: Publishable keys can be rotated independently without affecting user sessions
3. **Improved Management**: Dashboard shows "last used" indicators and easier key management
4. **Future-Proof**: New Supabase projects only support the new key format

## Key Differences

| Feature | Legacy Anon Key | New Publishable Key |
|---------|----------------|-------------------|
| Format | JWT token | Opaque token |
| Expiration | 10 years | Managed by Supabase |
| Rotation | Affects user sessions | Independent rotation |
| Authorization Headers | ✅ Can be used | ❌ Cannot be used |
| Client Libraries | ✅ Supported | ✅ Supported |
| RLS Behavior | Same privileges | Same privileges |

## Migration Steps

### Step 1: Obtain New Publishable Key

1. Go to your Supabase project dashboard
2. Navigate to **Settings** > **API Keys**
3. Look for the "Publishable" key (starts with `sb_publishable_...`)
4. Copy the key value

### Step 2: Update Local Environment

1. Open your `.env.local` file
2. Replace the `NEXT_PUBLIC_SUPABASE_ANON_KEY` value:

```env
# Before (Legacy JWT format)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# After (New publishable key format)
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Tw0gN8c...
```

3. **Important**: Keep the environment variable name the same
4. Save the file

### Step 3: Restart Development Server

```bash
npm run dev
```

### Step 4: Test Locally

Run through this testing checklist:

- [ ] Sign in to the application
- [ ] Access protected routes (`/dashboard`, `/tasks`, etc.)
- [ ] Create/edit/delete a task
- [ ] Test real-time updates
- [ ] Check browser console for errors
- [ ] Verify API calls work
- [ ] Test contact management
- [ ] Test fitness tracking features

### Step 5: Update Production Environment

1. Go to your hosting platform (e.g., Vercel)
2. Navigate to **Settings** > **Environment Variables**
3. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` with new publishable key
4. Save and redeploy

### Step 6: (Optional) Disable Legacy Key

After 24-48 hours of confirmed operation:

1. Go to Supabase dashboard > **Settings** > **API Keys**
2. Check "last used" indicator on legacy anon key
3. Disable or rotate the legacy key

## No Code Changes Required

✅ Your Supabase client libraries support both key formats
✅ All API calls use user JWTs (not the anon key)
✅ No Edge Functions requiring updates
✅ No hardcoded keys in the codebase

---

# Part 2: JWT Signing Key Rotation

## Background

JWT signing keys are used by Supabase Auth to create and verify JSON Web Tokens (JWTs) for authenticated users. Rotating these keys improves security by limiting the lifespan of signing keys.

### What Are JWT Signing Keys?

- **Current Key**: The active key used to sign all new JWTs
- **Standby Key**: A backup key that can be promoted to current
- **Previously Used Keys**: Old keys still valid for existing non-expired tokens

### Why Rotate?

1. **Security Best Practice**: Regular rotation limits exposure if a key is compromised
2. **Algorithm Upgrades**: Migrate from HS256 (shared secret) to ECC (P-256) for better security
3. **Compliance**: Some regulations require periodic key rotation

## Important: This Application Requires NO Code Changes

✅ **Analysis Complete** (November 12, 2025):
- No custom JWT verification code found in codebase
- All authentication uses Supabase official client libraries
- JWKS auto-fetching built into `@supabase/ssr` and `@supabase/supabase-js`
- Zero risk of breaking changes

### How JWT Verification Works in This App

1. **Client login** → Supabase issues JWT access token
2. **Token stored** in HTTP-only cookies (via `@supabase/ssr`)
3. **Middleware** calls `supabase.auth.getUser()` on every request
4. **Supabase client** automatically:
   - Extracts JWT from cookies
   - Fetches JWKS from `/.well-known/jwks.json` if needed
   - Verifies JWT signature using JWKS
   - Returns user or error

**Your code never touches the JWT directly** - it's all handled by Supabase clients.

## JWT Rotation Steps

### Step 1: Review Current Keys

1. Go to Supabase dashboard > **Settings** > **API** > **JWT Keys** tab
2. Note your current key algorithm (likely HS256)
3. Note your standby key (if one exists)

### Step 2: Rotate Keys in Dashboard

1. Click **"Rotate keys"** button
2. Review the rotation dialog:
   - Current key → becomes standby
   - Standby key → becomes current
3. **Read the warnings** about backend components
4. Check the confirmation boxes:
   - ✅ "All of my application's components have picked up the standby key"
   - ✅ "To invalidate non-expired JWTs I need to explicitly revoke the currently used key"
5. Click **"Rotate signing key"**

### Step 3: Verify Rotation

The rotation happens **instantly**:

- ✅ New logins get JWTs signed with the new key
- ✅ Existing sessions remain valid (signed with old key)
- ✅ Both keys accepted until old tokens expire

### Step 4: Test Application

Run through authentication flows:

- [ ] Sign in with existing account
- [ ] Sign out and sign in again (gets new JWT)
- [ ] Access protected routes
- [ ] Test API calls
- [ ] Check `/debug` page for auth status
- [ ] Verify no JWT verification errors in logs

### Step 5: Monitor

For the next 24-48 hours:

- Monitor error logs for JWT verification failures
- Check user login success rates
- Verify no authentication issues reported

## What Happens During Rotation

### Immediate Effects:
- ✅ New JWTs signed with new key
- ✅ Old JWTs still valid (verified with old key from JWKS)
- ✅ No user sessions interrupted
- ✅ No forced logouts

### Behind the Scenes:
1. Supabase updates `/.well-known/jwks.json` endpoint
2. JWKS now includes both old and new public keys
3. Supabase clients cache and auto-refresh JWKS
4. JWT verification works for tokens signed by either key

### For This Application:
- ✅ **Zero downtime**
- ✅ **No code changes needed**
- ✅ **No configuration updates required**
- ✅ **Automatic adaptation** via Supabase clients

## Files That Handle JWT Verification

All files use Supabase clients (no changes needed):

**Core Authentication:**
- `/lib/supabase-auth.ts` - `createBrowserClient()`
- `/lib/auth-helpers.ts` - `createServerClient()` + `auth.getUser()`
- `/middleware.ts` - Session validation via `auth.getUser()`

**API Routes (35+ files):**
- All use `getAuthenticatedUser()` from `/lib/auth-helpers.ts`
- All rely on Supabase's built-in JWT verification

**No Custom Verification:**
- ❌ No `jwt.verify()` calls
- ❌ No `jsonwebtoken` library usage
- ❌ No `jose` library usage
- ❌ No manual JWKS fetching

## Troubleshooting

### Issue: "Invalid JWT" Errors After Rotation

**Cause**: Extremely rare - JWKS cache might not have refreshed.

**Solution**:
1. Clear browser cache and cookies
2. Sign out and sign in again
3. Restart development server if in local environment
4. Check Supabase dashboard for rotation status

### Issue: Users Forced to Re-login

**Cause**: This should NOT happen unless you explicitly revoke the old key.

**Solution**:
1. Check Supabase dashboard > JWT Keys
2. Verify both current and standby/previous keys are listed
3. Ensure old key is not revoked until all tokens expire (typically 1 hour)

### Issue: API Authentication Failures

**Cause**: Network issues preventing JWKS fetch.

**Solution**:
1. Check network connectivity to Supabase
2. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
3. Check Supabase project status
4. Review application logs for specific errors

## Security Considerations

### When to Rotate

✅ **Recommended scenarios:**
- Every 90 days as a security best practice
- When upgrading algorithm (HS256 → ECC P-256)
- After suspected key compromise
- During security audits or compliance reviews

❌ **Not necessary:**
- After API key changes
- After password changes
- During normal Supabase updates

### Key Revocation

**Warning**: Revoking the old key will **invalidate all existing sessions**.

Only revoke old keys when:
- You need to force all users to re-authenticate
- A security incident requires immediate action
- All tokens signed with old key have expired (check token expiry time)

### Algorithm Migration

The rotation dialog allows switching from:
- **HS256 (Shared Secret)** → symmetric, simpler
- **ECC (P-256)** → asymmetric, more secure

This application works with both. ECC is recommended for production.

## Post-Rotation Verification Checklist

After rotating JWT signing keys, verify:

```bash
# 1. Check environment variables are unchanged
grep "NEXT_PUBLIC_SUPABASE" .env.local

# 2. Verify no hardcoded JWT secrets
grep -r "SUPABASE_JWT_SECRET" --exclude-dir=node_modules --exclude-dir=.next .

# 3. Test authentication flow
npm run dev
# Then test: Sign in → Access protected routes → Sign out → Sign in again

# 4. Check for errors
# Review browser console and server logs for JWT-related errors
```

Expected results:
- ✅ No environment variables need changing
- ✅ Only documentation references to JWT_SECRET found
- ✅ All authentication flows work normally
- ✅ No JWT verification errors in logs

## Timeline & Status

- **November 12, 2025**: Analysis completed
  - Confirmed no custom JWT verification in codebase
  - Documented safe rotation process
  - Verified JWKS auto-fetching in Supabase clients

## Additional Resources

- [Supabase JWT Documentation](https://supabase.com/docs/guides/auth/jwts)
- [JWKS Specification](https://www.rfc-editor.org/rfc/rfc7517)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)

---

**Last Updated**: November 12, 2025
**Migration Status**: ✅ Documentation Complete - Both operations safe to perform
