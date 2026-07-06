import { Effect } from "effect"
import { z } from "zod"
import { Database } from "../storage"
import { embedEffect } from "../util/embeddings"
import * as Tool from "./tool"

export const id = "local_codesearch"
export const description = "Search the local codebase semantically using vector embeddings."

export const parameters = z.object({
  query: z.string().describe("Natural language query to search for (e.g. 'OAuth login logic')."),
  limit: z.number().optional().default(5).describe("Max results to return."),
  depth: z.number().optional().default(1).describe("Graph traversal depth for related context."),
})

// Define cosine similarity function in JS
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

export const execute = Effect.fn("LocalCodeSearchTool")(function* (input: z.infer<typeof parameters>) {
  const queryEmbedding = yield* embedEffect(input.query)

  // Since we don't have vector search built into standard sqlite, we do it in memory.
  // In a real production system with lots of vectors, use sqlite-vss or faiss,
  // but for local workspace this is generally fast enough.
  const vectors = Database.Client().$client.query(`
      SELECT symbol_id, embedding FROM cg_vectors
  `).all() as { symbol_id: number, embedding: Buffer }[]

  const scored = vectors.map(v => {
      // Buffer to Float32Array
      const vec = new Float32Array(v.embedding.buffer, v.embedding.byteOffset, v.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT)
      return {
          symbol_id: v.symbol_id,
          score: cosineSimilarity(queryEmbedding, vec)
      }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, input.limit)

  if (top.length === 0) {
      return "No results found."
  }

  let output = ""
  for (const match of top) {
      const symbol = Database.Client().$client.query(`
          SELECT name, type, file_path, start_line, end_line, body_content
          FROM cg_symbols WHERE id = ?
      `).get(match.symbol_id) as any

      if (!symbol) continue

      output += `\n### [Score: ${match.score.toFixed(3)}] ${symbol.type} \`${symbol.name}\` in \`${symbol.file_path}\` (Lines ${symbol.start_line}-${symbol.end_line})\n`
      output += "```\n" + symbol.body_content + "\n```\n"

      if (input.depth > 0) {
          const callers = Database.Client().$client.query(`
              SELECT s.name, s.type, s.file_path
              FROM cg_edges e
              JOIN cg_symbols s ON e.from_symbol_id = s.id
              WHERE e.to_symbol_id = ? AND e.type = 'calls'
          `).all(match.symbol_id) as any[]

          if (callers.length > 0) {
              output += "  **Called By:**\n"
              for (const c of callers) {
                  output += `    - ${c.type} \`${c.name}\` in \`${c.file_path}\`\n`
              }
          }

          const calls = Database.Client().$client.query(`
              SELECT s.name, s.type, s.file_path
              FROM cg_edges e
              JOIN cg_symbols s ON e.to_symbol_id = s.id
              WHERE e.from_symbol_id = ? AND e.type = 'calls'
          `).all(match.symbol_id) as any[]

          if (calls.length > 0) {
              output += "  **Calls:**\n"
              for (const c of calls) {
                  output += `    - ${c.type} \`${c.name}\` in \`${c.file_path}\`\n`
              }
          }
      }
  }

  return output
})
