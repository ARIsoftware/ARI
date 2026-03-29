import { pgTable, index, pgPolicy, uuid, timestamp, integer, varchar, unique, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const ohtaniGridCells = pgTable("ohtani_grid_cells", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	rowIndex: integer("row_index").notNull(),
	colIndex: integer("col_index").notNull(),
	content: varchar({ length: 15 }).default(''),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ohtani_grid_cells_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_ohtani_grid_cells_user_position").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.rowIndex.asc().nullsLast().op("uuid_ops"), table.colIndex.asc().nullsLast().op("uuid_ops")),
	unique("ohtani_grid_cells_user_id_row_index_col_index_key").on(table.userId, table.rowIndex, table.colIndex),
	pgPolicy("ohtani_grid_cells_rls_select", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("ohtani_grid_cells_rls_insert", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("ohtani_grid_cells_rls_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	pgPolicy("ohtani_grid_cells_rls_delete", { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id::text = (select current_setting('app.current_user_id')))` }),
	check("ohtani_grid_cells_col_index_check", sql`(col_index >= 0) AND (col_index <= 8)`),
	check("ohtani_grid_cells_row_index_check", sql`(row_index >= 0) AND (row_index <= 8)`),
]);
