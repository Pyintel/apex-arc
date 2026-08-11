import { DatabaseSync } from "node:sqlite"
import type { SqliteDbInstance, SqliteDbOptions } from "./sqlite"

export function openSqlite(path: string, options?: SqliteDbOptions): SqliteDbInstance {
  const db = new DatabaseSync(path, {
    readOnly: options?.readonly,
    enableForeignKeyConstraints: true,
  })

  return {
    run: (sql: string) => db.exec(sql),
    exec: (sql: string) => db.exec(sql),
    query: (sql: string) => {
      const stmt = db.prepare(sql)
      return {
        run: (...params: unknown[]) => stmt.run(...(params as never[])),
        all: (...params: unknown[]) => stmt.all(...(params as never[])) as unknown[],
        get: (...params: unknown[]) => stmt.get(...(params as never[])) as unknown,
      }
    },
    prepare: (sql: string) => {
      const stmt = db.prepare(sql)
      return {
        run: (...params: unknown[]) => stmt.run(...(params as never[])),
        all: (...params: unknown[]) => stmt.all(...(params as never[])) as unknown[],
        get: (...params: unknown[]) => stmt.get(...(params as never[])) as unknown,
      }
    },
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return ((...args: Parameters<T>): ReturnType<T> => {
        db.exec("BEGIN IMMEDIATE")
        try {
          const res = fn(...args)
          db.exec("COMMIT")
          return res
        } catch (err) {
          db.exec("ROLLBACK")
          throw err
        }
      }) as T
    },
    close: () => db.close(),
  }
}
