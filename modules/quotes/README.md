# Quotes Module

A simple yet powerful module for managing and organizing your collection of inspirational quotes.

## Overview

The Quotes module allows users to:
- Create and save inspirational quotes with optional author attribution
- Edit existing quotes
- Delete quotes
- View all quotes in a beautiful grid layout
- See a random quote on the dashboard widget

## Features

- **CRUD Operations**: Full Create, Read, Update, Delete functionality
- **Dashboard Widget**: Displays quote count and a random inspirational quote
- **Settings Panel**: Customize display preferences (author visibility, cards per row, sort order)
- **User Isolation**: Each user's quotes are private via RLS policies
- **Responsive Design**: Works beautifully on all screen sizes
- **Search-friendly**: Indexed database for fast queries

## Module Structure

```
/modules/quotes/
├── module.json                    # Module manifest and configuration
├── README.md                      # This file
├── app/
│   └── page.tsx                  # Main quotes page
├── api/
│   ├── quotes/
│   │   └── route.ts              # CRUD API endpoints
│   └── settings/
│       └── route.ts              # Settings API endpoints
├── components/
│   ├── widget.tsx                # Dashboard widget
│   └── settings-panel.tsx        # Settings panel component
├── database/
│   ├── schema.sql                # Database schema with RLS
│   └── migrations/               # Future migrations
├── types/
│   └── index.ts                  # TypeScript interfaces
└── lib/
    └── (future utility functions)
```

## Installation

### 1. Database Setup

Run the schema SQL file in Supabase SQL Editor:

```bash
# Copy the contents of /modules/quotes/database/schema.sql
# Paste into Supabase Dashboard → SQL Editor
# Execute the SQL
```

This creates:
- `quotes` table with RLS policies
- Indexes for performance
- Triggers for automatic `updated_at` timestamp

### 2. Module Registration

The module is automatically discovered from the `/modules` directory. Add it to the MODULE_PAGES registry in `/app/[module]/[[...slug]]/page.tsx`:

```typescript
const MODULE_PAGES: Record<string, any> = {
  // ... other modules
  'quotes': () => import('@/modules/quotes/app/page')
}
```

### 3. Enable Module

Navigate to `/modules` in the app and enable the Quotes module for your user.

## API Routes

### GET /api/modules/quotes/quotes
Fetch all quotes for the authenticated user.

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "quote": "The only way to do great work is to love what you do.",
    "author": "Steve Jobs",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
]
```

### POST /api/modules/quotes/quotes
Create a new quote.

**Request:**
```json
{
  "quote": {
    "quote": "Quote text here",
    "author": "Author name (optional)"
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "quote": "Quote text here",
  "author": "Author name",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

### PUT /api/modules/quotes/quotes
Update an existing quote.

**Request:**
```json
{
  "id": "uuid",
  "updates": {
    "quote": "Updated quote text",
    "author": "Updated author"
  }
}
```

### DELETE /api/modules/quotes/quotes?id={uuid}
Delete a quote by ID.

**Response:**
```json
{
  "success": true
}
```

### GET /api/modules/quotes/settings
Get user's module settings.

**Response:**
```json
{
  "showAuthor": true,
  "cardsPerRow": 3,
  "defaultSortOrder": "desc"
}
```

### PUT /api/modules/quotes/settings
Update user's module settings.

**Request:**
```json
{
  "showAuthor": true,
  "cardsPerRow": 3,
  "defaultSortOrder": "desc"
}
```

## Database Schema

### quotes Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users (RLS) |
| quote | VARCHAR(1000) | Quote text |
| author | VARCHAR(200) | Author name (optional) |
| created_at | TIMESTAMP WITH TIME ZONE | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | Last update timestamp |

### RLS Policies

All CRUD operations enforce user isolation:
- Users can only view their own quotes
- Users can only create quotes for themselves
- Users can only update their own quotes
- Users can only delete their own quotes

## TypeScript Types

```typescript
interface Quote {
  id: string
  user_id: string
  quote: string
  author?: string | null
  created_at: string
  updated_at: string
}

interface QuoteInput {
  quote: string
  author?: string | null
}

interface QuotesSettings {
  showAuthor: boolean
  cardsPerRow: number
  defaultSortOrder: 'asc' | 'desc'
}
```

## Dashboard Widget

The dashboard widget displays:
- Total number of quotes saved
- A random quote for daily inspiration
- Author attribution (if available)
- Quick link to view all quotes

## Settings

Users can customize:
- **Show Author**: Toggle author name visibility on quote cards
- **Cards Per Row**: Choose between 1-4 cards per row
- **Sort Order**: Default sorting (newest first or oldest first)

## Development Notes

### Authentication
- All API routes require Bearer token authentication
- Use `useSupabase()` hook for session management
- RLS policies enforce user isolation at database level

### Validation
- Zod schemas validate all API inputs
- Quote text: 1-1000 characters (required)
- Author name: 0-200 characters (optional)
- UUID format validation for IDs

### Error Handling
- User-friendly error messages via toast notifications
- API errors logged to console
- Graceful fallbacks for empty states

### Performance
- Database indexes on user_id, created_at, and author
- Composite index for user + date queries
- Lazy loading for module page
- No unnecessary re-renders

## Future Enhancements

Potential features to add:
- [ ] Search and filter quotes by author or content
- [ ] Categories/tags for quotes
- [ ] Export quotes to PDF or text file
- [ ] Share quotes via link
- [ ] Favorite/pin quotes
- [ ] Quote of the day notification
- [ ] Import quotes from CSV or JSON

## Troubleshooting

### Quotes not loading
- Verify the `quotes` table exists in Supabase
- Check RLS policies are enabled and correct
- Ensure user is authenticated
- Check browser console for API errors

### Module not appearing in sidebar
- Verify module is enabled in `/modules` settings
- Check MODULE_PAGES registry includes 'quotes'
- Restart dev server after adding to registry
- Clear Next.js cache (delete `.next` folder)

### Settings not saving
- Ensure `module_settings` table exists
- Verify user is authenticated
- Check browser console for validation errors
- Confirm settings API route is working

## License

Part of the ARI application. See main LICENSE file.

## Author

ARI Team <ari@ari.software>

---

**Version:** 1.0.0
**Last Updated:** January 2025
