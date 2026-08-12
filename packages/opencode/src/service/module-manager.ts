import { openSqlite } from "@/storage/sqlite"
import { embed } from "@/util/embeddings"
import { Path as GlobalPath } from "@/global"
import { Process } from "@/util"
import fs from "fs/promises"
import path from "path"
import { existsSync } from "fs"
import { execSync } from "child_process"

export interface ModuleInfo {
  id: string
  name: string
  description: string
  source?: string
  dbFilename?: string
  type?: "git" | "local" | "npm"
  installed?: boolean
  installedAt?: string
  version?: string
}

function getCustomRegistryPath(): string {
  return path.join(GlobalPath.data, "modules", "custom_registry.json")
}

export async function fetchNpmModules(): Promise<ModuleInfo[]> {
  try {
    const res = await fetch("https://registry.npmjs.org/-/v1/search?text=scope:pyintel+keywords:pyintel-arc-module&size=50")
    if (!res.ok) return []
    const data = (await res.json()) as { objects?: { package: { name: string; description: string; version: string } }[] }
    if (!Array.isArray(data.objects)) return []
    // Normalize id: @pyintel/arc-module-google-workspace -> open-google-workspace
    // so it matches the installed module directory name (open-*)
    return data.objects.map((obj) => {
      const pkg = obj.package
      const slug = pkg.name.replace(/^@pyintel\/arc-module-/, "")
      const id = `open-${slug}`
      return {
        id,
        name: pkg.name,
        description: pkg.description || `Pyintel Arc Module ${pkg.name}`,
        source: `npm:${pkg.name}`,
        type: "npm" as const,
        version: pkg.version,
      }
    })
  } catch {
    return []
  }
}

export async function getCustomModules(): Promise<ModuleInfo[]> {
  const customPath = getCustomRegistryPath()
  if (!existsSync(customPath)) return []
  const content = await fs.readFile(customPath, "utf-8")
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

async function getInstalledModules(): Promise<ModuleInfo[]> {
  const modulesDir = path.join(GlobalPath.data, "modules")
  const devHomeDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".dev-home", "data", "modules")
  const installed: ModuleInfo[] = []
  const seen = new Set<string>()

  for (const dir of [modulesDir, devHomeDir]) {
    if (!existsSync(dir)) continue
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_") || seen.has(entry.name)) continue
      seen.add(entry.name)
      const moduleDir = path.join(dir, entry.name)

      // Prefer ARC/config.json for name/description (source of truth)
      const arcConfigPath = path.join(moduleDir, "ARC", "config.json")
      let arcName: string | undefined
      let arcDescription: string | undefined
      if (existsSync(arcConfigPath)) {
        try {
          const arc = JSON.parse(await fs.readFile(arcConfigPath, "utf-8"))
          arcName = arc.name
          arcDescription = arc.description
        } catch {}
      }

      const manifestPath = path.join(moduleDir, "manifest.json")
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"))
          installed.push({
            id: entry.name,
            name: arcName || manifest.name || entry.name,
            description: arcDescription || manifest.description || `Installed module ${entry.name}`,
            source: manifest.source,
            type: manifest.type || "git",
            installed: true,
            installedAt: manifest.installedAt,
            version: manifest.version,
          })
        } catch {
          installed.push({
            id: entry.name,
            name: arcName || entry.name,
            description: arcDescription || `Installed module ${entry.name}`,
            installed: true,
          })
        }
      } else {
        // No manifest yet but dir exists — still show as installed
        installed.push({
          id: entry.name,
          name: arcName || entry.name,
          description: arcDescription || `Installed module ${entry.name}`,
          installed: true,
        })
      }
    }
  }
  return installed
}

