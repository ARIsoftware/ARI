# ARI Module System - Developer Guide

> Build powerful, self-contained features for ARI using the modular plugin architecture.

**Version**: 5.0 | **Status**: Production Ready

> **Note**: ARI uses **Better Auth** for authentication and **Drizzle ORM** for database access. See the [Technical Reference](/docs/MODULES.md) for the correct API patterns.

---

## What Are Modules?

Modules are self-contained features that extend ARI's functionality. Think of them as plugins that you can easily install, configure, and remove without affecting the core application.

### What Modules Can Add

- **Pages** - New routes and screens
- **API Endpoints** - Backend functionality
- **Database Tables** - Data storage with automatic user isolation
- **Dashboard Widgets** - Quick-glance information on your dashboard
- **Settings Panels** - User-configurable options

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Plug-and-Play** | Drop a module folder into `/modules` and it's automatically discovered |
| **Isolated** | Modules don't affect each other or the core app |
| **User Control** | Enable/disable modules individually in Settings |
| **Secure** | Built-in authentication, Row Level Security, and error boundaries |
| **Type-Safe** | Full TypeScript support with IntelliSense |

---

## Quick Start

### Installing a Module

Modules are automatically discovered from the `/modules` directory:

```bash
# Method 1: Git clone
cd modules/
git clone https://github.com/user/ari-amazing-module.git amazing-module

# Method 2: Copy folder
cp -r ~/Downloads/my-module modules/

# Method 3: Git submodule
git submodule add https://github.com/user/ari-module.git modules/my-module

# Restart dev server
pnpm dev
```

That's it! The module will appear in Settings → Features and the sidebar automatically.

### Enabling a Module

1. Navigate to **Settings → Features**
2. Scroll to the **Modules** section
3. Toggle ON the module you want to enable
4. The module will appear in the sidebar

---

## Module Structure Overview

Every module lives in its own folder under `/modules`:

```
modules/my-module/
├── module.json         ← Configuration (required)
├── README.md           ← Documentation
│
├── app/                ← Pages
│   └── page.tsx       ← Main module page (required)
│
├── api/                ← API endpoints
│   └── data/
│       └── route.ts
│
├── components/         ← React components
│   ├── widget.tsx     ← Dashboard widget
│   └── settings.tsx   ← Settings panel
│
├── lib/                ← Utilities
├── types/              ← TypeScript types
└── database/           ← SQL schemas
```

### The module.json File

This is the heart of your module - it tells ARI everything about it:

```json
{
  "id": "my-module",
  "name": "My Module",
  "description": "What this module does",
  "version": "1.0.0",
  "author": "Your Name",
  "icon": "Package",
  "enabled": true,
  "routes": [
    {
      "path": "/my-module",
      "label": "My Module",
      "sidebarPosition": "main"
    }
  ]
}
```

---

## Creating Your First Module

The easiest way to create a module is to copy the **module-template** template:

```bash
# Copy the template
cp -r modules/module-template modules/my-module

# Edit the module.json
# Change: id, name, description, routes path/label
```

### Essential Steps

1. **Create folder structure** under `/modules/your-module-id/`
2. **Create module.json** with required fields
3. **Create app/page.tsx** - your main page component
4. **Register the module** - see technical docs for registration points
5. **Test it** - restart dev server and check Settings → Features

For the complete step-by-step checklist with all registration points, see:
**[/docs/MODULES.md](/docs/MODULES.md)** → Section 4: Checklist: Creating a New Module

---

## Module Features

### Pages and Routing

Your module's pages live in the `app/` folder:

```
app/
├── page.tsx           → /my-module
└── settings/
    └── page.tsx       → /my-module/settings
```

Pages must use `export default function` and **return only your content** - no layout wrappers!

> **Important:** Module pages are automatically wrapped with the sidebar, header, and other layout components. Don't include `SidebarProvider`, `AppSidebar`, `DarkModeProvider`, or similar in your module pages, or you'll get duplicate toolbars.

```tsx
'use client'

export default function MyModulePage() {
  // Just return your content - no layout wrappers needed!
  return (
    <div className="p-6">
      <h1>My Module</h1>
    </div>
  )
}
```

### API Endpoints

Create API routes in the `api/` folder:

```
api/
└── data/
    └── route.ts       → /api/modules/my-module/data
```

API routes automatically require authentication and support standard HTTP methods (GET, POST, PATCH, DELETE).

### Database Integration

Modules can define their own database tables:

1. Create `database/schema.sql` with your table definition
2. Add Drizzle schema definition to `/lib/db/schema/schema.ts`
3. List tables in `module.json` under `database.tables`
4. Apply SQL via Supabase SQL Editor

> **Note**: User data isolation is handled at the **application level** via the `withRLS()` helper, not via database RLS policies. This is because ARI uses Better Auth (not Supabase Auth).

### Dashboard Widgets

Add a widget that appears on the main dashboard:

1. Create `components/widget.tsx`
2. Set `dashboard.widgets: true` in module.json
3. Widget will appear for users who have the module enabled

### Settings Panels

Give users control over your module:

1. Create `components/settings-panel.tsx`
2. Set `settings.panel` path in module.json
3. Panel appears in module settings

### Fullscreen Mode

For immersive experiences (games, dashboards, visualizations):

```json
{
  "fullscreen": true
}
```

This hides the sidebar and header, giving your module the full screen.

---

## Best Practices

### Security

- **Always validate authentication** in API routes using `getAuthenticatedUser()`
- **Use `withRLS()` helper** for all database operations (provides application-level user isolation)
- **Validate inputs** with Zod schemas
- **Never expose secrets** in client code

### Performance

- **Lazy load** heavy components
- **Add database indexes** for common queries
- **Show loading states** for async operations

### Code Quality

- Use **TypeScript** for type safety
- Handle **errors gracefully**
- Follow **naming conventions** (kebab-case for IDs)
- Write **clear documentation**

### Styling

- Use **Tailwind CSS** for consistency
- Use **Shadcn/ui components** from `@/components/ui/`
- Follow the app's color scheme
- Make it **responsive**

---

## Publishing Your Module

### Prepare for Release

1. Test thoroughly in development
2. Ensure build succeeds: `npm run build`
3. Write clear README.md
4. Add LICENSE file

### Create Repository

```bash
cd modules/my-module
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/ari-my-module.git
git push -u origin main
```

### Tag Version

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Share

Users can install your module with:
```bash
cd modules/
git clone https://github.com/yourname/ari-my-module.git my-module
```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Module not in sidebar | Check `module.json` is valid JSON, restart dev server |
| Page shows 404 | Ensure page uses `export default function` |
| **Duplicate toolbars/headers** | **Remove layout wrappers** (`SidebarProvider`, `AppSidebar`, etc.) from your module page - these are already provided |
| API returns 401 | Check authentication token is being sent |
| Widget not showing | Verify `dashboard.widgets: true` in manifest |
| Database errors | Ensure migrations applied and RLS enabled |

For detailed troubleshooting, see:
**[/docs/MODULES.md](/docs/MODULES.md)** → Section 10: Troubleshooting

---

## Additional Resources

| Resource | Description |
|----------|-------------|
| `/docs/MODULES.md` | Complete technical reference |
| `/modules/module-template/` | Template module with all features |
| [Lucide Icons](https://lucide.dev) | Available icon names for manifest |
| [Shadcn/ui](https://ui.shadcn.com) | UI component documentation |

---

**Happy Module Building!**

*For technical details, checklists, and code templates, see the [Technical Reference](/docs/MODULES.md).*
