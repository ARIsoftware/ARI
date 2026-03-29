import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, boolean, check, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const hyroxWorkouts = pgTable("hyrox_workouts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	totalTime: integer("total_time").notNull(),
	completed: boolean().default(false),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	userId: uuid("user_id").notNull(),
}, (table) => [
	index("idx_hyrox_workouts_completed").using("btree", table.completed.asc().nullsLast().op("bool_ops")),
	index("idx_hyrox_workouts_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("hyrox_workouts_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_workouts_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_workouts_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_workouts_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);

export const hyroxWorkoutStations = pgTable("hyrox_workout_stations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workoutId: uuid("workout_id"),
	stationName: text("station_name").notNull(),
	stationOrder: integer("station_order").notNull(),
	stationTime: integer("station_time"),
	completed: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	userIds: text("user_ids").array().default([""]),
	userId: uuid("user_id").notNull(),
}, (table) => [
	index("idx_hyrox_workout_stations_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_hyrox_workout_stations_user_ids").using("gin", table.userIds.asc().nullsLast().op("array_ops")),
	index("idx_hyrox_workout_stations_workout_id").using("btree", table.workoutId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("hyrox_workout_stations_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_workout_stations_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_workout_stations_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_workout_stations_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("hyrox_station_records_station_type_check", sql`station_type = ANY (ARRAY['run'::text, 'exercise'::text])`),
]);

export const hyroxStationRecords = pgTable("hyrox_station_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	stationName: text("station_name").notNull(),
	stationType: text("station_type").notNull(),
	distance: text().notNull(),
	bestTime: integer("best_time").notNull(),
	goalTime: integer("goal_time").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_hyrox_station_records_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("hyrox_station_records_user_id_station_name_key").on(table.userId, table.stationName),
	pgPolicy("hyrox_station_records_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_station_records_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_station_records_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("hyrox_station_records_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("hyrox_station_records_station_type_check", sql`station_type = ANY (ARRAY['run'::text, 'exercise'::text])`),
]);
