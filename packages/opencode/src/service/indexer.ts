import { Context, Effect, Layer } from "effect"
import chokidar from "chokidar"
import { Database, eq } from "../storage"
import { CgFilesTable, CgSymbolsTable, CgEdgesTable, CgVectorsTable } from "../memory/code-graph.sql"
import { extractCodeGraph } from "../util/codegraph"
import { embed } from "../util/embeddings"
import fs from "fs/promises"
import crypto from "crypto"
import { Instance } from "../project/instance"
import { Log } from "../util"

const log = Log.create({ service: "indexer" })

export interface Interface {
  readonly processFile: (path: string) => Effect.Effect<void>
}

export class IndexerService extends Context.Service<IndexerService, Interface>()("opencode/Indexer") {}

const hashFile = (content: string) =>
  crypto.createHash("sha256").update(content).digest("hex")

const processFileFn = async (filepath: string) => {
  try {
    const content = await fs.readFile(filepath, "utf8")
    const hash = hashFile(content)

    const existingFiles = Database.Client().$client.query(
      `SELECT id, hash FROM cg_files WHERE path = ?`,
    ).all(filepath) as { id: number; hash: string }[]

    let fileId: number

    if (existingFiles.length > 0) {
      if (existingFiles[0].hash === hash) return
      fileId = existingFiles[0].id
      Database.use((db) => db.delete(CgSymbolsTable).where(eq(CgSymbolsTable.file_id, fileId)).run())
      Database.use((db) =>
        db.update(CgFilesTable).set({ hash, last_indexed: Date.now() }).where(eq(CgFilesTable.id, fileId)).run(),
      )
    } else {
      const res = Database.use((db) =>
        db.insert(CgFilesTable).values({ path: filepath, hash, last_indexed: Date.now() }).returning({ id: CgFilesTable.id }).get(),
      )
      fileId = res.id
    }

    const graph = extractCodeGraph(filepath, content)
    const symbolNameIdMap = new Map<string, number>()

    for (const sym of graph.symbols) {
      const res = Database.use((db) =>
        db.insert(CgSymbolsTable).values({
          file_id: fileId,
          name: sym.name,
          type: sym.type,
          file_path: filepath,
          start_line: sym.start_line,
          end_line: sym.end_line,
          body_content: sym.body_content,
        }).returning({ id: CgSymbolsTable.id }).get(),
      )
      symbolNameIdMap.set(sym.name, res.id)

      const vec = await embed(sym.body_content)
      const blob = Buffer.from(vec.buffer)
      Database.use((db) => db.insert(CgVectorsTable).values({ symbol_id: res.id, embedding: blob }).run())
    }

    for (const edge of graph.edges) {
      const fromId = symbolNameIdMap.get(edge.from_symbol_name)
      const toId = symbolNameIdMap.get(edge.to_symbol_name)
      if (fromId && toId)
        Database.use((db) =>
          db.insert(CgEdgesTable).values({ from_symbol_id: fromId, to_symbol_id: toId, type: edge.type }).run(),
        )
    }
  } catch (e: unknown) {
    log.error("Failed to index file", { filepath, error: e instanceof Error ? e.message : String(e) })
  }
}

const removeFileFn = (filepath: string) =>
  Database.use((db) => db.delete(CgFilesTable).where(eq(CgFilesTable.path, filepath)).run())

export const layer = Layer.effect(
  IndexerService,
  Effect.gen(function* () {
    const watchDir = Instance.directory

    const watcher = chokidar.watch(watchDir, {
      ignored: [/(^|[/\\])\../, /node_modules/, /dist/, /build/, /\.out/],
      persistent: true,
      ignoreInitial: false,
    })

    const isCode = (p: string) =>
      p.endsWith(".ts") || p.endsWith(".js") || p.endsWith(".tsx") || p.endsWith(".jsx")

    watcher
      .on("add", (p) => { if (isCode(p)) processFileFn(p) })
      .on("change", (p) => { if (isCode(p)) processFileFn(p) })
      .on("unlink", (p) => { removeFileFn(p) })

    log.info("Started Indexer daemon", { watchDir })

    yield* Effect.addFinalizer(() => Effect.promise(() => watcher.close()))

    return IndexerService.of({
      processFile: (path) => Effect.promise(() => processFileFn(path)),
    })
  }),
)
