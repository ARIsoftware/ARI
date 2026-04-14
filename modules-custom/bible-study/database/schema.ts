import { pgTable, index, pgPolicy, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const bibleStudyKids = pgTable("bible_study_kids", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  title: text().notNull(),
  book: text().notNull(),
  chapter: integer().notNull(),
  verseStart: integer("verse_start"),
  verseEnd: integer("verse_end"),
  keyLesson: text("key_lesson"),
  discussionQuestions: jsonb("discussion_questions").default([]),
  memoryVerse: text("memory_verse"),
  notesAge8: text("notes_age_8"),
  notesAge6: text("notes_age_6"),
  notesAge3: text("notes_age_3"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_kids_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_bible_study_kids_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
  index("idx_bible_study_kids_book").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.book.asc().nullsLast().op("text_ops")),
  pgPolicy("bible_study_kids_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_kids_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_kids_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_kids_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const bibleStudyPersonal = pgTable("bible_study_personal", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  title: text().notNull(),
  book: text().notNull(),
  chapter: integer().notNull(),
  verseStart: integer("verse_start"),
  verseEnd: integer("verse_end"),
  notes: text(),
  tags: jsonb().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_personal_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_bible_study_personal_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
  index("idx_bible_study_personal_book").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.book.asc().nullsLast().op("text_ops")),
  pgPolicy("bible_study_personal_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_personal_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_personal_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_personal_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const bibleStudyWordStudies = pgTable("bible_study_word_studies", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  studyId: uuid("study_id").notNull().references(() => bibleStudyPersonal.id, { onDelete: 'cascade' }),
  originalWord: text("original_word").notNull(),
  transliteration: text(),
  language: text().notNull(),
  meaning: text().notNull(),
  contextNotes: text("context_notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_word_studies_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_bible_study_word_studies_study_id").using("btree", table.studyId.asc().nullsLast()),
  pgPolicy("bible_study_word_studies_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_word_studies_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_word_studies_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_word_studies_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const bibleStudyConversations = pgTable("bible_study_conversations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  title: text().notNull().default('New Conversation'),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_convs_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_bible_study_convs_user_updated").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
  pgPolicy("bible_study_convs_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_convs_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_convs_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_convs_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const bibleStudyMessages = pgTable("bible_study_messages", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id").notNull().references(() => bibleStudyConversations.id, { onDelete: 'cascade' }),
  role: text().notNull(),
  content: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_msgs_conversation_id").using("btree", table.conversationId.asc().nullsLast()),
  index("idx_bible_study_msgs_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  pgPolicy("bible_study_msgs_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_msgs_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_msgs_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_msgs_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const bibleStudyNotes = pgTable("bible_study_notes", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  bibleVersion: text("bible_version").notNull().default('ESV'),
  book: text().notNull(),
  chapter: integer().notNull(),
  verseStart: integer("verse_start"),
  verseEnd: integer("verse_end"),
  title: text(),
  content: text().notNull().default(''),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_notes_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_bible_study_notes_user_passage").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.book.asc().nullsLast().op("text_ops"), table.chapter.asc().nullsLast()),
  index("idx_bible_study_notes_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
  pgPolicy("bible_study_notes_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_notes_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_notes_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_notes_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const bibleStudyChatMessages = pgTable("bible_study_chat_messages", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  role: text().notNull(),
  content: text().notNull(),
  studyContext: jsonb("study_context"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index("idx_bible_study_chat_messages_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_bible_study_chat_messages_user_created").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
  pgPolicy("bible_study_chat_messages_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_chat_messages_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_chat_messages_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy("bible_study_chat_messages_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])
