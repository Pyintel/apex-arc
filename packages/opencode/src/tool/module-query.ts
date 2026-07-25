import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { queryModuleKnowledge } from "@/service/module-manager"

const DESCRIPTION = [
  "Query installed offline knowledge modules (e.g. dev board registries, API documentation DBs, framework specs).",
  "Uses vector semantic search to retrieve concise, relevant documentation snippets without bloating the context window.",
].join("\n")

export const ModuleQueryKnowledgeTool = Tool.define(
  "module_query_knowledge",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        query: z.string().describe("The search query or concept to find in installed knowledge modules"),
        moduleId: z.string().optional().describe("Optional specific module ID to query (e.g., 'open-board-registry')"),
        limit: z.number().optional().describe("Number of top matching snippets to return (default 5)"),
      }),
      execute: (params: { query: string; moduleId?: string; limit?: number }, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const results = yield* Effect.promise(() =>
            queryModuleKnowledge(params.query, params.moduleId, params.limit || 5)
          )

          if (results.length === 0) {
            return {
              title: "module_query_knowledge",
              metadata: { count: 0, results: [] },
              output: `No matching records found in installed modules for query "${params.query}".`,
            }
          }

          return {
            title: "module_query_knowledge",
            metadata: { count: results.length, results },
            output: JSON.stringify(results, null, 2),
          }
        }),
    }
  })
)
