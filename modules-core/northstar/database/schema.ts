import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, date, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const northstar = pgTable("northstar", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text().notNull(),
	category: text(),
	priority: text().default('medium'),
	deadline: date(),
	progress: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	userId: uuid("user_id").notNull(),
	displayPriority: integer("display_priority").default(3),
}, (table) => [
	index("idx_goals_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_goals_priority").using("btree", table.priority.asc().nullsLast().op("text_ops")),
	index("idx_goals_progress").using("btree", table.progress.asc().nullsLast().op("int4_ops")),
	index("idx_goals_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("northstar_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("northstar_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("northstar_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("northstar_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("goals_priority_check", sql`priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])`),
	check("goals_progress_check", sql`(progress >= 0) AND (progress <= 100)`),
	check("northstar_display_priority_check", sql`(display_priority >= 1) AND (display_priority <= 5)`),
]);
