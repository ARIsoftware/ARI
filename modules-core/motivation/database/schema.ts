import { pgTable, index, uniqueIndex, pgPolicy, uuid, text, integer, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const motivationVideos = pgTable("motivation_videos", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	youtubeId: text("youtube_id").notNull(),
	url: text().notNull(),
	title: text(),
	channel: text(),
	thumbnailUrl: text("thumbnail_url"),
	position: integer().notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	uniqueIndex("uniq_motivation_videos_user_youtube").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.youtubeId.asc().nullsLast().op("text_ops")),
	index("idx_motivation_videos_user_position").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.position.asc().nullsLast().op("int4_ops")),
	index("idx_motivation_videos_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	pgPolicy("motivation_videos_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("motivation_videos_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("motivation_videos_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))`, withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
	pgPolicy("motivation_videos_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]);
