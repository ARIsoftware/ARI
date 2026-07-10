import { pgTable, index, uniqueIndex, pgPolicy, uuid, text, timestamp, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Mirrors modules-custom/morning-brief/database/schema.sql
// User isolation is enforced in API routes via withRLS(); the policies here are
// defense-in-depth and reference current_setting('app.current_user_id').

export const morningBriefGoogleTokens = pgTable("morning_brief_google_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	// access_token + refresh_token are stored encrypted (lib/crypto encrypt()).
	accessToken: text("access_token"),
	refreshToken: text("refresh_token").notNull(),
	tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true, mode: 'string' }),
	googleEmail: text("google_email"),
	scope: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	uniqueIndex("idx_morning_brief_google_tokens_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	pgPolicy("morning_brief_google_tokens_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_google_tokens_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_google_tokens_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_google_tokens_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]);

export const morningBriefIcalSubscriptions = pgTable("morning_brief_ical_subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	// The secret .ics feed URL, stored encrypted (lib/crypto encrypt()).
	icsUrl: text("ics_url").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	uniqueIndex("idx_morning_brief_ical_subscriptions_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	pgPolicy("morning_brief_ical_subscriptions_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_ical_subscriptions_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_ical_subscriptions_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_ical_subscriptions_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]);

export const morningBriefGreetings = pgTable("morning_brief_greetings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	briefDate: date("brief_date").notNull(),
	greeting: text().notNull(),
	message: text().notNull(),
	provider: text(),
	model: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	uniqueIndex("idx_morning_brief_greetings_user_date").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.briefDate.asc().nullsLast().op("date_ops")),
	pgPolicy("morning_brief_greetings_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_greetings_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_greetings_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("morning_brief_greetings_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]);
