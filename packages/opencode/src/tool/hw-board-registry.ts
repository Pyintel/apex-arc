import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { Database as SqliteDb } from "bun:sqlite"
import { Path as GlobalPath } from "@/global"
import { embedEffect } from "../util/embeddings"
import { existsSync } from "fs"
import path from "path"

const DESCRIPTION = [
  "Query a structured hardware database of popular development boards by Vendor ID & Product ID (VID:PID) or by board name.",
  "Provides exact hardware specs: MCU architecture, RAM/Flash limits, pinouts, operating voltage, and integrated peripherals (screens, NeoPixels, sensors).",
].join("\n")

interface BoardSpec {
  name: string
  vid?: string
  pid?: string
  mcu: string
  ramKb?: number
  flashMb?: number
  voltage?: string
  screen?: boolean
  peripherals?: string[]
  interfaces?: string[]
}

const BOARD_DATABASE: BoardSpec[] = [
  {
    name: "Adafruit PyPortal",
    mcu: "ATSAMD51J20 (Cortex M4)",
  },
  {
    name: "Adafruit PyGamer",
    mcu: "ATSAMD51J19 (Cortex M4)",
  },
  {
    name: "Adafruit Circuit Playground Express",
    mcu: "ATSAMD21G18 (Cortex M0+)",
  },
  {
    name: "Adafruit Circuit Playground Bluefruit",
    mcu: "nRF52840 (Cortex M4 with BLE)",
  },
  {
    name: "Raspberry Pi Pico",
    mcu: "RP2040 (Dual Cortex M0+)",
  },
  {
    name: "Raspberry Pi Pico W",
    mcu: "RP2040 (Dual Cortex M0+)",
  },
  {
    name: "Adafruit Feather M4 Express",
    mcu: "ATSAMD51J19 (Cortex M4)",
  },
  {
    name: "Arduino Uno R3",
    mcu: "ATmega328P",
  },
  {
    name: "ESP32 DevKitC",
    mcu: "ESP32-WROOM-32 (Dual Core Xtensa)",
  },
]

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

export const HwBoardRegistryTool = Tool.define(
  "hw_board_registry",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        query: z.string().describe("VID:PID combination (e.g. '239A:8036') or name search query (e.g. 'PyPortal')"),
      }),
      execute: (params: { query: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const q = params.query.trim()
          const qUpper = q.toUpperCase()

          let results: any[] = []

          // 1. Try querying the open-board-registry SQLite DB directly if installed
          const boardDbPath = path.join(GlobalPath.data, "modules", "open-board-registry", "boards.db")
          if (existsSync(boardDbPath)) {
            const db = new SqliteDb(boardDbPath, { readonly: true })
            try {
              results = db.query(`
                SELECT * FROM boards 
                WHERE id LIKE ? OR name LIKE ? OR mcu LIKE ? OR platform LIKE ? OR vendor LIKE ?
              `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
            } catch (err) {
              // Ignore
            } finally {
              db.close()
            }
          }

          // 2. Semantic vector search. The vector DB is self-contained: each row
          //    stores the full rendered board spec in its `text` column, so matches
          //    can be returned directly even when boards.db is not installed.
          const vectorDbPath = path.join(GlobalPath.data, "modules", "modules_vector.db")
          if (existsSync(vectorDbPath) && results.length === 0) {
            const queryEmbedding = yield* embedEffect(q)
            const vecDb = new SqliteDb(vectorDbPath, { readonly: true })

            try {
              const vectors = vecDb.query(`
                SELECT item_id, text, embedding FROM module_embeddings WHERE module_id = 'open-board-registry'
              `).all() as { item_id: string; text: string; embedding: Buffer }[]

              const scored = vectors.map(v => {
                const vec = new Float32Array(v.embedding.buffer, v.embedding.byteOffset, v.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT)
                return {
                  id: v.item_id,
                  text: v.text,
                  score: cosineSimilarity(queryEmbedding, vec)
                }
              })

              scored.sort((a, b) => b.score - a.score)
              const top = scored.filter(s => s.score > 0.6).slice(0, 5)

              if (top.length > 0) {
                // Prefer the typed rows in boards.db when available, preserving
                // semantic rank order. Fall back to the embedded text payload so
                // the vector DB still works standalone.
                if (existsSync(boardDbPath)) {
                  const db = new SqliteDb(boardDbPath, { readonly: true })
                  try {
                    const placeHolders = top.map(() => "?").join(",")
                    const ids = top.map(t => t.id)
                    const rows = db.query(`
                      SELECT * FROM boards WHERE id IN (${placeHolders})
                    `).all(...ids)

                    const byId = new Map(rows.map(r => [(r as { id: string }).id, r]))
                    results = top
                      .map(t => byId.get(t.id))
                      .filter((r): r is NonNullable<typeof r> => r !== undefined)
                  } finally {
                    db.close()
                  }
                } else {
                  results = top.map(t => ({
                    id: t.id,
                    source: "vector-db",
                    text: t.text,
                  }))
                }
              }
            } catch (err) {
              // Ignore
            } finally {
              vecDb.close()
            }
          }

          // 3. Fallback to hardcoded list if no results from modules
          if (results.length === 0) {
            if (qUpper.includes(":")) {
              const [vid, pid] = qUpper.split(":")
              results = BOARD_DATABASE.filter(
                (b) => b.vid?.toUpperCase() === vid && b.pid?.toUpperCase() === pid
              )
            } else {
              results = BOARD_DATABASE.filter(
                (b) =>
                  b.name.toUpperCase().includes(qUpper) ||
                  b.mcu.toUpperCase().includes(qUpper)
              )
            }
          }

          if (results.length === 0) {
            return {
              title: "hw_board_registry",
              metadata: { found: false, query: params.query, count: 0, results: [] },
              output: `No matching boards found for query "${params.query}".`,
            }
          }

          return {
            title: "hw_board_registry",
            metadata: { found: true, query: params.query, count: results.length, results },
            output: JSON.stringify(results, null, 2),
          }
        }),
    }
  })
)
