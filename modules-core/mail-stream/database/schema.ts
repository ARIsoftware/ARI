import { pgTable, index, uuid, text, timestamp, integer, boolean, varchar, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const mailStreamEvents = pgTable("mail_stream_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	eventCategory: varchar("event_category", { length: 20 }).notNull(),
	emailId: text("email_id"),
	fromAddress: text("from_address"),
	toAddresses: text("to_addresses").array(),
	subject: text(),
	status: varchar({ length: 30 }),
	bounceDetails: jsonb("bounce_details"),
	clickDetails: jsonb("click_details"),
	rawPayload: jsonb("raw_payload").notNull(),
	resendCreatedAt: timestamp("resend_created_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_mail_stream_events_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_mail_stream_events_event_category").using("btree", table.eventCategory.asc().nullsLast().op("text_ops")),
	index("idx_mail_stream_events_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_mail_stream_events_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_mail_stream_events_resend_created_at").using("btree", table.resendCreatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_mail_stream_events_email_id").using("btree", table.emailId.asc().nullsLast().op("text_ops")),
]);

export const mailStreamSettings = pgTable("mail_stream_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	retentionDays: integer("retention_days").default(-1).notNull(),
	setupComplete: boolean("setup_complete").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});
