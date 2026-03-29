import { pgTable, index, pgPolicy, uuid, text, timestamp, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const shipments = pgTable("shipments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: text().notNull(),
	trackingCode: text("tracking_code"),
	trackingLink: text("tracking_link"),
	carrier: text(),
	status: text().default('pending'),
	expectedDelivery: date("expected_delivery"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_shipments_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("shipments_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("shipments_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("shipments_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("shipments_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