export async function getAllAvailableModules(): Promise<ModuleInfo[]> {
  const [custom, npmModules, installedModules] = await Promise.all([
    getCustomModules(),
    fetchNpmModules(),
    getInstalledModules(),
  ])

  // Helper to normalize IDs (strip 'open-' prefix or '@pyintel/arc-module-' scope/prefix)
  const normalizeId = (id: string) => id.replace(/^(@pyintel\/arc-module-|open-)/, "")

  // Build lookup map for installed modules by raw ID and normalized ID
  const installedMap = new Map<string, ModuleInfo>()
  for (const m of installedModules) {
    installedMap.set(m.id, m)
    installedMap.set(normalizeId(m.id), m)
  }

  // Set of matched installed IDs so we can track orphans
  const matchedInstalledIds = new Set<string>()

  // Merge installed status into npm modules
  const mergedNpm = npmModules.map((m) => {
    const installed = installedMap.get(m.id) || installedMap.get(normalizeId(m.id))
    if (installed) {
      matchedInstalledIds.add(installed.id)
      return { ...m, name: m.name || installed.name, installed: true, installedAt: installed.installedAt }
    }
    return m
  })

  // Merge installed status into custom modules
  const mergedCustom = custom.map((m) => {
    const installed = installedMap.get(m.id) || installedMap.get(normalizeId(m.id))
    if (installed) {
      matchedInstalledIds.add(installed.id)
      return { ...m, name: m.name || installed.name, installed: true, installedAt: installed.installedAt }
    }
    return m
  })

  // Include installed modules not matched to npm or custom registries
  const orphanInstalled = installedModules.filter((m) => !matchedInstalledIds.has(m.id))

  return [...mergedNpm, ...mergedCustom, ...orphanInstalled]
}

export function isModuleInstalled(moduleId: string): boolean {
  const moduleDir = path.join(GlobalPath.data, "modules", moduleId)
  const devHomeDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".dev-home", "modules", moduleId)
  if (existsSync(moduleDir) || existsSync(devHomeDir)) return true
  return false
}

const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".bun", "dist", "build", ".next", ".cache", "coverage", "__pycache__", ".venv", "venv"])

