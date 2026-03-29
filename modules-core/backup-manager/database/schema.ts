import { pgTable, index, foreignKey, uuid, text, timestamp, integer, varchar, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "@/lib/db/schema/core-schema"

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
