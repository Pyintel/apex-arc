export interface SqliteDbOptions {
  create?: boolean
  readonly?: boolean
}

export interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
}

export interface SqliteDbInstance {
  run(sql: string): void
  exec(sql: string): void
  query(sql: string): SqliteStatement
  prepare(sql: string): SqliteStatement
  transaction<T extends (...args: any[]) => any>(fn: T): T
  close(): void
}

export { openSqlite } from "#sqlite"
