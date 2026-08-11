import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/node-sqlite"
import { migrate } from "drizzle-orm/node-sqlite/migrator"

export function init(path: string) {
  const sqlite = new DatabaseSync(path)
  const db = drizzle({ client: sqlite })
  return db
}

export function runMigrations(db: any, entries: any[]) {
  migrate(db, entries)
}
