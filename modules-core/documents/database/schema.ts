import { pgTable, index, foreignKey, uuid, text, timestamp, integer, varchar, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

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
