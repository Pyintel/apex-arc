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
  source?: string
  dbFilename?: string
  type?: "git" | "local" | "builtin"
}

export const BUILTIN_MODULES: ModuleInfo[] = [
  {
    id: "open-board-registry",
    name: "Knowledge About Dev Board Registry",
    description: "Database containing structured specifications for 1,700+ microcontroller boards.",
    source: "https://github.com/riteshrajas/open-board-registry.git",
    dbFilename: "boards.db",
    type: "builtin",
  },
  {
    id: "open-hardware-toolchain",
    name: "Hardware Toolchains & Device Interaction",
    description: "Tools and skills for device detection, firmware flashing, serial monitoring, and pinout inspection.",
    source: "https://github.com/riteshrajas/open-hardware-toolchain.git",
    type: "builtin",
  },

]


function getCustomRegistryPath(): string {
  return path.join(GlobalPath.data, "modules", "custom_registry.json")
}

export async function getCustomModules(): Promise<ModuleInfo[]> {
  const customPath = getCustomRegistryPath()
  if (!existsSync(customPath)) return []
  const content = await Bun.file(customPath).text()
  return JSON.parse(content) as ModuleInfo[]
}

export async function saveCustomModule(module: ModuleInfo): Promise<void> {
  const customPath = getCustomRegistryPath()
  await fs.mkdir(path.dirname(customPath), { recursive: true })
  const list = await getCustomModules()
  const filtered = list.filter((m) => m.id !== module.id)
  filtered.push(module)
  await fs.writeFile(customPath, JSON.stringify(filtered, null, 2))
}

export async function getAllAvailableModules(): Promise<ModuleInfo[]> {
  const custom = await getCustomModules()
  const customIds = new Set(custom.map((c) => c.id))
  const builtins = BUILTIN_MODULES.filter((b) => !customIds.has(b.id))
  return [...builtins, ...custom]
}

export function isModuleInstalled(moduleId: string): boolean {
  const moduleDir = path.join(GlobalPath.data, "modules", moduleId)
  if (!existsSync(moduleDir)) return false
  const dbPath = path.join(moduleDir, "boards.db")
  const manifestPath = path.join(moduleDir, "manifest.json")
  return existsSync(dbPath) || existsSync(manifestPath)
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const res = path.resolve(dir, entry.name)
      if (entry.isDirectory()) {
        return collectMarkdownFiles(res)
      }
      if (/\.(md|mdx|txt)$/i.test(entry.name)) {
        return [res]
      }
      return []
    })
  )
  return files.flat()
}