async function collectMarkdownFiles(dir: string, includes?: string[]): Promise<string[]> {
  if (includes && includes.length > 0) {
    const results: string[] = []
    for (const pattern of includes) {
      const glob = new Bun.Glob(pattern)
      for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) {
        if (file.split(/[\/\\]/).some(part => EXCLUDED_DIRS.has(part) || (part.startsWith(".") && part !== "." && part !== ".."))) continue;
        const abs = path.join(dir, file)
        if (!results.includes(abs)) results.push(abs)
      }
    }
    return results
  }
  return walkMarkdownFiles(dir)
}

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith(".")) return []
      const res = path.resolve(dir, entry.name)
      if (entry.isDirectory()) return walkMarkdownFiles(res)
      if (/\.(md|mdx|txt)$/i.test(entry.name)) return [res]
      return []
    }),
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

  const isNpm = source.startsWith("npm:") || source.startsWith("@pyintel/")
  const isGit = source.startsWith("http://") || source.startsWith("https://") || source.startsWith("git@")

  if (isNpm) {
    const pkgName = source.startsWith("npm:") ? source.slice(4) : source
    onProgress(`Fetching NPM package ${pkgName} from registry...`)
    const tempDir = path.join(modulesDir, `_tmp_${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
    try {
      execSync(`npm pack ${pkgName} --pack-destination "${tempDir}"`, { stdio: "pipe" })
      const files = await fs.readdir(tempDir)
      const tgzFile = files.find((f) => f.endsWith(".tgz"))
      if (!tgzFile) throw new Error("Failed to download NPM tarball")
      onProgress(`Extracting package bundle...`)
      execSync(`tar -xzf "${path.join(tempDir, tgzFile)}" -C "${tempDir}"`, { stdio: "pipe" })
      await fs.cp(path.join(tempDir, "package"), targetDir, { recursive: true })
      onProgress(`✅ Installed module bundle from NPM registry`)
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  } else if (isGit) {
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

  // Pre-flight inspection of ARC/config.json or module.json
  const configPaths = [
    path.join(targetDir, "ARC", "config.json"),
    path.join(targetDir, "arc.json"),
    path.join(targetDir, "module.json"),
  ]
  const foundConfigPath = configPaths.find((p) => existsSync(p))
  let config: any = null

  if (foundConfigPath) {
    onProgress("Reading ARC/config.json module manifest...")
    try {
      const configText = await fs.readFile(foundConfigPath, "utf-8")
      config = JSON.parse(configText)
    } catch {}
  }

  // Automatic package dependency installation (bun install / npm install)
  const hasPackageJson = existsSync(path.join(targetDir, "package.json"))
  if (hasPackageJson || config?.setup?.command) {
    onProgress("[1/2] Installing module package dependencies (bun install / npm install)...")
    try {
      const setupCmd = config?.setup?.command || "bun install --production || npm install --production"
      execSync(setupCmd, { cwd: targetDir, stdio: "pipe" })
      onProgress("✅ Module package dependencies successfully installed.")
    } catch (err: any) {
      onProgress(`Warning: Package setup encountered issue: ${(err as Error).message}`)
    }
  }

  const missingPrereqs: { name: string; checkCmd: string; installCmd: string }[] = []
  if (config && Array.isArray(config.prerequisites)) {
    for (const prereq of config.prerequisites) {
      onProgress(`Running pre-flight check for prerequisite: ${prereq.name}...`)
      try {
        const checkCmd = process.platform === "win32" ? `cmd /c "${prereq.check}"` : prereq.check
        execSync(checkCmd, { stdio: "ignore" })
        onProgress(`✅ Pre-flight check passed for ${prereq.name}`)
      } catch {
        const platform = process.platform as "win32" | "darwin" | "linux"
        const installCmd = prereq.install?.[platform] || prereq.install?.win32 || `Install ${prereq.name}`
        missingPrereqs.push({ name: prereq.name, checkCmd: prereq.check, installCmd })
      }
    }
  }

  if (missingPrereqs.length > 0) {
    onProgress(`Detected ${missingPrereqs.length} missing system prerequisite(s): ${missingPrereqs.map(p => p.name).join(", ")}`)
    for (let i = 0; i < missingPrereqs.length; i++) {
      const p = missingPrereqs[i]
      onProgress(`[${i + 1}/${missingPrereqs.length}] Installing missing system tool '${p.name}' using '${p.installCmd}'...`)
      try {
        execSync(p.installCmd, { stdio: "pipe" })
        onProgress(`✅ Successfully installed system prerequisite: ${p.name}`)
      } catch (installErr: any) {
        onProgress(`⚠️ System installation of '${p.name}' encountered warning: ${(installErr as Error).message}`)
        onProgress(`   Manual installation command: ${p.installCmd}`)
      }
    }
  }

  const dbFilename = moduleInfo.dbFilename || "boards.db"
  const dbPath = path.join(targetDir, dbFilename)
  const isDb = existsSync(dbPath)

  onProgress("Initializing vector database...")
  const vectorDbPath = path.join(modulesDir, "modules_vector.db")
  const vecDb = openSqlite(vectorDbPath, { create: true })

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
    const preDb = openSqlite(prebuiltVectorDbPath, { readonly: true })
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
        type: isNpm ? "npm" : isGit ? "git" : "local",
      })
    }

    onProgress("Module installation & pre-built vector import complete!")
    return
  }

  const batchSize = 50
  const recordsToInsert: { module_id: string; item_id: string; text: string; embedding: Buffer }[] = []

  if (isDb) {
    onProgress("Loading database records...")
    const srcDb = openSqlite(dbPath, { readonly: true })
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
    onProgress("Scanning documentation files...")
    const includePatterns: string[] | undefined = config?.vectorize?.includes
    const mdFiles = await collectMarkdownFiles(targetDir, includePatterns)
    onProgress(`Found ${mdFiles.length} documentation file${mdFiles.length !== 1 ? "s" : ""}. Vectorizing...`)

    for (let i = 0; i < mdFiles.length; i++) {
      const filePath = mdFiles[i]!
      const relPath = path.relative(targetDir, filePath)
      const content = await fs.readFile(filePath, "utf-8")

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
      type: isNpm ? "npm" : isGit ? "git" : "local",
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
    const vecDb = openSqlite(vectorDbPath)
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
  const vecDb = openSqlite(vectorDbPath, { readonly: true })

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
