# Build Scripts

## dev-cache-guard.mjs

**Clears a stale Turbopack persistent dev cache (`.next/dev`) before `next dev` starts.**

### Problem

Turbopack's persistent dev cache (on by default since Next 16.1) does not invalidate
when a convention entrypoint is renamed. When `middleware.ts` became `proxy.ts`, any
existing install that pulled the change kept serving a compiled chunk pointing at the
removed file — every request failed with `MODULE_UNPARSABLE` and the dev server leaked
memory until it crashed (see [vercel/next.js#94915](https://github.com/vercel/next.js/issues/94915)).

### Solution

Runs first in the `predev` hook, so it executes before every `pnpm dev` (including
`./ari start`). Two checks:

1. **Stale-entrypoint shim** — if `.next/dev/server/middleware.js` still references
   `[project]/middleware.ts` and no `middleware.ts` exists, the cache is cleared.
2. **Git-aware guard** — the git HEAD the cache was last used at is stamped in
   `.ari/cache-guard.json` (gitignored). When HEAD has moved, the cache is cleared
   only if the diff touches a module-graph-shaping root file (`proxy.ts`,
   `middleware.ts`, `instrumentation.ts`, `next.config.mjs`, `package.json`,
   `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`). A missing stamp
   triggers a one-time reset.

The script never fails the caller, skips entirely while another dev server holds
`.next/dev/lock`, and only runs the shim check on installs without git history.

**Escape hatch:** `ARI_SKIP_CACHE_GUARD=1` skips it entirely.

**Manually:**
```bash
pnpm dev-cache-guard
```

## generate-module-registry.js

**Auto-generates the module pages registry for dynamic routing.**

### Problem
Next.js App Router requires static imports at build time. We can't dynamically import modules based on filesystem paths like:
```typescript
import(`@/modules-core/${dynamicModuleId}/app/page`)  // ❌ Doesn't work
```

### Solution
This script scans `/modules` directory before each build and generates a static registry file that Next.js can use.

### How It Works

1. **Scans** `/modules` directory for valid modules
   - Checks for `module.json` manifest
   - Checks for `app/page.tsx` or `app/page.jsx`

2. **Generates** `/lib/generated/module-pages-registry.ts`
   - Creates static import statements for each module
   - Exports `MODULE_PAGES` registry object
   - Exports helper functions

3. **Used by** `/app/[module]/[[...slug]]/page.tsx`
   - Catch-all route imports the generated registry
   - Validates module is enabled
   - Dynamically renders the module page

### When It Runs

**Automatically:**
- Before `pnpm dev` (via `predev` hook)
- Before `pnpm build` (via `prebuild` hook)

**Manually:**
```bash
pnpm generate-module-registry
```

### Adding a New Module

Just create the module directory structure:
```
/modules-core/my-new-module/
  ├── module.json          # Required
  ├── app/
  │   └── page.tsx        # Required
  └── ...
```

Then run:
```bash
pnpm dev
```

The script will automatically detect and register your new module!

### Output Example

```typescript
// lib/generated/module-pages-registry.ts
export const MODULE_PAGES: Record<string, any> = {
  'assist': () => import('@/modules-core/assist/app/page'),
  'contacts': () => import('@/modules-core/contacts/app/page'),
  'daily-fitness': () => import('@/modules-core/daily-fitness/app/page'),
  // ... automatically discovered modules
}
```

### Key Benefits

✅ **Fully Dynamic**: Just drop a new module folder and it's auto-registered
✅ **Type-Safe**: Generated TypeScript with proper types
✅ **Build-Time**: No runtime filesystem scanning needed
✅ **Zero Config**: Works automatically with npm scripts

### Files Modified

- `/app/[module]/[[...slug]]/page.tsx` - Uses generated registry
- `/package.json` - Added `predev` and `prebuild` hooks
- `/.gitignore` - Excludes `/lib/generated/`
