import {
  pgTable,
  check,
  foreignKey,
  index,
  uniqueIndex,
  pgPolicy,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from '@/lib/db/schema/core-schema'

export const portfolioTickers = pgTable(
  'portfolio_tickers',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    symbol: text().notNull(),
    shares: numeric({ precision: 20, scale: 8 }),
    position: integer().notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_portfolio_tickers_user_position').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops'),
      table.position.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('idx_portfolio_tickers_user_symbol').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops'),
      table.symbol.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'portfolio_tickers_user_id_fkey',
    }).onDelete('cascade'),
    check('portfolio_tickers_symbol_len_check', sql`char_length(symbol) <= 10`),
    check('portfolio_tickers_shares_nonneg_check', sql`shares IS NULL OR shares >= 0`),
    check('portfolio_tickers_position_nonneg_check', sql`position >= 0`),
    pgPolicy('portfolio_tickers_rls_select', {
      as: 'permissive',
      for: 'select',
      to: ['public'],
      using: sql`(user_id = (select current_setting('app.current_user_id')))`,
    }),
    pgPolicy('portfolio_tickers_rls_insert', {
      as: 'permissive',
      for: 'insert',
      to: ['public'],
      withCheck: sql`(user_id = (select current_setting('app.current_user_id')))`,
    }),
    pgPolicy('portfolio_tickers_rls_update', {
      as: 'permissive',
      for: 'update',
      to: ['public'],
      using: sql`(user_id = (select current_setting('app.current_user_id')))`,
    }),
    pgPolicy('portfolio_tickers_rls_delete', {
      as: 'permissive',
      for: 'delete',
      to: ['public'],
      using: sql`(user_id = (select current_setting('app.current_user_id')))`,
    }),
  ],
)
