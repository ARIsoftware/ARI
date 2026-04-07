import { check, doublePrecision, foreignKey, index, pgPolicy, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from '@/lib/db/schema/core-schema'

export const brainstormBoards = pgTable('brainstorm_boards', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text('user_id').notNull(),
  name: varchar({ length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_brainstorm_boards_user_id').using('btree', table.userId.asc().nullsLast().op('text_ops')),
  index('idx_brainstorm_boards_user_updated').using('btree', table.userId.asc().nullsLast().op('text_ops'), table.updatedAt.desc().nullsFirst().op('timestamptz_ops')),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [user.id],
    name: 'brainstorm_boards_user_id_fkey',
  }).onDelete('cascade'),
  pgPolicy('brainstorm_boards_rls_select', { as: 'permissive', for: 'select', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_boards_rls_insert', { as: 'permissive', for: 'insert', to: ['public'], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_boards_rls_update', { as: 'permissive', for: 'update', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_boards_rls_delete', { as: 'permissive', for: 'delete', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const brainstormNodes = pgTable('brainstorm_nodes', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  boardId: uuid('board_id').notNull(),
  userId: text('user_id').notNull(),
  text: text().default('').notNull(),
  x: doublePrecision().default(0).notNull(),
  y: doublePrecision().default(0).notNull(),
  color: varchar({ length: 32 }).default('slate').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_brainstorm_nodes_board_id').using('btree', table.boardId.asc().nullsLast().op('uuid_ops')),
  index('idx_brainstorm_nodes_user_board').using('btree', table.userId.asc().nullsLast().op('text_ops'), table.boardId.asc().nullsLast().op('uuid_ops')),
  foreignKey({
    columns: [table.boardId],
    foreignColumns: [brainstormBoards.id],
    name: 'brainstorm_nodes_board_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [user.id],
    name: 'brainstorm_nodes_user_id_fkey',
  }).onDelete('cascade'),
  pgPolicy('brainstorm_nodes_rls_select', { as: 'permissive', for: 'select', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_nodes_rls_insert', { as: 'permissive', for: 'insert', to: ['public'], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_nodes_rls_update', { as: 'permissive', for: 'update', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_nodes_rls_delete', { as: 'permissive', for: 'delete', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])

export const brainstormEdges = pgTable('brainstorm_edges', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  boardId: uuid('board_id').notNull(),
  userId: text('user_id').notNull(),
  sourceNodeId: uuid('source_node_id').notNull(),
  targetNodeId: uuid('target_node_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_brainstorm_edges_board_id').using('btree', table.boardId.asc().nullsLast().op('uuid_ops')),
  index('idx_brainstorm_edges_user_board').using('btree', table.userId.asc().nullsLast().op('text_ops'), table.boardId.asc().nullsLast().op('uuid_ops')),
  index('idx_brainstorm_edges_source').using('btree', table.sourceNodeId.asc().nullsLast().op('uuid_ops')),
  index('idx_brainstorm_edges_target').using('btree', table.targetNodeId.asc().nullsLast().op('uuid_ops')),
  unique('brainstorm_edges_unique_pair').on(table.boardId, table.sourceNodeId, table.targetNodeId),
  check('brainstorm_edges_no_self_loop', sql`source_node_id <> target_node_id`),
  foreignKey({
    columns: [table.boardId],
    foreignColumns: [brainstormBoards.id],
    name: 'brainstorm_edges_board_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [user.id],
    name: 'brainstorm_edges_user_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.sourceNodeId],
    foreignColumns: [brainstormNodes.id],
    name: 'brainstorm_edges_source_node_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.targetNodeId],
    foreignColumns: [brainstormNodes.id],
    name: 'brainstorm_edges_target_node_id_fkey',
  }).onDelete('cascade'),
  pgPolicy('brainstorm_edges_rls_select', { as: 'permissive', for: 'select', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_edges_rls_insert', { as: 'permissive', for: 'insert', to: ['public'], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_edges_rls_update', { as: 'permissive', for: 'update', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy('brainstorm_edges_rls_delete', { as: 'permissive', for: 'delete', to: ['public'], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
])
