import { pgTable, index, foreignKey, uuid, text, timestamp, integer, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

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
