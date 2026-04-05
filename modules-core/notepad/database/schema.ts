import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const notepad = pgTable("notepad", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("idx_notepad_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("notepad_user_id_key").on(table.userId),
	pgPolicy("notepad_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("notepad_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("notepad_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("notepad_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);

export const notepadRevisions = pgTable("notepad_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	revisionNumber: integer("revision_number").notNull(),
}, (table) => [
	index("idx_notepad_revisions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_notepad_revisions_user_revision").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.revisionNumber.desc().nullsFirst().op("int4_ops")),
	pgPolicy("notepad_revisions_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("notepad_revisions_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("notepad_revisions_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("notepad_revisions_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
