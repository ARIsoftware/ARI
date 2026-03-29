import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, date, boolean, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const fitnessDatabase = pgTable("fitness_database", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	assignees: text().array().default([""]),
	dueDate: date("due_date"),
	subtasksCompleted: integer("subtasks_completed").default(0),
	subtasksTotal: integer("subtasks_total").default(0),
	status: text().default('Pending'),
	priority: text().default('Medium'),
	pinned: boolean().default(false),
	completed: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	orderIndex: integer("order_index").default(0),
	completionCount: integer("completion_count").default(0),
	youtubeUrl: text("youtube_url"),
	userId: uuid("user_id").notNull(),
}, (table) => [
	index("idx_fitness_database_completion_count").using("btree", table.completionCount.asc().nullsLast().op("int4_ops")),
	index("idx_fitness_database_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("fitness_database_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("fitness_database_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("fitness_database_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("fitness_database_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("fitness_database_priority_check", sql`priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])`),
	check("fitness_database_status_check", sql`status = ANY (ARRAY['Pending'::text, 'In Progress'::text, 'Completed'::text])`),
]);
