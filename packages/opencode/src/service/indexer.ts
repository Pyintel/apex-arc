import { Effect, Layer } from "effect"
import chokidar from "chokidar"
import { Database, eq, inArray } from "../storage"
import { CgFilesTable, CgSymbolsTable, CgEdgesTable, CgVectorsTable } from "../memory/code-graph.sql"
import { extractCodeGraph } from "../util/codegraph"
import { embed } from "../util/embeddings"
import fs from "fs/promises"
import crypto from "crypto"
import { Global } from "../global"
import { Log } from "../util"

const log = Log.create({ service: "indexer" })

export class IndexerService extends Effect.Service<IndexerService>()("opencode/Indexer", {
  scoped: Effect.gen(function* () {
    const watchDir = Global.Path.cwd

    const hashFile = async (content: string) => {
        return crypto.createHash('sha256').update(content).digest('hex')
    }

    const processFile = async (filepath: string) => {
      try {
        const content = await fs.readFile(filepath, "utf8")
        const hash = await hashFile(content)

        // Check if file is already indexed and unchanged
        const existingFiles = Database.Client().$client.query(
            `SELECT id, hash FROM cg_files WHERE path = ?`
        ).all(filepath) as { id: number, hash: string }[]

        let fileId: number

        if (existingFiles.length > 0) {
           if (existingFiles[0].hash === hash) {
               return // Unchanged
           }
           fileId = existingFiles[0].id

           // File changed, delete old symbols (cascade will handle edges/vectors)
           Database.use(db => db.delete(CgSymbolsTable).where(eq(CgSymbolsTable.file_id, fileId)).run())

           Database.use(db => db.update(CgFilesTable).set({
               hash: hash,
               last_indexed: Date.now()
           }).where(eq(CgFilesTable.id, fileId)).run())
        } else {
            const res = Database.use(db => db.insert(CgFilesTable).values({
                path: filepath,
                hash: hash,
                last_indexed: Date.now()
            }).returning({ id: CgFilesTable.id }).get())
            fileId = res.id
        }

        const graph = extractCodeGraph(filepath, content)

        const symbolNameIdMap = new Map<string, number>()

        // Insert symbols
        for (const sym of graph.symbols) {
           const res = Database.use(db => db.insert(CgSymbolsTable).values({
               file_id: fileId,
               name: sym.name,
               type: sym.type,
               file_path: filepath,
               start_line: sym.start_line,
               end_line: sym.end_line,
               body_content: sym.body_content,
           }).returning({ id: CgSymbolsTable.id }).get())

           symbolNameIdMap.set(sym.name, res.id)

           // Compute embedding for the symbol body
           const vec = await embed(sym.body_content);
           // Convert Float32Array to Buffer for SQLite BLOB
           const blob = Buffer.from(vec.buffer)

           Database.use(db => db.insert(CgVectorsTable).values({
               symbol_id: res.id,
               embedding: blob,
           }).run())
        }

        // Insert edges
        for (const edge of graph.edges) {
            const fromId = symbolNameIdMap.get(edge.from_symbol_name)
            const toId = symbolNameIdMap.get(edge.to_symbol_name)

            if (fromId && toId) {
                Database.use(db => db.insert(CgEdgesTable).values({
                   from_symbol_id: fromId,
                   to_symbol_id: toId,
                   type: edge.type
                }).run())
            }
        }

      } catch (e: any) {
         log.error("Failed to index file", { filepath, error: e.message })
      }
    }

    const removeFile = async (filepath: string) => {
        Database.use(db => db.delete(CgFilesTable).where(eq(CgFilesTable.path, filepath)).run())
    }

    const watcher = chokidar.watch(watchDir, {
      ignored: [/(^|[\/\\])\../, /node_modules/, /dist/, /build/, /\.out/],
      persistent: true,
      ignoreInitial: false,
    })

    watcher
      .on("add", (path) => {
          if (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".tsx") || path.endsWith(".jsx")) {
             processFile(path)
          }
      })
      .on("change", (path) => {
          if (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".tsx") || path.endsWith(".jsx")) {
             processFile(path)
          }
      })
      .on("unlink", (path) => {
          removeFile(path)
      })

    log.info("Started Indexer daemon", { watchDir })

    yield* Effect.addFinalizer(() => Effect.promise(() => watcher.close()))

    return {
       processFile: (path: string) => Effect.promise(() => processFile(path)),
    }
  }),
}) {}

export const layer = Layer.scoped(IndexerService, IndexerService.make)
