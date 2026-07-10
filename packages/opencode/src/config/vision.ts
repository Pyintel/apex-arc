export * as ConfigVision from "./vision"

import z from "zod"

export const VisionProviderSchema = z.object({
  provider: z
    .enum(["ollama", "cloud", "none"])
    .describe("Vision provider type")
    .default("none"),
  base_url: z
    .string()
    .describe("Base URL for the vision provider API")
    .default("http://localhost:11434"),
  model: z
    .string()
    .describe("Model name for vision inference (e.g. llava, llava-llama3)")
    .default("llava"),
  api_key: z
    .string()
    .describe("API key for cloud providers (optional for local)")
    .optional(),
  timeout_ms: z
    .number()
    .describe("Request timeout in milliseconds")
    .default(30_000),
})

export type VisionProviderConfig = z.infer<typeof VisionProviderSchema>
