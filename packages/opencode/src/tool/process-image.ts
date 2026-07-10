import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { existsSync, statSync } from "fs"
import path from "path"
import { createVisionProvider, loadConfigFromEnv, NO_PROVIDER_ERROR, type VisionResult } from "@/vision/provider"

const DESCRIPTION = [
  "Analyze an image file and return structured JSON describing its contents.",
  "",
  "Returns: { ocr_text, detected_objects, description, diagram_type, components }.",
  "diagram_type is one of: schematic, pcb, photo, datasheet, unknown.",
  "components is an array of { label, confidence } pairs.",
  "",
  "Requires a vision provider to be configured (Ollama with llava, or a cloud provider).",
  "Configure via environment: ARC_VISION_PROVIDER=ollama, ARC_VISION_BASE_URL, ARC_VISION_MODEL.",
].join("\n")

const Parameters = z.object({
  path: z
    .string()
    .describe("Path to the image file to analyze (absolute or relative to working directory)"),
})

function validateImagePath(filePath: string): string {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  if (!existsSync(resolved)) throw new Error(`Image file not found: ${resolved}`)
  const stat = statSync(resolved)
  if (!stat.isFile()) throw new Error(`Path is not a file: ${resolved}`)
  const ext = path.extname(resolved).toLowerCase()
  const supported = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff"]
  if (!supported.includes(ext))
    throw new Error(`Unsupported image format: ${ext}. Supported: ${supported.join(", ")}`)
  return resolved
}

function formatResult(result: VisionResult): string {
  const lines = [
    `Diagram Type: ${result.diagram_type}`,
    ``,
    `Description: ${result.description}`,
    ``,
    `OCR Text: ${result.ocr_text || "(none detected)"}`,
    ``,
    `Detected Objects: ${result.detected_objects.length > 0 ? result.detected_objects.join(", ") : "(none)"}`,
    ``,
    `Components: ${result.components.length > 0 ? result.components.map((c) => `${c.label} (${(c.confidence * 100).toFixed(0)}%)`).join(", ") : "(none)"}`,
  ]
  return lines.join("\n")
}

type ImageMetadata = {
  error?: string
  result: VisionResult | null
}

export const ProcessImageTool = Tool.define(
  "process_image",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const resolved = validateImagePath(params.path)

          const config = loadConfigFromEnv()

          if (config.provider === "none") {
            const metadata: ImageMetadata = { error: NO_PROVIDER_ERROR, result: null }
            return {
              title: `process_image: ${params.path}`,
              metadata,
              output: `Error: ${NO_PROVIDER_ERROR}`,
            }
          }

          const provider = createVisionProvider(config)

          const result = yield* Effect.tryPromise({
            try: () => provider.analyze(resolved),
            catch: (error: unknown) => new Error(error instanceof Error ? error.message : String(error)),
          })

          const metadata: ImageMetadata = { result }
          yield* ctx.metadata({ metadata })

          return {
            title: `process_image: ${params.path}`,
            metadata,
            output: formatResult(result),
          }
        }).pipe(Effect.orDie, Effect.catchIf(
          () => true,
          (error: unknown) =>
            Effect.succeed({
              title: `process_image: ${params.path}`,
              metadata: { error: error instanceof Error ? error.message : String(error), result: null } as ImageMetadata,
              output: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }),
        )),
    }
  })
)
