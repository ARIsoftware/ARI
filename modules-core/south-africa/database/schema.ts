import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, date, boolean, check, varchar, jsonb, doublePrecision } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const travel = pgTable("travel", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }).notNull(),
	category: varchar({ length: 50 }).default('todo').notNull(),
	completed: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_travel_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_travel_completed_at").using("btree", table.completedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_travel_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_travel_user_category").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.category.asc().nullsLast().op("text_ops")),
	index("idx_travel_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("travel_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("travel_category_check", sql`(category)::text = ANY ((ARRAY['todo'::character varying, 'packing_list'::character varying, 'morning_routine'::character varying])::text[])`),
]);

export const travelActivities = pgTable("travel_activities", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }).notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	address: text().notNull(),
	activityType: varchar("activity_type", { length: 20 }).notNull(),
	lat: doublePrecision(),
	lng: doublePrecision(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_travel_activities_start_date").using("btree", table.startDate.asc().nullsLast().op("date_ops")),
	index("idx_travel_activities_type").using("btree", table.activityType.asc().nullsLast().op("text_ops")),
	index("idx_travel_activities_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("travel_activities_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_activities_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_activities_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_activities_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("travel_activities_activity_type_check", sql`(activity_type)::text = ANY ((ARRAY['stay'::character varying, 'event'::character varying])::text[])`),
]);

export const travelFlights = pgTable("travel_flights", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }).notNull(),
	duration: varchar({ length: 20 }).notNull(),
	legs: jsonb().notNull().default([]),
	transferTimes: jsonb("transfer_times").default([]),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_travel_flights_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_travel_flights_sort_order").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
	pgPolicy("travel_flights_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_flights_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_flights_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("travel_flights_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
