import { pgTable, index, pgPolicy, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ─── Drizzle Quick Reference ───────────────────────────────────────────
// This schema demonstrates the basics. For modules with richer data models,
// here are additional column types, constraints, and patterns you may need.
//
// COLUMN TYPES (import from "drizzle-orm/pg-core"):
//   integer("col_name")                                → INTEGER
//   boolean("col_name")                                → BOOLEAN
//   date("col_name")                                   → DATE (no time)
//   jsonb("col_name")                                  → JSONB
//   numeric("col_name", { precision: 5, scale: 2 })    → NUMERIC(5,2)
//   doublePrecision("col_name")                        → DOUBLE PRECISION
//   text("col_name").array()                           → TEXT[]
//
//   NOTE: numeric()/decimal() columns return STRINGS from Drizzle, not
//   numbers. Convert with Number() in API GET responses before sending to
//   the client, or prefer integer()/doublePrecision() when exact decimal
//   precision isn't required.
//
// CONSTRAINTS (import check, unique, foreignKey from "drizzle-orm/pg-core"):
//   check("status_check", sql`status = ANY(ARRAY['draft','published']::text[])`)
//   unique("user_date_key").on(table.userId, table.entryDate)
//   foreignKey({
//     columns: [table.collectionId],
//     foreignColumns: [otherTable.id],
//     name: "my_fk_name"
//   }).onDelete("cascade")   // or "set null", "restrict"
//
// RELATIONS (import { relations } from "drizzle-orm/relations"):
//   Define in a separate relations.ts file next to schema.ts.
//   export const parentRelations = relations(parentTable, ({ many }) => ({
//     children: many(childTable),
//   }))
//   export const childRelations = relations(childTable, ({ one }) => ({
//     parent: one(parentTable, {
//       fields: [childTable.parentId],
//       references: [parentTable.id],
//     }),
//   }))
//
// TYPE INFERENCE (import { InferSelectModel, InferInsertModel } from "drizzle-orm"):
//   type Entry = InferSelectModel<typeof myTable>       // SELECT row shape
//   type NewEntry = InferInsertModel<typeof myTable>     // INSERT row shape
//   This is an alternative to manually defining types in types/index.ts.
// ────────────────────────────────────────────────────────────────────────

export const moduleTemplateEntries = pgTable("module_template_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	message: varchar({ length: 500 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_module_template_entries_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_module_template_entries_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_module_template_entries_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	pgPolicy("module_template_entries_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("module_template_entries_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("module_template_entries_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("module_template_entries_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]);
