# ARI Module System - Setup Instructions

## ✅ Implementation Complete!

The module system infrastructure has been successfully implemented. Follow these steps to get started.

---

## 📁 Module Directories

ARI uses two module directories:

| Directory | Purpose | Updates |
|-----------|---------|---------|
| `/modules-core` | Built-in modules that ship with ARI | ⚠️ **Overwritten during updates** |
| `/modules-custom` | Your custom modules | ✅ **Never touched during updates** |

> **IMPORTANT**: Always place your modules in `/modules-custom`. Any changes to `/modules-core` will be lost when you update ARI.

Create the custom modules directory if it doesn't exist:

```bash
mkdir modules-custom
```

See `/docs/modules.md` for full documentation on creating modules and overriding core modules.

---

## 📋 Step 1: Apply Database Schema

The module system requires two database tables: `module_settings` and `module_migrations`.

### Instructions:

1. Open the file: `/database/module-system-schema.sql`
2. Copy **the entire contents** of the file
3. Go to your Supabase Dashboard → **SQL Editor**
4. Create a new query
5. Paste the SQL
6. Click **"Run"** to execute
7. Verify tables were created:
   - `module_settings` (user module preferences)
   - `module_migrations` (migration tracking)

---

## 📋 Step 2: Apply Hello-World Module Schema

The hello-world module requires its own database table: `hello_world_entries`.

### Instructions:

1. Open the file: `/modules-core/hello-world/database/schema.sql`
2. Copy **the entire contents**
3. Go to Supabase Dashboard → **SQL Editor**
4. Create a new query
5. Paste the SQL
6. Click **"Run"** to execute
7. Verify table was created:
   - `hello_world_entries` (module data)

---

## 📋 Step 3: Restart Development Server

After applying the database schemas, restart your dev server to ensure the module loader picks up the module:

```bash
# Stop current server (Ctrl+C if running)

# Restart dev server
npm run dev
```

---

## ✅ Step 4: Verify Module is Working

### Test 1: Check Module Appears in Settings

1. Navigate to `/settings` in your browser
2. Click on the **"Features"** tab
3. Scroll down to the **"Modules"** section
4. You should see **"Hello World"** module listed with:
   - Package icon
   - Name: "Hello World"
   - Version: v1.0.0
   - Toggle switch (should be ON by default)

### Test 2: Check Module Appears in Sidebar

1. Look at the left sidebar navigation
2. You should see a new section called **"Modules"**
3. Under it, you should see **"Hello World"** with a Package icon

### Test 3: Visit Module Page

1. Click on **"Hello World"** in the sidebar, or navigate to `/hello-world`
2. You should see:
   - Page loads successfully (no errors)
   - Module header: "Hello World Module"
   - Welcome message with your email
   - Statistics card
   - Form to create entries
   - Empty state: "No entries yet"

### Test 4: Create an Entry

1. On the `/hello-world` page, enter a message in the input field
2. Click **"Add"**
3. Entry should appear in the list below
4. Try clicking the delete button (trash icon) to remove it

### Test 5: Check API Routes

1. Open browser DevTools (F12) → Network tab
2. Create a new entry on the `/hello-world` page
3. You should see:
   - POST request to `/api/modules-core/hello-world/data` (status 200)
   - GET request to `/api/modules-core/hello-world/data` (status 200)
   - No errors in the console

---

## 🎉 Success Criteria Met!

If all the above tests pass, your module system is working correctly!

You should now have:

- ✅ Module appears in Settings → Features tab
- ✅ Module appears in sidebar navigation
- ✅ Module page loads at `/hello-world`
- ✅ Can create/view/delete entries
- ✅ API routes working correctly
- ✅ Database RLS policies enforcing user isolation

---

## 🔧 Troubleshooting

### Module Not Appearing in Sidebar

**Symptom**: No "Modules" section in sidebar

**Solutions**:
1. Clear browser cache and hard refresh (Ctrl+Shift+R)
2. Check browser console for JavaScript errors
3. Verify `/lib/modules/module-loader.ts` exists
4. Restart dev server

### 404 Error on Module Page

**Symptom**: Visiting `/hello-world` shows 404

