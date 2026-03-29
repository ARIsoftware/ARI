import { pgTable, index, pgPolicy, uuid, text, timestamp, integer, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

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
	pgPolicy("motivation_content_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("motivation_content_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("motivation_content_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("motivation_content_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("motivation_content_type_check", sql`type = ANY (ARRAY['youtube'::text, 'instagram'::text, 'photo'::text, 'twitter'::text])`),
]);
