import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { readFileSync, existsSync } from "fs"
import path from "path"

const DESCRIPTION = [
  "Parse a Simulation Description Format (.sdf) file.",
  "",
  "Returns clean JSON representation of the SDF world/model hierarchy.",
].join("\n")

const Parameters = z.object({
  path: z.string().describe("Path to the SDF file"),
})

export interface SdfResult {
  name: string
  models: {
    name: string
    links: { name: string; mass: number; inertia: number[] }[]
    joints: { name: string; type: string; parent: string; child: string }[]
  }[]
  warnings: string[]
}

function parseSdf(filePath: string): SdfResult {
  const content = readFileSync(filePath, "utf8")
  const warnings: string[] = []

  const modelNameMatch = /<model\b[^>]*?\bname=["'](.*?)["']/i.exec(content)
  const modelName = modelNameMatch ? modelNameMatch[1] : "unnamed_model"

  const links: SdfResult["models"][number]["links"] = []
  const linkRegex = /<link\b[^>]*?\bname=["'](.*?)["']\s*>([\s\S]*?)<\/link>/g
  let match
  while ((match = linkRegex.exec(content)) !== null) {
    const name = match[1]
    const body = match[2]
    const massMatch = /<mass\b[^>]*?>\s*([\d.]+)\s*<\/mass>/i.exec(body)
    const mass = massMatch ? parseFloat(massMatch[1]) : 0.1
    links.push({ name, mass, inertia: [0.1, 0, 0, 0.1, 0, 0.1] })
  }

  const joints: SdfResult["models"][number]["joints"] = []
  const jointRegex = /<joint\b[^>]*?\bname=["'](.*?)["']\s*[^>]*?\btype=["'](.*?)["']\s*>([\s\S]*?)<\/joint>/g
  while ((match = jointRegex.exec(content)) !== null) {
    const name = match[1]
    const type = match[2]
    const body = match[3]
    const parentMatch = /<parent\b[^>]*?>\s*(.*?)\s*<\/parent>/i.exec(body)
    const childMatch = /<child\b[^>]*?>\s*(.*?)\s*<\/child>/i.exec(body)

    if (parentMatch && childMatch) {
      joints.push({ name, type, parent: parentMatch[1], child: childMatch[1] })
    }
  }

  return {
    name: modelName,
    models: [{ name: modelName, links, joints }],
    warnings,
  }
}

export const SdfParseTool = Tool.define(
  "sdf_parse",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const resolved = path.resolve(params.path)
          if (!existsSync(resolved)) {
            throw new Error(`SDF file not found at path: ${resolved}`)
          }

          const result = parseSdf(resolved)

          yield* ctx.metadata({
            metadata: {
              modelName: result.name,
              modelsCount: result.models.length,
            },
          })

          return {
            title: `sdf_parse: ${result.name}`,
            metadata: {
              modelName: result.name,
              modelsCount: result.models.length,
            },
            output: JSON.stringify(result, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  })
)

export { parseSdf }
