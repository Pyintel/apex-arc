import { Database as SqliteDb } from "bun:sqlite"
import { embed } from "@/util/embeddings"
import { Path as GlobalPath } from "@/global"
import { Process } from "@/util"
import fs from "fs/promises"
import path from "path"
import { existsSync } from "fs"

export interface ModuleInfo {
  id: string
  name: string
  description: string
  repoUrl: string
  dbFilename: string
}

export const AVAILABLE_MODULES: ModuleInfo[] = [
  {
    id: "open-board-registry",
    name: "Knowledge About Dev Board Registry",
    description: "Database containing structured specifications for 1,700+ microcontroller boards.",
    repoUrl: "https://github.com/riteshrajas/open-board-registry.git",
    dbFilename: "boards.db",
  }
]

export function isModuleInstalled(moduleId: string): boolean {
  const dbPath = path.join(GlobalPath.data, "modules", moduleId, "boards.db")
  return existsSync(dbPath)
}

export async function installModule(
  moduleId: string,
  onProgress: (status: string) => void
) {
  const moduleInfo = AVAILABLE_MODULES.find(m => m.id === moduleId)
  if (!moduleInfo) throw new Error("Module not found")

  const modulesDir = path.join(GlobalPath.data, "modules")
  await fs.mkdir(modulesDir, { recursive: true })

  const targetDir = path.join(modulesDir, moduleId)
  if (existsSync(targetDir)) {
    onProgress("Cleaning existing installation...")
    await fs.rm(targetDir, { recursive: true, force: true })
  }

  onProgress("Cloning repository...")
  await Process.run(["git", "clone", "--depth", "1", moduleInfo.repoUrl, targetDir])

  const dbPath = path.join(targetDir, moduleInfo.dbFilename)
  if (!existsSync(dbPath)) {
    throw new Error("Database file not found in repository")
  }

  onProgress("Loading database...")
  const srcDb = new SqliteDb(dbPath, { readonly: true })
  const rows = srcDb.query("SELECT * FROM boards").all() as Record<string, unknown>[]
  srcDb.close()

  onProgress("Initializing vector database...")
  const vectorDbPath = path.join(modulesDir, "modules_vector.db")
  const vecDb = new SqliteDb(vectorDbPath, { create: true })

  vecDb.run(`
    CREATE TABLE IF NOT EXISTS module_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT,
      item_id TEXT,
      text TEXT,
      embedding BLOB
    )
  `)

  vecDb.query("DELETE FROM module_embeddings WHERE module_id = ?").run(moduleId)

  onProgress(`Vectorizing ${rows.length} records...`)

  const insertStmt = vecDb.prepare(`
    INSERT INTO module_embeddings (module_id, item_id, text, embedding)
    VALUES (?, ?, ?, ?)
  `)

  const insertMany = vecDb.transaction((records: { module_id: string; item_id: string; text: string; embedding: Buffer }[]) => {
    for (const record of records) {
      insertStmt.run(record.module_id, record.item_id, record.text, record.embedding)
    }
  })

  const batchSize = 25
  const recordsToInsert: { module_id: string; item_id: string; text: string; embedding: Buffer }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (i % 10 === 0 || i === rows.length - 1) {
      onProgress(`Vectorizing records: ${i + 1} / ${rows.length}...`)
    }

    const textToEmbed = `Board: ${row.name || ""} (ID: ${row.id || ""})
Vendor: ${row.vendor || ""}
Platform: ${row.platform || ""}
MCU: ${row.mcu || ""}
CPU Architecture: ${row.cpu_arch || ""}
Frequency: ${row.fcpu_hz ? (Number(row.fcpu_hz) / 1000000) + " MHz" : "unknown"}
RAM: ${row.ram_bytes ? (Number(row.ram_bytes) / 1024) + " KB" : "unknown"}
ROM/Flash: ${row.rom_bytes ? (Number(row.rom_bytes) / 1024) + " KB" : "unknown"}
Connectivity: ${row.connectivity || "[]"}
Frameworks: ${row.frameworks || "[]"}
Peripherals: ${row.peripherals || "[]"}
Interfaces: ${row.interfaces || "[]"}
URL: ${row.url || "none"}`

    const vec = await embed(textToEmbed)
    const blob = Buffer.from(vec.buffer)

    recordsToInsert.push({
      module_id: moduleId,
      item_id: String(row.id),
      text: textToEmbed,
      embedding: blob
    })

    if (recordsToInsert.length >= batchSize) {
      insertMany(recordsToInsert)
      recordsToInsert.length = 0
    }
  }

  if (recordsToInsert.length > 0) {
    insertMany(recordsToInsert)
  }

  vecDb.close()
  onProgress("Vector database indexing complete!")
}

export async function uninstallModule(moduleId: string) {
  const modulesDir = path.join(GlobalPath.data, "modules")
  const targetDir = path.join(modulesDir, moduleId)
  if (existsSync(targetDir)) {
    await fs.rm(targetDir, { recursive: true, force: true })
  }

  const vectorDbPath = path.join(modulesDir, "modules_vector.db")
  if (existsSync(vectorDbPath)) {
    const vecDb = new SqliteDb(vectorDbPath, { create: false })
    vecDb.run("DELETE FROM module_embeddings WHERE module_id = ?", [moduleId])
    vecDb.close()
  }
}

