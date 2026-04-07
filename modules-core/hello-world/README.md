# Hello World Module

> **Template Module for ARI Module System**
> Use this as a reference when building your own modules

## Overview

This is a fully-featured example module demonstrating all capabilities of the ARI module system:
- ✅ Main page with authentication
- ✅ API routes with validation
- ✅ Database schema with RLS
- ✅ Dashboard widget
- ✅ Settings panel
- ✅ TypeScript types
- ✅ Comprehensive documentation

## Features Demonstrated

### 1. **Page Routing**
- Main module page at `/hello-world`
- Uses ARI's authentication context
- Follows ARI's design patterns

### 2. **API Routes**
- GET endpoint for fetching data
- POST endpoint for creating data
- Authentication validation
- Zod schema validation
- Proper error handling

### 3. **Database Integration**
- Custom table: `hello_world_entries`
- Drizzle ORM with `withRLS()` helper
- User-specific data isolation at application level
- Table defined in `/lib/db/schema/schema.ts`

### 4. **Dashboard Widget**
- Displays count of user's entries
- Follows ARI's card design system
- Handles loading states

### 5. **Settings Panel**
- Toggle settings
- Text input settings
- Proper state management
- Save/load functionality

## Installation

This module is already installed in the `/modules` directory. To use it:

1. **Enable the module** in Settings → Features
2. **Apply database migrations** (see below)
3. **Navigate to** `/hello-world` to see it in action

## Database Setup

### Required Tables

This module requires one database table: `hello_world_entries`

### Applying Migrations

1. Go to Settings → Features in ARI
2. Find "Hello World" module
3. Click "View SQL" or "Copy to Clipboard"
4. Open your Supabase SQL Editor
5. Paste and run the SQL
6. Return to ARI and click "Mark as Applied"

### Manual Migration (Alternative)

Copy the SQL from `database/schema.sql` and run it in Supabase SQL Editor.

## File Structure

```
modules/hello-world/
├── module.json                 # Module manifest (required)
├── README.md                   # This file
│
├── app/                        # Module pages (Next.js App Router)
│   └── page.tsx               # Main module page at /hello-world
│
├── components/                 # Module components
│   ├── widget.tsx             # Dashboard widget
│   └── settings-panel.tsx     # Settings UI
│
├── api/                        # Module API routes
│   └── data/
│       └── route.ts           # API handlers at /api/modules-core/hello-world/data
│
├── lib/                        # Module utilities
│   └── utils.ts               # Helper functions
│
├── database/                   # Database schemas
│   ├── schema.sql             # Table definitions
│   └── migrations/
│       └── 001_example.sql    # Example migration
│
└── types/                      # TypeScript types
    └── index.ts               # Module type definitions
```

## Usage Examples

### Using the Module Page

Navigate to `/hello-world` in your browser. The page shows:
- User information
- List of entries (from database)
- Form to create new entries

### Using the API

Authentication is handled via HTTP-only cookies (Better Auth), so no Authorization header is needed for browser requests.

```typescript
// From a React component - cookies are sent automatically
const response = await fetch('/api/modules/hello-world/data')
const { entries } = await response.json()

// Create new entry
const response = await fetch('/api/modules/hello-world/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello from API' })
})
```

### Using TanStack Query Hooks (Recommended)

```typescript
import {
  useHelloWorldEntries,
  useCreateHelloWorldEntry,
  useDeleteHelloWorldEntry,
} from '@/modules/hello-world/hooks/use-hello-world'

// In your component
const { data: entries = [], isLoading } = useHelloWorldEntries()
const createEntry = useCreateHelloWorldEntry()

// Create with optimistic updates
createEntry.mutate('My message')
```

### Using from Another Module

```typescript
// Import types
import { HelloWorldEntry } from '@/modules/hello-world/types'

// Call the API (cookies handle auth automatically)
const response = await fetch('/api/modules/hello-world/data')
const data = await response.json()
```

## Customization Guide

