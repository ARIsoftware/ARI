import { pgTable, index, foreignKey, uuid, text, timestamp, bigint, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "@/lib/db/schema/core-schema"

export const documentFolders = pgTable("document_folders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	parentId: uuid("parent_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_document_folders_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_document_folders_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	// Composite partial index for the hot list path: live folders under a parent for a given user.
	index("idx_document_folders_user_parent")
		.using("btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.parentId.asc().nullsLast().op("uuid_ops"))
		.where(sql`deleted_at IS NULL`),
	// Partial index for the trash view (small subset of all rows).
	index("idx_document_folders_trash")
		.using("btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.deletedAt.desc().nullsFirst().op("timestamptz_ops"))
		.where(sql`deleted_at IS NOT NULL`),
	foreignKey({
		columns: [table.parentId],
		foreignColumns: [table.id],
		name: "document_folders_parent_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "document_folders_user_id_fkey"
	}).onDelete("cascade"),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	originalName: text("original_name").notNull(),
	storageProvider: text("storage_provider").notNull(),
	storagePath: text("storage_path").notNull(),
	storageBucket: text("storage_bucket"),
	sizeBytes: bigint("size_bytes", { mode: 'number' }).notNull(),
	mimeType: text("mime_type").notNull(),
	folderId: uuid("folder_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_documents_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_documents_folder_id").using("btree", table.folderId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_documents_name_search").using("gin", sql`to_tsvector('english', ${table.name})`),
	// Composite partial index for the hot list path: live docs by user, optionally
	// by folder, ordered by recency.
	index("idx_documents_user_folder_created")
		.using("btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.folderId.asc().nullsLast().op("uuid_ops"),
			table.createdAt.desc().nullsFirst().op("timestamptz_ops"))
		.where(sql`deleted_at IS NULL`),
	// Partial index for the trash view.
	index("idx_documents_trash")
		.using("btree",
			table.userId.asc().nullsLast().op("text_ops"),
			table.deletedAt.desc().nullsFirst().op("timestamptz_ops"))
		.where(sql`deleted_at IS NOT NULL`),
	foreignKey({
		columns: [table.folderId],
		foreignColumns: [documentFolders.id],
		name: "documents_folder_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "documents_user_id_fkey"
	}).onDelete("cascade"),
	// Required as the target of the composite FK on document_tag_assignments
	// (document_id, user_id). id is already unique on its own so this adds no
	// extra row-level restriction.
	unique("documents_id_user_id_key").on(table.id, table.userId),
	check("documents_storage_provider_check", sql`storage_provider = ANY (ARRAY['supabase', 'r2', 's3', 'local'])`),
]);

export const documentTags = pgTable("document_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	color: text().default('#3b82f6').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_document_tags_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("document_tags_user_id_name_key").on(table.userId, table.name),
	// Required as the target of the composite FK on document_tag_assignments
	// (tag_id, user_id).
	unique("document_tags_id_user_id_key").on(table.id, table.userId),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "document_tags_user_id_fkey"
	}).onDelete("cascade"),
	check("document_tags_color_check", sql`color ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'`),
]);

export const documentTagAssignments = pgTable("document_tag_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	documentId: uuid("document_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	index("idx_document_tag_assignments_document_id").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_tag_assignments_tag_id").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_tag_assignments_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("document_tag_assignments_document_tag_key").on(table.documentId, table.tagId),
	// Composite FKs enforce that the denormalized user_id matches the parent
	// row's user_id. Replaces the prior single-column FKs on document_id and
	// tag_id — cascade still fires because the composite FK targets the
	// parent row.
	foreignKey({
		columns: [table.documentId, table.userId],
		foreignColumns: [documents.id, documents.userId],
		name: "document_tag_assignments_document_user_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.tagId, table.userId],
		foreignColumns: [documentTags.id, documentTags.userId],
		name: "document_tag_assignments_tag_user_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [user.id],
		name: "document_tag_assignments_user_id_fkey"
	}).onDelete("cascade"),
]);
