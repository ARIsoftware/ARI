import { pgTable, index, pgPolicy, uuid, text, timestamp, varchar, integer, foreignKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const boardAdvisors = pgTable("board_advisors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: varchar({ length: 2000 }).notNull(),
	color: varchar({ length: 20 }).notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	sex: varchar({ length: 16 }).notNull().default('not_specified'),
	voiceId: varchar("voice_id", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_board_advisors_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_board_advisors_user_sort").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	pgPolicy("board_advisors_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_advisors_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_advisors_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_advisors_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const boardConversations = pgTable("board_conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: varchar({ length: 200 }).notNull().default('New discussion'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_board_conversations_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_board_conversations_user_updated").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	pgPolicy("board_conversations_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_conversations_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_conversations_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_conversations_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const boardMessages = pgTable("board_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	userId: text("user_id").notNull(),
	role: varchar({ length: 16 }).notNull(),
	advisorId: uuid("advisor_id"),
	advisorName: varchar("advisor_name", { length: 100 }),
	advisorColor: varchar("advisor_color", { length: 20 }),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_board_messages_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_board_messages_conversation_created").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_board_messages_advisor_id").using("btree", table.advisorId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
		columns: [table.conversationId],
		foreignColumns: [boardConversations.id],
		name: "board_messages_conversation_id_fkey",
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.advisorId],
		foreignColumns: [boardAdvisors.id],
		name: "board_messages_advisor_id_fkey",
	}).onDelete("set null"),
	pgPolicy("board_messages_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_messages_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_messages_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("board_messages_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])