**Solutions**:
1. Verify `/app/[module]/[[...slug]]/page.tsx` exists
2. Check that `/modules-core/hello-world/module.json` has `"enabled": true`
3. Clear `.next` folder: `rm -rf .next && npm run dev`
4. Check server logs for module loading errors

### API Errors

**Symptom**: Creating entries fails with API errors

**Solutions**:
1. Verify database tables exist in Supabase
2. Check RLS policies are enabled on tables
3. Verify you're authenticated (check user is logged in)
4. Look at Network tab for specific error messages
5. Check server logs in terminal

### Module Shows as Disabled

**Symptom**: Module exists but toggle is OFF

**Solutions**:
1. Go to Settings → Features → Modules
2. Toggle the switch ON for "Hello World"
3. Page will refresh
4. Module should now appear in sidebar

---

## 📁 Files Created

Here's a complete list of files created for the module system:

### Core Module Infrastructure

1. `/lib/modules/module-types.ts` - TypeScript type definitions
2. `/lib/modules/reserved-routes.ts` - Reserved route validation
3. `/lib/modules/module-loader.ts` - Module discovery and loading
4. `/lib/modules/module-registry.ts` - Module state management
5. `/lib/modules/module-hooks.ts` - React hooks for client-side
6. `/lib/modules/icon-utils.ts` - Dynamic Lucide icon helper

### API Routes

7. `/app/api/modules-core/route.ts` - List/manage modules API
8. `/app/api/modules-core/[module]/[...path]/route.ts` - Catch-all API proxy

### Page Routes

9. `/app/[module]/[[...slug]]/page.tsx` - Catch-all page route

### Components

10. `/components/error-boundary.tsx` - Error boundary for modules

### Database

11. `/database/module-system-schema.sql` - Module system tables

### Updated Files

12. `/components/app-sidebar.tsx` - Added module navigation
13. `/app/settings/page.tsx` - Added modules management UI

---

## 🚀 Next Steps

Now that the module system is working, you can:

1. **Explore the hello-world module code** - See how it's structured
2. **Create your own module** - Copy the hello-world template
3. **Add dashboard widgets** - Modules can provide dashboard widgets
4. **Add settings panels** - Modules can have their own settings UI
5. **Create module dependencies** - Modules can depend on other modules

---

## 📚 Architecture Overview

### How Module Loading Works

1. **Discovery**: `/lib/modules/module-loader.ts` scans `/modules-custom` then `/modules-core`
2. **Validation**: Checks `module.json` files for required fields
3. **Override**: Custom modules with same ID as core modules take precedence
4. **Registration**: `/lib/modules/module-registry.ts` maintains enabled state
5. **Routing**: Catch-all routes proxy to module files

### URL Structure

- **Module Page**: `/hello-world` → `/modules-core/hello-world/app/page.tsx`
- **Module API**: `/api/modules-core/hello-world/data` → `/modules-core/hello-world/api/data/route.ts`

### Database Architecture

- **`module_settings`**: Per-user enable/disable state
- **`module_migrations`**: Global migration tracking
- **Module tables**: Each module defines its own tables

---

## ⚠️ Important Notes

1. **Database Required**: Both SQL files MUST be applied before modules work
2. **Authentication Required**: All module routes require user login
3. **RLS Enforced**: All module data is user-isolated via RLS policies
4. **Page Refresh**: Toggling modules requires page refresh
5. **Reserved Routes**: Modules cannot use IDs like `dashboard`, `tasks`, etc.

---

## 🐛 Common Errors

### Error: "Module not found or not enabled"

- Module is disabled in Settings, or database not setup
- **Fix**: Apply database SQL, enable module in Settings

### Error: "Cannot find module"

- Dynamic import failed (file doesn't exist)
- **Fix**: Verify module page exists at correct path

### Error: "RLS policy violation"

- User not authenticated or RLS not configured
- **Fix**: Apply RLS policies from SQL file, ensure logged in

---

## 💡 Tips

- Check browser console for errors - very helpful for debugging
- Check server terminal logs - shows module loading details
- Use Settings → Features → Modules to enable/disable modules
- Module changes require page refresh (not hot-reload)
- Manifest changes require dev server restart

---

**Need Help?** Check `/modules-core/hello-world/README.md` for detailed documentation.

**Want to Build a Module?** Use hello-world as a template and reference!
