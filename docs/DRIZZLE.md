# Drizzle ORM Guide for ARI

This guide covers how Drizzle ORM is set up and used in the ARI application, including schema definitions, database connections, RLS integration, and query patterns.

---

## 1. Overview

ARI uses **Drizzle ORM** as the primary TypeScript ORM for database operations. Key characteristics:

- **Type-safe queries**: Full TypeScript support with inferred types
- **PostgreSQL dialect**: Configured for Supabase PostgreSQL
- **RLS integration**: Custom `withUserContext()` wrapper enforces Row Level Security
- **Schema-first**: Tables defined in TypeScript, introspected from existing database

### Dependencies

```json
{
  "drizzle-orm": "^0.45.1",
  "drizzle-kit": "^0.31.8",
  "pg": "^8.16.3"
}
```

---

## 2. Configuration

### `drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema/*',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

**Key settings:**
- **schema**: All schema files in `/lib/db/schema/`
- **out**: Migrations output to `/lib/db/migrations/`
- **dialect**: PostgreSQL (Supabase)
- **DATABASE_URL**: Connection string with pooler (port 6543 recommended)

---

## 3. Database Connection

### `/lib/db/index.ts`

The database module provides connection pooling and RLS-aware execution:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

export type DrizzleDb = ReturnType<typeof drizzle>
```

### `withUserContext()` - RLS-Aware Queries

**This is the primary function for user-scoped database operations:**

```typescript
export async function withUserContext<T>(
  userId: string,
  operation: (db: DrizzleDb) => Promise<T>
): Promise<T>
```

**How it works:**
1. Acquires a connection from the pool
2. Begins a transaction
3. Sets `app.current_user_id` for RLS policies
4. Executes your operation
5. Commits and releases connection

**Example usage:**

```typescript
import { withUserContext } from '@/lib/db'
import { tasks } from '@/lib/db/schema'

// SELECT - RLS filters automatically
const userTasks = await withUserContext(userId, async (db) => {
  return db.select().from(tasks).orderBy(desc(tasks.createdAt))
})

