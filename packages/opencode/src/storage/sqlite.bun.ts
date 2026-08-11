import { Database } from "bun:sqlite"
import type { SqliteDbInstance, SqliteDbOptions } from "./sqlite"

export function openSqlite(path: string, options?: SqliteDbOptions): SqliteDbInstance {
  const db = new Database(path, {
    create: options?.create,
    readonly: options?.readonly,
  })

  return {
    run: (sql: string) => db.run(sql),
    exec: (sql: string) => db.exec(sql),
    query: (sql: string) => {
      const q = db.query(sql)
      return {
        run: (...params: unknown[]) => q.run(...(params as never[])),
        all: (...params: unknown[]) => q.all(...(params as never[])) as unknown[],
        get: (...params: unknown[]) => q.get(...(params as never[])) as unknown,
      }
    },
    prepare: (sql: string) => {
      const q = db.prepare(sql)
      return {
        run: (...params: unknown[]) => q.run(...(params as never[])),
        all: (...params: unknown[]) => q.all(...(params as never[])) as unknown[],
        get: (...params: unknown[]) => q.get(...(params as never[])) as unknown,
      }
    },
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return db.transaction(fn) as unknown as T
    },
    close: () => db.close(),
  }
}