### Changing the Module Name

1. Update `id` in `module.json` (must be kebab-case)
2. Update `name` in `module.json` (display name)
3. Update route paths to match new ID
4. Rename database table prefix if desired
5. Update this README

### Adding More Pages

Create new pages in `/app`:
```
app/
├── page.tsx                    # Main page at /hello-world
└── settings/
    └── page.tsx               # Sub-page at /hello-world/settings
```

Update `module.json` routes:
```json
{
  "routes": [
    {
      "path": "/hello-world",
      "label": "Hello World",
      "icon": "Package",
      "sidebarPosition": "main",
      "children": [
        {
          "path": "/hello-world/settings",
          "label": "Settings",
          "icon": "Settings"
        }
      ]
    }
  ]
}
```

### Adding More API Endpoints

Create new route handlers in `/api`:
```
api/
├── data/
│   └── route.ts               # /api/modules/hello-world/data
└── stats/
    └── route.ts               # /api/modules/hello-world/stats
```

### Adding Database Tables

1. Add SQL to `database/schema.sql`
2. List table name in `module.json` under `database.tables`
3. Create migration file if updating existing module
4. Users apply migration via Settings → Features

## Development Workflow

### Testing Locally

```bash
# Start dev server
npm run dev

# Visit http://localhost:3000/hello-world
# Changes to files will hot-reload automatically
```

### Making Changes

1. **Code changes**: Hot-reload automatically
2. **Manifest changes**: Require page refresh
3. **Database changes**: Create migration file

### Debugging

Check browser console for:
- Authentication errors
- API request/response
- Component render errors

Check terminal for:
- Server-side errors
- API route logs
- Database query errors

## Best Practices Demonstrated

### ✅ Security
- All API routes validate authentication via `getAuthenticatedUser()`
- User data isolation via `withRLS()` helper (application-level RLS)
- Input validation with Zod
- Better Auth cookies (no token exposure in JavaScript)

### ✅ Performance
- TanStack Query for caching and deduplication
- Optimistic updates for instant UI feedback
- Lazy loading for components
- Loading states for async operations

### ✅ Code Quality
- TypeScript for type safety
- Comprehensive error handling
- Clear code comments
- Consistent naming conventions

### ✅ User Experience
- Loading indicators
- Error messages
- Empty states
- Responsive design

## Common Issues

### Module Not Showing in Sidebar
- Check `module.json` syntax (use JSON validator)
- Verify `routes` array is defined
- Restart dev server
- Check browser console for errors

### API Routes Returning 404
- Verify file path: `api/[route]/route.ts`
- Check `permissions.api: true` in manifest
- Clear `.next` folder: `rm -rf .next && npm run dev`

### Database Errors
- Ensure migrations are applied
- Check RLS policies are enabled
- Verify Supabase connection
- Check user authentication

### Widget Not Appearing
- Check `dashboard.widgets: true` in manifest
- Verify widget component exports correctly
- Check dashboard code includes module widgets
- Restart dev server

## Testing Checklist

Before publishing your module, test:

- [ ] Module appears in sidebar
- [ ] Main page loads without errors
- [ ] Authentication redirects work
- [ ] API endpoints require auth
- [ ] API endpoints validate input
- [ ] Database tables created successfully
- [ ] RLS policies enforce user isolation
- [ ] Dashboard widget appears and loads data
- [ ] Settings panel saves/loads correctly
- [ ] Module can be disabled and re-enabled
- [ ] No console errors in browser or terminal

## Publishing Your Module

When ready to share:

1. Remove this module's specific content
2. Update README with your module's purpose
3. Add LICENSE file (MIT recommended)
4. Create git repository
5. Tag version (e.g., v1.0.0)
6. Share repository URL

## Support

For module development questions:
- See `/docs/modules.md` for complete specification
- Check ARI documentation
- Open issue in ARI repository

## License

This template is part of the ARI project and follows the same license.

---

**Happy Module Building! 🚀**