// INSERT - must set user_id explicitly!
await withUserContext(userId, async (db) => {
  return db.insert(tasks).values({
    title: 'New task',
    userId: userId,  // Required!
  })
})
```

**IMPORTANT**: RLS validates `user_id` but doesn't auto-populate it. Always set `userId` on INSERT operations.

### `withAdminDb()` - Admin Operations

For operations that bypass RLS (backup, migrations, etc.):

```typescript
export async function withAdminDb<T>(
  operation: (db: DrizzleDb) => Promise<T>
): Promise<T>
```

**Warning**: Only use for admin tasks. Never for user data operations.

---

## 4. Schema Definitions

### Location: `/lib/db/schema/schema.ts`

Tables are defined using Drizzle's PostgreSQL helpers:

```typescript
import {
  pgTable, uuid, text, timestamp, integer,
  boolean, index, pgPolicy, check, unique
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
```

### Table Definition Pattern

```typescript
export const quotes = pgTable("quotes", {
  // Primary key
  id: uuid().defaultRandom().primaryKey().notNull(),

  // User isolation
  userId: uuid("user_id").notNull(),

  // Data columns
  quote: text().notNull(),
  author: text(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
    .defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' })
    .defaultNow().notNull(),

}, (table) => [
  // Indexes
  index("quotes_user_id_idx").using("btree", table.userId.asc().nullsLast()),
  index("quotes_created_at_idx").using("btree", table.createdAt.desc().nullsFirst()),

  // RLS Policies
  pgPolicy("Users can view their own quotes", {
    as: "permissive",
    for: "select",
    to: ["public"],
    using: sql`(auth.uid() = user_id)`
  }),
  pgPolicy("quotes_insert", { as: "permissive", for: "insert", to: ["public"] }),
  pgPolicy("quotes_update", { as: "permissive", for: "update", to: ["public"] }),
  pgPolicy("quotes_delete", { as: "permissive", for: "delete", to: ["public"] }),
])
```

### Common Column Types

| Drizzle Type | PostgreSQL | Usage |
|--------------|------------|-------|
| `uuid()` | UUID | Primary keys, foreign keys |
| `text()` | TEXT | Unlimited text |
| `varchar({ length: n })` | VARCHAR(n) | Limited text |
| `integer()` | INTEGER | Numbers |
| `boolean()` | BOOLEAN | True/false |
| `timestamp({ withTimezone: true, mode: 'string' })` | TIMESTAMPTZ | Dates |
| `date()` | DATE | Date only |
| `jsonb()` | JSONB | JSON data |
| `numeric({ precision, scale })` | NUMERIC | Decimal numbers |
| `text().array()` | TEXT[] | Text arrays |

### Constraints

```typescript
// Check constraint
check("status_check", sql`status = ANY (ARRAY['draft', 'published']::text[])`)

// Unique constraint
unique("user_id_entry_date_key").on(table.userId, table.entryDate)

// Foreign key (see Relations section)
```

---

## 5. Relations

### Location: `/lib/db/schema/relations.ts`

Define relationships between tables for type-safe joins:

```typescript
import { relations } from "drizzle-orm/relations"
import { tasks, majorProjects } from "./schema"

// One-to-many: Project has many Tasks
export const majorProjectsRelations = relations(majorProjects, ({many}) => ({
  tasks: many(tasks),
}))

export const tasksRelations = relations(tasks, ({one}) => ({
  majorProject: one(majorProjects, {
    fields: [tasks.projectId],
    references: [majorProjects.id]
  }),
}))
```

### Foreign Keys in Schema

```typescript
import { foreignKey } from "drizzle-orm/pg-core"

export const knowledgeArticles = pgTable("knowledge_articles", {
  // ... columns
  collectionId: uuid("collection_id"),
}, (table) => [
  foreignKey({
    columns: [table.collectionId],
    foreignColumns: [knowledgeCollections.id],
    name: "knowledge_articles_collection_id_fkey"
  }).onDelete("set null"),
])
```

---

## 6. API Route Patterns

### Standard CRUD Route

```typescript
// /modules-core/[module]/api/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { myTable } from '@/lib/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

// Validation schema
const createSchema = z.object({
  title: z.string().min(1).max(255),
})

// GET - List all (RLS filters automatically)
export async function GET(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  if (!user || !withRLS) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const data = await withRLS((db) =>
    db.select().from(myTable).orderBy(desc(myTable.createdAt))
  )

  return NextResponse.json(toSnakeCase(data))
}

// POST - Create (must set userId)
export async function POST(request: NextRequest) {
  const validation = await validateRequestBody(request, createSchema)
  if (!validation.success) return validation.response

  const { user, withRLS } = await getAuthenticatedUser()
  if (!user || !withRLS) {
    return createErrorResponse('Authentication required', 401)
  }

  const data = await withRLS((db) =>
    db.insert(myTable)
      .values({ ...validation.data, userId: user.id })
      .returning()
  )

  return NextResponse.json(toSnakeCase(data[0]), { status: 201 })
}

// PUT - Update
export async function PUT(request: NextRequest) {
  // ... similar pattern with db.update()
}

// DELETE
export async function DELETE(request: NextRequest) {
  // ... similar pattern with db.delete()
}
```

### Using `getAuthenticatedUser()`

The auth helper provides:

```typescript
const { user, withRLS } = await getAuthenticatedUser()

// user: { id, email, user_metadata: { first_name, last_name, ... } }
// withRLS: (db) => Promise<T> - RLS-enforced database operations
```

---

## 7. Query Examples

### SELECT

```typescript
import { eq, desc, and, or, like, sql, count } from 'drizzle-orm'

// Basic select (RLS filters by user)
const items = await withRLS((db) =>
  db.select().from(myTable)
)

// With ordering
const items = await withRLS((db) =>
  db.select().from(myTable).orderBy(desc(myTable.createdAt))
)

// With where clause (additional to RLS)
const item = await withRLS((db) =>
  db.select().from(myTable).where(eq(myTable.id, itemId))
)

// Multiple conditions
const items = await withRLS((db) =>
  db.select().from(myTable).where(
    and(
      eq(myTable.status, 'active'),
      or(
        like(myTable.title, '%search%'),
        eq(myTable.priority, 'high')
      )
    )
  )
)

// Count
const [{ count: total }] = await withRLS((db) =>
  db.select({ count: count() }).from(myTable)
)

// Select specific columns
const items = await withRLS((db) =>
  db.select({ id: myTable.id, title: myTable.title }).from(myTable)
)
```

### INSERT

```typescript
// Single insert with returning
const [newItem] = await withRLS((db) =>
  db.insert(myTable)
    .values({
      title: 'New Item',
      userId: user.id,  // Always required!
    })
    .returning()
)

// Insert with SQL default
const [newItem] = await withRLS((db) =>
  db.insert(myTable)
    .values({
      title: 'New Item',
      userId: user.id,
      createdAt: sql`timezone('utc'::text, now())`,
    })
    .returning()
)
```

### UPDATE

```typescript
// Update by ID
const [updated] = await withRLS((db) =>
  db.update(myTable)
    .set({
      title: 'Updated Title',
      updatedAt: sql`timezone('utc'::text, now())`,
    })
    .where(eq(myTable.id, itemId))
    .returning()
)

// Check if update found a record
if (!updated) {
  return createErrorResponse('Not found or unauthorized', 404)
}
```

### DELETE

```typescript
// Delete by ID
await withRLS((db) =>
  db.delete(myTable).where(eq(myTable.id, itemId))
)
```

### Raw SQL

```typescript
import { sql } from 'drizzle-orm'

// Execute raw SQL
const result = await withAdminDb((db) =>
  db.execute(sql`SELECT * FROM pg_tables WHERE schemaname = 'public'`)
)
```

---

## 8. Adding a New Table

### Step 1: Create SQL Migration

Create a `.sql` file in `/migrations/`:

```sql
-- migrations/create_my_table.sql
CREATE TABLE IF NOT EXISTS my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_my_table_user_id
  ON my_table USING btree (user_id);

-- Enable RLS
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "my_table_select" ON my_table
  FOR SELECT TO public
  USING ((user_id = (app.current_user_id())::uuid) OR (auth.uid() = user_id));

CREATE POLICY "my_table_insert" ON my_table
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "my_table_update" ON my_table
  FOR UPDATE TO public
  USING ((user_id = (app.current_user_id())::uuid) OR (auth.uid() = user_id));

CREATE POLICY "my_table_delete" ON my_table
  FOR DELETE TO public
  USING ((user_id = (app.current_user_id())::uuid) OR (auth.uid() = user_id));
```

### Step 2: Run Migration

Execute the SQL in Supabase SQL Editor (per project rules, never edit database directly via code).

### Step 3: Introspect Schema

Pull the new table into Drizzle schema:

```bash
npx drizzle-kit introspect
```

Or manually add to `/lib/db/schema/schema.ts`:

```typescript
export const myTable = pgTable("my_table", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid("user_id").notNull(),
  title: varchar({ length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_my_table_user_id").using("btree", table.userId.asc().nullsLast()),
  pgPolicy("my_table_select", { as: "permissive", for: "select", to: ["public"] }),
  pgPolicy("my_table_insert", { as: "permissive", for: "insert", to: ["public"] }),
  pgPolicy("my_table_update", { as: "permissive", for: "update", to: ["public"] }),
  pgPolicy("my_table_delete", { as: "permissive", for: "delete", to: ["public"] }),
])
```

### Step 4: Add Relations (if needed)

In `/lib/db/schema/relations.ts`:

```typescript
import { myTable } from "./schema"

export const myTableRelations = relations(myTable, ({one}) => ({
  // Define relationships
}))
```

---

## 9. Drizzle Kit Commands

```bash
# Introspect existing database into schema
npx drizzle-kit introspect

# Generate migrations from schema changes
npx drizzle-kit generate

# Push schema to database (development only)
npx drizzle-kit push

# Open Drizzle Studio (database browser)
npx drizzle-kit studio
```

**Note**: Per project rules, use SQL files for migrations rather than `drizzle-kit push` in production.

---

## 10. Type Inference

Drizzle provides automatic type inference:

```typescript
import { myTable } from '@/lib/db/schema'
import { InferSelectModel, InferInsertModel } from 'drizzle-orm'

// Infer types from schema
type MyTableSelect = InferSelectModel<typeof myTable>
type MyTableInsert = InferInsertModel<typeof myTable>

// Use in function signatures
async function createItem(data: MyTableInsert): Promise<MyTableSelect> {
  // ...
}
```

---

## 11. Common Patterns

### Soft Delete

```typescript
// Schema
isDeleted: boolean("is_deleted").default(false).notNull(),
deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),

// Query active records only
const active = await withRLS((db) =>
  db.select().from(myTable).where(eq(myTable.isDeleted, false))
)

// Soft delete
await withRLS((db) =>
  db.update(myTable)
    .set({ isDeleted: true, deletedAt: sql`now()` })
    .where(eq(myTable.id, itemId))
)
```

### Upsert

```typescript
await withRLS((db) =>
  db.insert(myTable)
    .values({ userId: user.id, key: 'value' })
    .onConflictDoUpdate({
      target: [myTable.userId, myTable.key],
      set: { value: 'updated' }
    })
)
```

### Transactions

```typescript
// withUserContext already wraps operations in a transaction
// For multiple operations, include them in one callback:
await withRLS(async (db) => {
  await db.insert(tableA).values({ ... })
  await db.insert(tableB).values({ ... })
  // Both succeed or both fail
})
```

---

## 12. Troubleshooting

### "user_id cannot be null"
You forgot to set `userId` on INSERT. RLS validates but doesn't populate.

### "permission denied for table"
RLS policy is blocking access. Check that:
1. `withUserContext()` is being used
2. User ID matches the record's `user_id`
3. RLS policies exist for the operation

### Connection timeout
Check `DATABASE_URL` uses the connection pooler (port 6543).

### Type errors after schema change
Run `npx drizzle-kit introspect` to regenerate types.

---

## Quick Reference

| Task | Code |
|------|------|
| Get auth + DB | `const { user, withRLS } = await getAuthenticatedUser()` |
| Select all | `await withRLS(db => db.select().from(table))` |
| Insert | `await withRLS(db => db.insert(table).values({...}).returning())` |
| Update | `await withRLS(db => db.update(table).set({...}).where(eq(table.id, id)))` |
| Delete | `await withRLS(db => db.delete(table).where(eq(table.id, id)))` |
| Import operators | `import { eq, desc, and, or, sql } from 'drizzle-orm'` |
| Import schema | `import { myTable } from '@/lib/db/schema'` |
