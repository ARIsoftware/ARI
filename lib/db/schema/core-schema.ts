import { pgTable, index, foreignKey, pgPolicy, uuid, text, timestamp, integer, check, date, boolean, unique, numeric, jsonb, serial, varchar, doublePrecision } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// =============================================================================
// BETTER AUTH TABLES
// =============================================================================

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
	twoFactorEnabled: boolean().default(false),
}, (table) => [
	index("idx_user_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	unique("user_email_key").on(table.email),
	pgPolicy("user_rls_all", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true` }),
]);

export const twoFactor = pgTable("twoFactor", {
	id: text().primaryKey().notNull(),
	secret: text().notNull(),
	backupCodes: text().notNull(),
	userId: text().notNull(),
}, (table) => [
	index("idx_two_factor_secret").using("btree", table.secret.asc().nullsLast().op("text_ops")),
	index("idx_two_factor_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "twoFactor_userId_fkey"
	}).onDelete("cascade"),
	pgPolicy("twoFactor_rls_all", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true` }),
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
	pgPolicy("session_rls_all", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true` }),
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
	pgPolicy("account_rls_all", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true` }),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy("verification_rls_all", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true` }),
]);

// =============================================================================
// SYSTEM TABLES
// =============================================================================

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
	pgPolicy("module_settings_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("module_settings_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("module_settings_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("module_settings_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
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
	pgPolicy("module_migrations_rls_all", { as: "permissive", for: "all", to: ["public"], using: sql`true`, withCheck: sql`true` }),
]);

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
	pgPolicy("user_feature_preferences_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("user_feature_preferences_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("user_feature_preferences_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("user_feature_preferences_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);

// =============================================================================
// SHARED TABLES (not owned by any specific module)
// =============================================================================

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
	pgPolicy("contribution_graph_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("contribution_graph_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("contribution_graph_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("contribution_graph_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("contribution_graph_box_index_check", sql`(box_index >= 0) AND (box_index < 18)`),
	check("contribution_graph_color_check", sql`(color)::text = ANY ((ARRAY['light-grey'::character varying, 'dark-grey'::character varying, 'black'::character varying, 'green'::character varying, 'red'::character varying])::text[])`),
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
	pgPolicy("journal_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("journal_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("journal_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("journal_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);
