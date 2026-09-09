import { pgTable, index, pgPolicy, check, foreignKey, uuid, text, timestamp, varchar, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "@/lib/db/schema/core-schema"

export const timelineEvents = pgTable("timeline_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	eventDate: date("event_date").notNull(),
	color: varchar({ length: 7 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_timeline_events_user_date").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.eventDate.asc().nullsLast().op("date_ops")),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "timeline_events_user_id_fkey",
	}).onDelete("cascade"),
	check("timeline_events_color_hex", sql`color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'`),
	pgPolicy("timeline_events_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("timeline_events_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("timeline_events_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("timeline_events_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]);
