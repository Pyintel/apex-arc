import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { getAllAvailableModules, isModuleInstalled, installModule } from "@/service/module-manager"

const DESCRIPTION = [
  "Manage and update Pyintel Arc modules (e.g. 'open-google-workspace', 'open-document-media-suite', 'all').",
  "Updates existing modules by pulling the latest git commits, reinstalling dependencies, and refreshing tools.",
].join("\n")

export const ModuleUpdateTool = Tool.define(
  "module_update",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        moduleId: z.string().optional().describe("Module ID to update (e.g. 'open-google-workspace' or 'all'). Omit to list status."),
        force: z.boolean().optional().describe("Force re-clone and clean reinstall even if up to date"),
      }),
      execute: (params: { moduleId?: string; force?: boolean }, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const allModules = yield* Effect.promise(() => getAllAvailableModules())

          if (!params.moduleId) {
            const statusList = allModules.map((m) => ({
              id: m.id,
              name: m.name,
              source: m.source,
              installed: isModuleInstalled(m.id),
            }))
            return {
              title: "module_update",
              metadata: { count: statusList.length, modules: statusList },
              output: JSON.stringify({ status: "success", modules: statusList }, null, 2),
            }
          }

          const targetIds = params.moduleId.toLowerCase() === "all"
            ? allModules.filter((m) => isModuleInstalled(m.id)).map((m) => m.id)
            : [params.moduleId]

          if (targetIds.length === 0) {
            return {
              title: "module_update",
              metadata: { updated: [] },
              output: JSON.stringify({ status: "warning", message: `No installed modules found matching '${params.moduleId}'` }, null, 2),
            }
          }

          const logs: string[] = []
          for (const id of targetIds) {
            logs.push(`Starting update for module: ${id}...`)
            try {
              yield* Effect.promise(() =>
                installModule(id, (msg) => {
                  logs.push(`[${id}] ${msg}`)
                })
              )
              logs.push(`✅ Successfully updated module: ${id}`)
            } catch (err: any) {
              logs.push(`❌ Failed to update ${id}: ${err.message}`)
            }
          }

          return {
            title: "module_update",
            metadata: { targetIds, logs },
            output: JSON.stringify({ status: "success", updatedModules: targetIds, logs }, null, 2),
          }
        }),
    }
  })
)
