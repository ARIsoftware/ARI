import { pgTable, index, uuid, text, timestamp, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const prospects = pgTable("prospects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	position: text().notNull(),
	graduationYear: integer("graduation_year").notNull(),
	school: text().notNull().default(''),
	height: text().notNull().default(''),
	rating: integer().notNull().default(3),
	notes: text(),
	evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("idx_prospects_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_prospects_graduation_year").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.graduationYear.asc().nullsLast()),
	index("idx_prospects_rating").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.rating.asc().nullsLast()),
]);
