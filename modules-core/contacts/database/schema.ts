import { pgTable, index, pgPolicy, uuid, text, timestamp, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const contacts = pgTable("contacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	phone: text(),
	category: text().notNull(),
	description: text(),
	company: text(),
	address: text(),
	website: text(),
	birthday: date(),
	nextContactDate: date("next_contact_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	userId: text("user_id").notNull(),
}, (table) => [
	index("idx_contacts_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_contacts_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_contacts_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("contacts_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("contacts_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("contacts_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("contacts_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
