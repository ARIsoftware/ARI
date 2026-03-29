import { pgTable, index, pgPolicy, uuid, text, timestamp, date, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const gratitudeEntries = pgTable("gratitude_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	entryDate: date("entry_date").default(sql`CURRENT_DATE`).notNull(),
	question1: text(),
	question2: text(),
	question3: text(),
	question4: text(),
	question5: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_gratitude_entries_entry_date").using("btree", table.entryDate.desc().nullsFirst().op("date_ops")),
	index("idx_gratitude_entries_user_date").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.entryDate.desc().nullsFirst().op("uuid_ops")),
	index("idx_gratitude_entries_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("gratitude_entries_user_id_entry_date_key").on(table.userId, table.entryDate),
	pgPolicy("gratitude_entries_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("gratitude_entries_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("gratitude_entries_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("gratitude_entries_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
