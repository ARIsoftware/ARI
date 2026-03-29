import { pgTable, index, pgPolicy, uuid, text, timestamp, date, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const majorProjects = pgTable("major_projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	projectName: varchar("project_name", { length: 255 }).notNull(),
	projectDescription: text("project_description"),
	projectDueDate: date("project_due_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_major_projects_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_major_projects_due_date").using("btree", table.projectDueDate.asc().nullsLast().op("date_ops")),
	index("idx_major_projects_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("major_projects_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("major_projects_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("major_projects_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("major_projects_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
