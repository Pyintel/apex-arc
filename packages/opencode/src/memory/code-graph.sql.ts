import { sqliteTable, text, integer, index, blob, real } from "drizzle-orm/sqlite-core"

export const CgFilesTable = sqliteTable(
  "cg_files",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    path: text().notNull().unique(),
    hash: text().notNull(),
    last_indexed: integer().notNull(),
  },
  (table) => [
    index("cg_files_path_idx").on(table.path),
  ],
)

export const CgSymbolsTable = sqliteTable(
  "cg_symbols",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    file_id: integer().notNull().references(() => CgFilesTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: text().notNull(), // class, function, method, interface, variable, etc
    file_path: text().notNull(),
    start_line: integer().notNull(),
    end_line: integer().notNull(),
    body_content: text().notNull(),
  },
  (table) => [
    index("cg_symbols_name_idx").on(table.name),
    index("cg_symbols_type_idx").on(table.type),
    index("cg_symbols_file_id_idx").on(table.file_id),
  ],
)

export const CgEdgesTable = sqliteTable(
  "cg_edges",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    from_symbol_id: integer().notNull().references(() => CgSymbolsTable.id, { onDelete: "cascade" }),
    to_symbol_id: integer().notNull().references(() => CgSymbolsTable.id, { onDelete: "cascade" }),
    type: text().notNull(), // calls, imports, extends
  },
  (table) => [
    index("cg_edges_from_idx").on(table.from_symbol_id),
    index("cg_edges_to_idx").on(table.to_symbol_id),
  ],
)

export const CgVectorsTable = sqliteTable(
  "cg_vectors",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    symbol_id: integer().notNull().references(() => CgSymbolsTable.id, { onDelete: "cascade" }),
    embedding: blob().notNull(), // float32 array
  },
  (table) => [
    index("cg_vectors_symbol_id_idx").on(table.symbol_id),
  ],
)
