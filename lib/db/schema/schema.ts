import { pgTable, index, foreignKey, pgPolicy, uuid, text, timestamp, integer, check, date, boolean, unique, numeric, jsonb, serial, varchar, doublePrecision } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const notepadRevisions = pgTable("notepad_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	revisionNumber: integer("revision_number").notNull(),
}, (table) => [
	index("idx_notepad_revisions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_notepad_revisions_user_revision").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.revisionNumber.desc().nullsFirst().op("int4_ops")),
	pgPolicy("Users can delete own notepad revisions", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert own notepad revisions", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can view own notepad revisions", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("notepad_revisions_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("notepad_revisions_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("notepad_revisions_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("notepad_revisions_update", { as: "permissive", for: "update", to: ["public"] }),
]);

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
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
}, (table) => [
	index("idx_fitness_database_completion_count").using("btree", table.completionCount.asc().nullsLast().op("int4_ops")),
	index("idx_fitness_database_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own fitness tasks", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own fitness tasks", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own fitness tasks", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own fitness tasks", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("fitness_database_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("fitness_database_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("fitness_database_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("fitness_database_update", { as: "permissive", for: "update", to: ["public"] }),
	check("fitness_database_priority_check", sql`priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])`),
	check("fitness_database_status_check", sql`status = ANY (ARRAY['Pending'::text, 'In Progress'::text, 'Completed'::text])`),
]);

export const gratitudeEntries = pgTable("gratitude_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	entryDate: date("entry_date").default(sql`CURRENT_DATE`).notNull(),
	question1: text(),
	question2: text(),
	question3: text(),
	question4: text(),
	question5: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_gratitude_entries_entry_date").using("btree", table.entryDate.desc().nullsFirst().op("date_ops")),
	index("idx_gratitude_entries_user_date").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.entryDate.desc().nullsFirst().op("uuid_ops")),
	index("idx_gratitude_entries_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("gratitude_entries_user_id_entry_date_key").on(table.userId, table.entryDate),
	pgPolicy("Users can delete their own gratitude entries", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own gratitude entries", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own gratitude entries", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own gratitude entries", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("gratitude_entries_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("gratitude_entries_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("gratitude_entries_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("gratitude_entries_update", { as: "permissive", for: "update", to: ["public"] }),
]);

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
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	displayPriority: integer("display_priority").default(3),
}, (table) => [
	index("idx_goals_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_goals_priority").using("btree", table.priority.asc().nullsLast().op("text_ops")),
	index("idx_goals_progress").using("btree", table.progress.asc().nullsLast().op("int4_ops")),
	index("idx_goals_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own goals", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own goals", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own goals", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own goals", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("northstar_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("northstar_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("northstar_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("northstar_update", { as: "permissive", for: "update", to: ["public"] }),
	check("goals_priority_check", sql`priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])`),
	check("goals_progress_check", sql`(progress >= 0) AND (progress <= 100)`),
	check("northstar_display_priority_check", sql`(display_priority >= 1) AND (display_priority <= 5)`),
]);

export const tasks = pgTable("tasks", {
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
	userEmail: text("user_email"),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	impact: integer().default(3),
	severity: integer().default(3),
	timeliness: integer().default(3),
	effort: integer().default(3),
	strategicFit: integer("strategic_fit").default(3),
	priorityScore: numeric("priority_score", { precision: 10, scale:  4 }).default('0'),
	projectId: uuid("project_id"),
	monsterType: text("monster_type"),
	monsterColors: jsonb("monster_colors"),
}, (table) => [
	index("idx_ari_database_completed").using("btree", table.completed.asc().nullsLast().op("bool_ops")),
	index("idx_ari_database_completion_count").using("btree", table.completionCount.asc().nullsLast().op("int4_ops")),
	index("idx_ari_database_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_ari_database_order").using("btree", table.orderIndex.asc().nullsLast().op("int4_ops")),
	index("idx_ari_database_starred").using("btree", table.pinned.asc().nullsLast().op("bool_ops")),
	index("idx_ari_database_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_tasks_monster_type").using("btree", table.monsterType.asc().nullsLast().op("text_ops")),
	index("idx_tasks_priority_score").using("btree", table.priorityScore.asc().nullsLast().op("numeric_ops")),
	index("idx_tasks_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_tasks_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own completion history", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Users can delete their own fitness history", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can insert their own completion history", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can insert their own fitness history", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own completion history", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can update their own fitness history", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own completion history", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can view their own fitness history", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("fitness_completion_history_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("fitness_completion_history_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("fitness_completion_history_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("fitness_completion_history_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const motivationContent = pgTable("motivation_content", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: text().notNull(),
	title: text(),
	url: text(),
	thumbnailUrl: text("thumbnail_url"),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	position: integer().notNull(),
}, (table) => [
	index("idx_motivation_content_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_motivation_content_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_motivation_content_user_position").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.position.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can create own motivation content", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() = user_id)`  }),
	pgPolicy("Users can delete own motivation content", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can update own motivation content", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view own motivation content", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("motivation_content_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("motivation_content_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("motivation_content_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("motivation_content_update", { as: "permissive", for: "update", to: ["public"] }),
	check("motivation_content_type_check", sql`type = ANY (ARRAY['youtube'::text, 'instagram'::text, 'photo'::text, 'twitter'::text])`),
]);

export const notepad = pgTable("notepad", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("idx_notepad_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("notepad_user_id_key").on(table.userId),
	pgPolicy("Users can delete own notepad", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert own notepad", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update own notepad", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view own notepad", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("notepad_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("notepad_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("notepad_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("notepad_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const moduleMigrations = pgTable("module_migrations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	moduleId: varchar("module_id", { length: 255 }).notNull(),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	appliedBy: uuid("applied_by"),
}, (table) => [
	index("idx_module_migrations_module_id").using("btree", table.moduleId.asc().nullsLast().op("text_ops")),
	unique("module_migrations_module_id_migration_name_key").on(table.moduleId, table.migrationName),
	pgPolicy("All users can view module migrations", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	pgPolicy("Service role can manage migrations", { as: "permissive", for: "all", to: ["service_role"] }),
]);

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
	pgPolicy("Users can create own shipments", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() = user_id)`  }),
	pgPolicy("Users can delete own shipments", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can update own shipments", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view own shipments", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("shipments_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("shipments_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("shipments_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("shipments_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const moduleSettings = pgTable("module_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	moduleId: varchar("module_id", { length: 255 }).notNull(),
	enabled: boolean().default(true),
	settings: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_module_settings_module_id").using("btree", table.moduleId.asc().nullsLast().op("text_ops")),
	index("idx_module_settings_user_enabled").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.enabled.asc().nullsLast().op("uuid_ops")),
	index("idx_module_settings_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("module_settings_user_id_module_id_key").on(table.userId, table.moduleId),
	pgPolicy("Users can manage their own module settings", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
	pgPolicy("module_settings_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("module_settings_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("module_settings_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("module_settings_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const contacts = pgTable("contacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	phone: text().notNull(),
	category: text().notNull(),
	description: text(),
	company: text(),
	address: text(),
	website: text(),
	birthday: date(),
	nextContactDate: date("next_contact_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	userId: uuid("user_id").notNull(),
}, (table) => [
	index("idx_contacts_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_contacts_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_contacts_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can view their own contacts", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("contacts_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("contacts_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("contacts_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("contacts_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const hyroxWorkouts = pgTable("hyrox_workouts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	totalTime: integer("total_time").notNull(),
	completed: boolean().default(false),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
}, (table) => [
	index("idx_hyrox_workouts_completed").using("btree", table.completed.asc().nullsLast().op("bool_ops")),
	index("idx_hyrox_workouts_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own hyrox workouts", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own hyrox workouts", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own hyrox workouts", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own Hyrox workouts", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("Users can view their own hyrox workouts", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hyrox_workouts_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("hyrox_workouts_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("hyrox_workouts_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hyrox_workouts_update", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("authenticated_access", { as: "permissive", for: "all", to: ["authenticated"] }),
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
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
}, (table) => [
	index("idx_hyrox_workout_stations_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_hyrox_workout_stations_user_ids").using("gin", table.userIds.asc().nullsLast().op("array_ops")),
	index("idx_hyrox_workout_stations_workout_id").using("btree", table.workoutId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own hyrox records", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Users can delete their own hyrox station records", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can insert their own hyrox records", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can insert their own hyrox station records", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own hyrox records", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can update their own hyrox station records", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own hyrox records", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can view their own hyrox station records", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hyrox_station_records_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("hyrox_station_records_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("hyrox_station_records_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hyrox_station_records_update", { as: "permissive", for: "update", to: ["public"] }),
	check("hyrox_station_records_station_type_check", sql`station_type = ANY (ARRAY['run'::text, 'exercise'::text])`),
]);

export const journal = pgTable("journal", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	entryType: varchar("entry_type", { length: 50 }).default('winter_arc').notNull(),
	limitingThoughts: text("limiting_thoughts"),
	barrierBehaviors: text("barrier_behaviors"),
	stuckEmotions: text("stuck_emotions"),
	empoweringThoughts: text("empowering_thoughts"),
	dailyBehaviors: text("daily_behaviors"),
	reinforcementPractices: text("reinforcement_practices"),
	futureFeelings: text("future_feelings"),
	embodyNow: text("embody_now"),
	dailyActions: text("daily_actions"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_journal_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_journal_entry_type").using("btree", table.entryType.asc().nullsLast().op("text_ops")),
	index("idx_journal_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own journal entries", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own journal entries", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own journal entries", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own journal entries", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("journal_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("journal_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("journal_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("journal_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const userFeaturePreferences = pgTable("user_feature_preferences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	featureName: text("feature_name").notNull(),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
}, (table) => [
	index("idx_user_feature_preferences_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("user_feature_preferences_user_id_feature_name_key").on(table.userId, table.featureName),
	pgPolicy("Users can delete their own feature preferences", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own feature preferences", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own feature preferences", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own feature preferences", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("user_feature_preferences_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("user_feature_preferences_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("user_feature_preferences_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("user_feature_preferences_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const helloWorldEntries = pgTable("hello_world_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	message: varchar({ length: 500 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_hello_world_entries_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_hello_world_entries_user_created").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_hello_world_entries_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own hello world entries", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own hello world entries", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own hello world entries", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own hello world entries", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hello_world_entries_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("hello_world_entries_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("hello_world_entries_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hello_world_entries_update", { as: "permissive", for: "update", to: ["public"] }),
]);

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
	pgPolicy("Users can delete their own projects", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own projects", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own projects", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own projects", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("major_projects_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("major_projects_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("major_projects_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("major_projects_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const contributionGraph = pgTable("contribution_graph", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	goalId: uuid("goal_id").notNull(),
	boxIndex: integer("box_index").notNull(),
	color: varchar({ length: 20 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_contribution_graph_user_goal").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.goalId.asc().nullsLast().op("uuid_ops")),
	index("idx_contribution_graph_user_goal_box").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.goalId.asc().nullsLast().op("uuid_ops"), table.boxIndex.asc().nullsLast().op("uuid_ops")),
	index("idx_contribution_graph_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	unique("contribution_graph_user_id_goal_id_box_index_key").on(table.userId, table.goalId, table.boxIndex),
	pgPolicy("Users can delete own contribution graph", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert own contribution graph", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update own contribution graph", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view own contribution graph", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("contribution_graph_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("contribution_graph_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("contribution_graph_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("contribution_graph_update", { as: "permissive", for: "update", to: ["public"] }),
	check("contribution_graph_box_index_check", sql`(box_index >= 0) AND (box_index < 18)`),
	check("contribution_graph_color_check", sql`(color)::text = ANY ((ARRAY['light-grey'::character varying, 'dark-grey'::character varying, 'black'::character varying, 'green'::character varying, 'red'::character varying])::text[])`),
]);

export const winterArcGoals = pgTable("winter_arc_goals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: text().notNull(),
	completed: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_winter_arc_goals_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can delete their own winter arc goals", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own winter arc goals", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own winter arc goals", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own winter arc goals", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("winter_arc_goals_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("winter_arc_goals_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("winter_arc_goals_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("winter_arc_goals_update", { as: "permissive", for: "update", to: ["public"] }),
]);

export const quotes = pgTable("quotes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	quote: text().notNull(),
	author: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("quotes_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("quotes_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("Users can view their own quotes", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("quotes_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("quotes_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("quotes_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("quotes_update", { as: "permissive", for: "update", to: ["public"] }),
]);

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
	pgPolicy("Users can delete their own travel tasks", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own travel tasks", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own travel tasks", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own travel tasks", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("travel_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("travel_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("travel_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("travel_update", { as: "permissive", for: "update", to: ["public"] }),
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
	pgPolicy("Users can delete their own travel activities", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own travel activities", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own travel activities", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own travel activities", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("travel_activities_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("travel_activities_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("travel_activities_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("travel_activities_update", { as: "permissive", for: "update", to: ["public"] }),
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
	pgPolicy("Users can view their own travel flights", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can insert their own travel flights", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own travel flights", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can delete their own travel flights", { as: "permissive", for: "delete", to: ["public"] }),
]);

export const ohtaniGridCells = pgTable("ohtani_grid_cells", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	rowIndex: integer("row_index").notNull(),
	colIndex: integer("col_index").notNull(),
	content: varchar({ length: 15 }).default(''),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ohtani_grid_cells_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_ohtani_grid_cells_user_position").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.rowIndex.asc().nullsLast().op("uuid_ops"), table.colIndex.asc().nullsLast().op("uuid_ops")),
	unique("ohtani_grid_cells_user_id_row_index_col_index_key").on(table.userId, table.rowIndex, table.colIndex),
	pgPolicy("Users can delete their own ohtani grid cells", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own ohtani grid cells", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own ohtani grid cells", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view their own ohtani grid cells", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("ohtani_grid_cells_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("ohtani_grid_cells_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("ohtani_grid_cells_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("ohtani_grid_cells_update", { as: "permissive", for: "update", to: ["public"] }),
	check("ohtani_grid_cells_col_index_check", sql`(col_index >= 0) AND (col_index <= 8)`),
	check("ohtani_grid_cells_row_index_check", sql`(row_index >= 0) AND (row_index <= 8)`),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text(),
	email: text().notNull(),
	emailVerified: boolean().default(false),
	image: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	firstName: text(),
	lastName: text(),
}, (table) => [
	index("idx_user_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	unique("user_email_key").on(table.email),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(id = (auth.uid())::text)`, withCheck: sql`(id = (auth.uid())::text)`  }),
	pgPolicy("Users can view own profile", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("user_all_operations", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("user_select_own", { as: "permissive", for: "select", to: ["public"] }),
]);

export const knowledgeArticles = pgTable("knowledge_articles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text().default('').notNull(),
	tags: text().array().default([""]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	collectionId: uuid("collection_id"),
	status: varchar({ length: 20 }).default('draft').notNull(),
	isFavorite: boolean("is_favorite").default(false).notNull(),
	isDeleted: boolean("is_deleted").default(false).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_knowledge_articles_collection_id").using("btree", table.collectionId.asc().nullsLast().op("uuid_ops")),
	index("idx_knowledge_articles_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_knowledge_articles_is_deleted").using("btree", table.isDeleted.asc().nullsLast().op("bool_ops")),
	index("idx_knowledge_articles_is_favorite").using("btree", table.isFavorite.asc().nullsLast().op("bool_ops")).where(sql`(is_favorite = true)`),
	index("idx_knowledge_articles_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_knowledge_articles_tags").using("gin", table.tags.asc().nullsLast().op("array_ops")),
	index("idx_knowledge_articles_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.collectionId],
			foreignColumns: [knowledgeCollections.id],
			name: "knowledge_articles_collection_id_fkey"
		}).onDelete("set null"),
	pgPolicy("knowledge_articles_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (app.current_user_id())::uuid)` }),
	pgPolicy("knowledge_articles_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("knowledge_articles_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("knowledge_articles_update", { as: "permissive", for: "update", to: ["public"] }),
	check("knowledge_articles_status_check", sql`(status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[])`),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	userId: text().notNull(),
	token: text().notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	ipAddress: text(),
	userAgent: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_session_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_session_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_userId_fkey"
		}).onDelete("cascade"),
	unique("session_token_key").on(table.token),
	pgPolicy("Users can delete own sessions", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`("userId" = (auth.uid())::text)` }),
	pgPolicy("Users can view own sessions", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("session_all_operations", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("session_select_own", { as: "permissive", for: "select", to: ["public"] }),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	userId: text().notNull(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	accessToken: text(),
	refreshToken: text(),
	accessTokenExpiresAt: timestamp({ withTimezone: true, mode: 'string' }),
	refreshTokenExpiresAt: timestamp({ withTimezone: true, mode: 'string' }),
	scope: text(),
	idToken: text(),
	password: text(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_account_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_userId_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can view own accounts", { as: "permissive", for: "select", to: ["authenticated"], using: sql`("userId" = (auth.uid())::text)` }),
	pgPolicy("account_all_operations", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("account_select_own", { as: "permissive", for: "select", to: ["public"] }),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy("verification_all_operations", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true`  }),
]);

export const knowledgeCollections = pgTable("knowledge_collections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	color: varchar({ length: 20 }).default('#6b7280'),
	icon: varchar({ length: 50 }).default('Folder'),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_knowledge_collections_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("knowledge_collections_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (app.current_user_id())::uuid)` }),
	pgPolicy("knowledge_collections_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("knowledge_collections_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("knowledge_collections_update", { as: "permissive", for: "update", to: ["public"] }),
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
	pgPolicy("hyrox_station_records_delete", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("hyrox_station_records_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("hyrox_station_records_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("hyrox_station_records_update", { as: "permissive", for: "update", to: ["public"] }),
	check("hyrox_station_records_station_type_check", sql`station_type = ANY (ARRAY['run'::text, 'exercise'::text])`),
]);

export const ariLaunchEntries = pgTable("ari_launch_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	dayNumber: integer("day_number").notNull(),
	title: varchar({ length: 3000 }).notNull(),
	orderIndex: integer("order_index").default(0),
	completed: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ari_launch_entries_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_ari_launch_entries_user_day").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.dayNumber.asc().nullsLast().op("int4_ops")),
	index("idx_ari_launch_entries_order").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.dayNumber.asc().nullsLast().op("int4_ops"), table.orderIndex.asc().nullsLast().op("int4_ops")),
	pgPolicy("Users can view their own ari_launch_entries", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert their own ari_launch_entries", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can update their own ari_launch_entries", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can delete their own ari_launch_entries", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("ari_launch_entries_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("ari_launch_entries_insert", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("ari_launch_entries_update", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("ari_launch_entries_delete", { as: "permissive", for: "delete", to: ["public"] }),
	check("ari_launch_entries_day_number_check", sql`(day_number >= 1) AND (day_number <= 45)`),
]);

// =============================================================================
// MEMENTO MODULE TABLES
// =============================================================================

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

// =============================================================================
// MAIL STREAM MODULE TABLES
// =============================================================================

export const mailStreamEvents = pgTable("mail_stream_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	eventCategory: varchar("event_category", { length: 20 }).notNull(),
	emailId: text("email_id"),
	fromAddress: text("from_address"),
	toAddresses: text("to_addresses").array(),
	subject: text(),
	status: varchar({ length: 30 }),
	bounceDetails: jsonb("bounce_details"),
	clickDetails: jsonb("click_details"),
	rawPayload: jsonb("raw_payload").notNull(),
	resendCreatedAt: timestamp("resend_created_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_mail_stream_events_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_mail_stream_events_event_category").using("btree", table.eventCategory.asc().nullsLast().op("text_ops")),
	index("idx_mail_stream_events_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_mail_stream_events_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_mail_stream_events_resend_created_at").using("btree", table.resendCreatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_mail_stream_events_email_id").using("btree", table.emailId.asc().nullsLast().op("text_ops")),
]);

export const mailStreamSettings = pgTable("mail_stream_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	retentionDays: integer("retention_days").default(-1).notNull(),
	setupComplete: boolean("setup_complete").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// =============================================================================
// USER PREFERENCES TABLE
// =============================================================================

export const userPreferences = pgTable("user_preferences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 255 }),
	email: varchar({ length: 255 }),
	title: varchar({ length: 255 }),
	companyName: varchar("company_name", { length: 255 }),
	country: varchar({ length: 100 }),
	city: varchar({ length: 100 }),
	linkedinUrl: varchar("linkedin_url", { length: 500 }),
	timezone: varchar({ length: 50 }).default('UTC'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_user_preferences_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("user_preferences_user_id_key").on(table.userId),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "user_preferences_user_id_fkey"
	}).onDelete("cascade"),
]);

// =============================================================================
// BACKUP MANAGER MODULE TABLES
// =============================================================================

export const backupMetadata = pgTable("backup_metadata", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	filename: varchar({ length: 255 }).notNull(),
	storageProvider: varchar("storage_provider", { length: 50 }).notNull(),
	storagePath: text("storage_path").notNull(),
	sizeBytes: integer("size_bytes"),
	tableCount: integer("table_count"),
	rowCount: integer("row_count"),
	checksum: varchar({ length: 64 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_backup_metadata_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_backup_metadata_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_backup_metadata_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_backup_metadata_storage_provider").using("btree", table.storageProvider.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "backup_metadata_user_id_fkey"
	}).onDelete("cascade"),
	check("backup_metadata_storage_provider_check", sql`(storage_provider)::text = ANY ((ARRAY['supabase'::character varying, 'r2'::character varying, 's3'::character varying])::text[])`),
]);

// =============================================================================
// DOCUMENTS MODULE TABLES
// =============================================================================

export const documentFolders = pgTable("document_folders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	parentId: uuid("parent_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_document_folders_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_document_folders_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_folders_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
		columns: [table.parentId],
		foreignColumns: [table.id],
		name: "document_folders_parent_id_fkey"
	}).onDelete("cascade"),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	originalName: varchar("original_name", { length: 255 }).notNull(),
	storageProvider: varchar("storage_provider", { length: 20 }).notNull(),
	storagePath: text("storage_path").notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	mimeType: varchar("mime_type", { length: 255 }).notNull(),
	folderId: uuid("folder_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_documents_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_documents_folder_id").using("btree", table.folderId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_documents_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_documents_mime_type").using("btree", table.mimeType.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.folderId],
		foreignColumns: [documentFolders.id],
		name: "documents_folder_id_fkey"
	}).onDelete("set null"),
	check("documents_storage_provider_check", sql`(storage_provider)::text = ANY ((ARRAY['supabase'::character varying, 'r2'::character varying, 's3'::character varying])::text[])`),
]);

export const documentTags = pgTable("document_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	color: varchar({ length: 7 }).default('#3b82f6').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_document_tags_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("document_tags_user_id_name_key").on(table.userId, table.name),
]);

export const documentTagAssignments = pgTable("document_tag_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_document_tag_assignments_document_id").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_tag_assignments_tag_id").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	unique("document_tag_assignments_document_tag_key").on(table.documentId, table.tagId),
	foreignKey({
		columns: [table.documentId],
		foreignColumns: [documents.id],
		name: "document_tag_assignments_document_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.tagId],
		foreignColumns: [documentTags.id],
		name: "document_tag_assignments_tag_id_fkey"
	}).onDelete("cascade"),
]);

// =============================================================================
// BASEBALL MODULE TABLES
// =============================================================================

export const baseballTeams = pgTable("baseball_teams", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	city: text().notNull(),
	league: text().notNull(),
	division: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
}, (table) => [
	index("idx_baseball_teams_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const baseballPlayers = pgTable("baseball_players", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	teamId: uuid("team_id"),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	position: text().notNull(),
	jerseyNumber: integer("jersey_number"),
	games: integer().notNull().default(0),
	atBats: integer("at_bats").notNull().default(0),
	hits: integer().notNull().default(0),
	homeRuns: integer("home_runs").notNull().default(0),
	rbi: integer().notNull().default(0),
	battingAvg: numeric("batting_avg", { precision: 4, scale: 3 }).notNull().default('0'),
	obp: numeric({ precision: 4, scale: 3 }).notNull().default('0'),
	slg: numeric({ precision: 4, scale: 3 }).notNull().default('0'),
	ops: numeric({ precision: 4, scale: 3 }).notNull().default('0'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`),
}, (table) => [
	index("idx_baseball_players_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_baseball_players_team_id").using("btree", table.teamId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
		columns: [table.teamId],
		foreignColumns: [baseballTeams.id],
		name: "baseball_players_team_id_fkey"
	}).onDelete("set null"),
]);
