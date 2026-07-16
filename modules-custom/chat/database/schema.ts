import { pgTable, index, pgPolicy, uuid, text, timestamp, varchar, integer, jsonb, foreignKey, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "@/lib/db/schema/core-schema"

export const chatConversations = pgTable("chat_conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: varchar({ length: 200 }).notNull().default('New chat'),
	provider: varchar({ length: 32 }).notNull(),
	model: varchar({ length: 128 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_chat_conversations_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_chat_conversations_user_updated").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "chat_conversations_user_id_fkey",
	}).onDelete("cascade"),
	check("chat_conversations_provider_check", sql`provider IN ('openai', 'anthropic', 'gemini', 'openrouter')`),
	pgPolicy("chat_conversations_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_conversations_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_conversations_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_conversations_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const chatMessages = pgTable("chat_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	userId: text("user_id").notNull(),
	role: varchar({ length: 16 }).notNull(),
	content: text().notNull(),
	attachments: jsonb().notNull().default(sql`'[]'::jsonb`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_chat_messages_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_chat_messages_conversation_created").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
		columns: [table.conversationId],
		foreignColumns: [chatConversations.id],
		name: "chat_messages_conversation_id_fkey",
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "chat_messages_user_id_fkey",
	}).onDelete("cascade"),
	check("chat_messages_role_check", sql`role IN ('user', 'assistant', 'system')`),
	pgPolicy("chat_messages_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_messages_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_messages_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_messages_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const chatUploads = pgTable("chat_uploads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	conversationId: uuid("conversation_id"),
	filename: varchar({ length: 512 }).notNull(),
	originalName: varchar("original_name", { length: 512 }).notNull(),
	mime: varchar({ length: 128 }).notNull(),
	size: integer().notNull(),
	bucket: varchar({ length: 64 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_chat_uploads_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_chat_uploads_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_chat_uploads_conversation_id").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
		columns: [table.conversationId],
		foreignColumns: [chatConversations.id],
		name: "chat_uploads_conversation_id_fkey",
	}).onDelete("set null"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "chat_uploads_user_id_fkey",
	}).onDelete("cascade"),
	check("chat_uploads_size_check", sql`size >= 0`),
	pgPolicy("chat_uploads_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_uploads_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_uploads_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("chat_uploads_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])