export async function installModule(
  moduleId: string,
  onProgress: (status: string) => void,
  customSource?: string
) {
  const allModules = await getAllAvailableModules()
  const moduleInfo = allModules.find((m) => m.id === moduleId) || {
    id: moduleId,
    name: moduleId,
    description: `Custom module ${moduleId}`,
    source: customSource,
    type: "git" as const,
  }

  const source = customSource || moduleInfo.source
  if (!source) throw new Error("No source URL or local path provided for module")

  const modulesDir = path.join(GlobalPath.data, "modules")
  await fs.mkdir(modulesDir, { recursive: true })

  const targetDir = path.join(modulesDir, moduleId)
  if (existsSync(targetDir)) {
    onProgress("Cleaning existing installation...")
    await fs.rm(targetDir, { recursive: true, force: true })
  }

  const isGit = source.startsWith("http://") || source.startsWith("https://") || source.startsWith("git@")

  if (isGit) {
    onProgress(`Cloning repository ${source}...`)
    await Process.run(["git", "clone", "--depth", "1", source, targetDir])
  } else {
    const resolvedLocalPath = path.resolve(process.cwd(), source)
    onProgress(`Syncing local directory ${resolvedLocalPath} to global module store...`)
    if (!existsSync(resolvedLocalPath)) {
      throw new Error(`Local directory does not exist: ${resolvedLocalPath}`)
    }
    await fs.cp(resolvedLocalPath, targetDir, { recursive: true })
  }


  const dbFilename = moduleInfo.dbFilename || "boards.db"
  const dbPath = path.join(targetDir, dbFilename)
  const isDb = existsSync(dbPath)

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

  const insertStmt = vecDb.prepare(`
    INSERT INTO module_embeddings (module_id, item_id, text, embedding)
    VALUES (?, ?, ?, ?)
  `)

  const insertMany = vecDb.transaction(
    (records: { module_id: string; item_id: string; text: string; embedding: Buffer }[]) => {
      for (const record of records) {
        insertStmt.run(record.module_id, record.item_id, record.text, record.embedding)
      }
    }
  )

  const prebuiltVectorDbPath = path.join(targetDir, "boards_vector.db")
  if (existsSync(prebuiltVectorDbPath)) {
    onProgress("Importing pre-built vector database...")
    const preDb = new SqliteDb(prebuiltVectorDbPath, { readonly: true })
    const rows = preDb.query("SELECT item_id, text, embedding FROM module_embeddings").all() as {
      item_id: string
      text: string
      embedding: Buffer
    }[]
    preDb.close()

    insertMany(
      rows.map((r) => ({
        module_id: moduleId,
        item_id: String(r.item_id),
        text: r.text,
        embedding: Buffer.from(r.embedding),
      }))
    )
    vecDb.close()

    // Save manifest
    const manifest = {
      id: moduleId,
      name: moduleInfo.name,
      description: moduleInfo.description,
      source,
      installedAt: new Date().toISOString(),
    }
    await fs.writeFile(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2))

    if (customSource) {
      await saveCustomModule({
        id: moduleId,
        name: moduleInfo.name,
        description: moduleInfo.description,
        source,
        type: isGit ? "git" : "local",
      })
    }

    onProgress("Module installation & pre-built vector import complete!")
    return
  }

  const batchSize = 50
  const recordsToInsert: { module_id: string; item_id: string; text: string; embedding: Buffer }[] = []


  if (isDb) {


    onProgress("Loading database records...")
    const srcDb = new SqliteDb(dbPath, { readonly: true })
    const rows = srcDb.query("SELECT * FROM boards").all() as Record<string, unknown>[]
    srcDb.close()

    onProgress(`Vectorizing ${rows.length} records...`)
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
Frequency: ${row.fcpu_hz ? Number(row.fcpu_hz) / 1000000 + " MHz" : "unknown"}
RAM: ${row.ram_bytes ? Number(row.ram_bytes) / 1024 + " KB" : "unknown"}
ROM/Flash: ${row.rom_bytes ? Number(row.rom_bytes) / 1024 + " KB" : "unknown"}
Connectivity: ${row.connectivity || "[]"}
Frameworks: ${row.frameworks || "[]"}
Peripherals: ${row.peripherals || "[]"}
Interfaces: ${row.interfaces || "[]"}
URL: ${row.url || "none"}`

      const vec = await embed(textToEmbed)
      const blob = Buffer.from(vec.buffer)

      recordsToInsert.push({
        module_id: moduleId,
        item_id: String(row.id || i),
        text: textToEmbed,
        embedding: blob,
      })

      if (recordsToInsert.length >= batchSize) {
        insertMany(recordsToInsert)
        recordsToInsert.length = 0
      }
    }
  } else {
    onProgress("Scanning markdown documentation files...")
    const mdFiles = await collectMarkdownFiles(targetDir)
    onProgress(`Found ${mdFiles.length} documentation files. Vectorizing...`)

    for (let i = 0; i < mdFiles.length; i++) {
      const filePath = mdFiles[i]!
      const relPath = path.relative(targetDir, filePath)
      const content = await Bun.file(filePath).text()

      // Chunk file by headers or double newlines (approx 500 chars)
      const chunks = content
        .split(/(?=\n#{1,3} )|\n\n/)
        .map((c) => c.trim())
        .filter((c) => c.length > 20)

      for (let j = 0; j < chunks.length; j++) {
        const chunkText = `File: ${relPath}\n\n${chunks[j]}`
        const vec = await embed(chunkText)
        const blob = Buffer.from(vec.buffer)

        recordsToInsert.push({
          module_id: moduleId,
          item_id: `${relPath}#chunk-${j}`,
          text: chunkText,
          embedding: blob,
        })

        if (recordsToInsert.length >= batchSize) {
          insertMany(recordsToInsert)
          recordsToInsert.length = 0
        }
      }
    }
  }

  if (recordsToInsert.length > 0) {
    insertMany(recordsToInsert)
  }

  vecDb.close()

  // Save manifest
  const manifest = {
    id: moduleId,
    name: moduleInfo.name,
    description: moduleInfo.description,
    source,
    installedAt: new Date().toISOString(),
  }
  await fs.writeFile(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2))

  if (customSource) {
    await saveCustomModule({
      id: moduleId,
      name: moduleInfo.name,
      description: moduleInfo.description,
      source,
      type: isGit ? "git" : "local",
    })
  }

  onProgress("Module installation & vector indexing complete!")
}

export async function uninstallModule(moduleId: string) {
  const modulesDir = path.join(GlobalPath.data, "modules")
  const targetDir = path.join(modulesDir, moduleId)
  if (existsSync(targetDir)) {
    await fs.rm(targetDir, { recursive: true, force: true })
  }

  const vectorDbPath = path.join(modulesDir, "modules_vector.db")
  if (existsSync(vectorDbPath)) {
    const vecDb = new SqliteDb(vectorDbPath)
    vecDb.query("DELETE FROM module_embeddings WHERE module_id = ?").run(moduleId)
    vecDb.close()

  }

  const customPath = getCustomRegistryPath()
  if (existsSync(customPath)) {
    const customList = await getCustomModules()
    const updated = customList.filter((m) => m.id !== moduleId)
    await fs.writeFile(customPath, JSON.stringify(updated, null, 2))
  }
}

function cosineSimilarity(A: Float32Array, B: Float32Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i]
    normA += A[i] * A[i]
    normB += B[i] * B[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function queryModuleKnowledge(
  query: string,
  moduleId?: string,
  limit = 5
): Promise<{ id: string; moduleId: string; text: string; score: number }[]> {
  const vectorDbPath = path.join(GlobalPath.data, "modules", "modules_vector.db")
  if (!existsSync(vectorDbPath)) return []

  const queryEmbedding = await embed(query)
  const vecDb = new SqliteDb(vectorDbPath, { readonly: true })

  try {
    const sql = moduleId
      ? "SELECT module_id, item_id, text, embedding FROM module_embeddings WHERE module_id = ?"
      : "SELECT module_id, item_id, text, embedding FROM module_embeddings"

    const rows = (
      moduleId ? vecDb.query(sql).all(moduleId) : vecDb.query(sql).all()
    ) as { module_id: string; item_id: string; text: string; embedding: Buffer }[]

    const scored = rows.map((v) => {
      const vec = new Float32Array(
        v.embedding.buffer,
        v.embedding.byteOffset,
        v.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
      )
      return {
        id: v.item_id,
        moduleId: v.module_id,
        text: v.text,
        score: cosineSimilarity(queryEmbedding, vec),
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  } finally {
    vecDb.close()
  }
}
