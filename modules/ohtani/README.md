# Ohtani Module

> A 9x9 grid module for personal organization and planning

## Overview

The Ohtani module provides a simple yet powerful 9x9 grid interface where each cell can contain up to 15 characters. Perfect for tracking goals, planning, or organizing thoughts in a structured visual format.

Inspired by the quote: *"I am not a product of my circumstances. I am a product of my decisions."*

## Features

- **9x9 Grid Layout**: 81 cells arranged in a clear, organized grid
- **Inline Editing**: Click any cell to edit its content
- **Visual Feedback**: Hover over cells to see edit icon
- **Character Limit**: Maximum 15 characters per cell
- **Persistent Storage**: All changes saved to database with RLS
- **User Isolation**: Each user has their own private grid

## Installation

1. **Enable the module** in Settings → Modules
2. **Apply database migrations** (see below)
3. **Navigate to** `/ohtani` to start using it

## Database Setup

### Required Tables

This module requires one database table: `ohtani_grid_cells`

### Applying Migrations

1. Copy the SQL from `/modules/ohtani/database/schema.sql`
2. Open your Supabase SQL Editor
3. Paste and run the SQL
4. Verify table created successfully
5. Return to ARI and mark migration as applied

## File Structure

```
modules/ohtani/
├── module.json                 # Module manifest
├── README.md                   # This file
│
├── app/
│   └── page.tsx               # Main 9x9 grid page at /ohtani
│
├── api/
│   └── data/
│       └── route.ts           # API handlers for grid cells
│
├── database/
│   └── schema.sql             # Database table definitions
│
└── types/
    └── index.ts               # TypeScript type definitions
```

## Usage

### Basic Usage

1. Navigate to `/ohtani`
2. Hover over any cell to see the edit icon (pencil)
3. Click the cell to start editing
4. Type your content (max 15 characters)
5. Press Enter or click outside to save
6. Press Escape to cancel editing

### Grid Organization

The grid is divided into nine 3x3 blocks (similar to Sudoku), making it easy to organize related items together. Use this structure to:

- Track 9 major goals with sub-tasks
- Plan weekly schedules
- Organize project phases
- Track habits across different categories
- Or any custom organizational system

## Technical Details

### Authentication

- All routes require Supabase authentication
- Each user has their own isolated grid data
- RLS policies enforce data privacy

### Database Schema

Each cell is stored with:
- `row_index`: 0-8 (grid row position)
- `col_index`: 0-8 (grid column position)
- `content`: String (max 15 characters)
- `user_id`: Links to authenticated user

### API Endpoints

- `GET /api/modules/ohtani/data` - Fetch all grid cells
- `PUT /api/modules/ohtani/data` - Update a specific cell

## Security

- Row Level Security (RLS) enabled on all tables
- User data completely isolated
- All API routes require authentication
- Input validation with Zod schemas

## Customization

You can customize the module by:

1. **Changing grid size**: Modify the grid dimensions in `page.tsx`
2. **Adjusting character limit**: Update the validation in `api/data/route.ts` and `page.tsx`
3. **Styling**: Customize colors, borders, and spacing in `page.tsx`
4. **Adding features**: Add color coding, categories, or other enhancements

## Support

For issues or questions about this module, please refer to the main ARI documentation or open an issue in the ARI repository.

## License

This module is part of the ARI project and follows the same license.
