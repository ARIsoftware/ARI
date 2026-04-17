import { pgTable, index, foreignKey, pgPolicy, uuid, text, timestamp, integer, boolean, varchar, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const knowledgeCollections = pgTable("knowledge_collections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	color: varchar({ length: 20 }).default('#6b7280'),
	icon: varchar({ length: 50 }).default('Folder'),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_knowledge_collections_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	pgPolicy("knowledge_collections_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("knowledge_collections_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("knowledge_collections_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("knowledge_collections_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
]);

export const knowledgeArticles = pgTable("knowledge_articles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
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
	index("idx_knowledge_articles_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.collectionId],
			foreignColumns: [knowledgeCollections.id],
			name: "knowledge_articles_collection_id_fkey"
		}).onDelete("set null"),
	pgPolicy("knowledge_articles_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("knowledge_articles_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("knowledge_articles_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("knowledge_articles_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("knowledge_articles_status_check", sql`(status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[])`),
]);
