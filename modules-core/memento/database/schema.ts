import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, date, varchar, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const mementoSettings = pgTable("memento_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	birthdate: date().notNull(),
	targetLifespan: integer("target_lifespan").default(80).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_memento_settings_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("memento_settings_user_id_key").on(table.userId),
]);

export const mementoMilestones = pgTable("memento_milestones", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	weekNumber: integer("week_number").notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	category: varchar({ length: 50 }),
	mood: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_memento_milestones_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_memento_milestones_week").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.weekNumber.asc().nullsLast().op("int4_ops")),
	check("memento_milestones_mood_check", sql`(mood IS NULL) OR ((mood >= 1) AND (mood <= 5))`),
	check("memento_milestones_week_number_check", sql`week_number >= 0`),
]);

export const mementoEras = pgTable("memento_eras", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	color: varchar({ length: 7 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_memento_eras_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_memento_eras_dates").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.startDate.asc().nullsLast().op("date_ops"), table.endDate.asc().nullsLast().op("date_ops")),
]);
