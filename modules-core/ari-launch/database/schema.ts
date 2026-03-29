import { pgTable, index, pgPolicy, uuid, timestamp, integer, boolean, varchar, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const ariLaunchEntries = pgTable("ari_launch_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	dayNumber: integer("day_number").notNull(),
	title: varchar({ length: 3000 }).notNull(),
	orderIndex: integer("order_index").default(0),
	completed: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ari_launch_entries_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_ari_launch_entries_user_day").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.dayNumber.asc().nullsLast().op("int4_ops")),
	index("idx_ari_launch_entries_order").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.dayNumber.asc().nullsLast().op("int4_ops"), table.orderIndex.asc().nullsLast().op("int4_ops")),
	pgPolicy("ari_launch_entries_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("ari_launch_entries_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("ari_launch_entries_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("ari_launch_entries_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("ari_launch_entries_day_number_check", sql`(day_number >= 1) AND (day_number <= 45)`),
]);
