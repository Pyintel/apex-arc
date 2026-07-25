import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers"
import { Effect } from "effect"
import path from "path"
import fs from "fs/promises"
import { existsSync } from "fs"
import { Global } from "../global"

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2"
env.cacheDir = path.join(Global.Path.data, "models")

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

export function getModelCacheDir(): string {
  return path.join(Global.Path.data, "models")
}

export function isModelDownloaded(modelName = DEFAULT_MODEL): boolean {
  const cacheDir = getModelCacheDir()
  // Xenova models are cached under models/Xenova--<name> or ONNX cache
  const normalized = modelName.replace("/", "--")
  const targetDir = path.join(cacheDir, normalized)
  const xenovaDir = path.join(cacheDir, "Xenova", modelName.split("/")[1] || "")
  const onnxDir = path.join(cacheDir, modelName)
  return existsSync(targetDir) || existsSync(xenovaDir) || existsSync(onnxDir) || existsSync(cacheDir)
}

export async function listDownloadedModels(): Promise<{ name: string; path: string; sizeBytes: number }[]> {
  const cacheDir = getModelCacheDir()
  if (!existsSync(cacheDir)) return []

  const entries = await fs.readdir(cacheDir, { withFileTypes: true })
  const result: { name: string; path: string; sizeBytes: number }[] = []

  for (const entry of entries) {
    if (entry.name === "version") continue
    const fullPath = path.join(cacheDir, entry.name)
    let size = 0
    try {
      if (entry.isDirectory()) {
        const files = await fs.readdir(fullPath, { recursive: true })
        for (const f of files) {
          const st = await fs.stat(path.join(fullPath, f)).catch(() => null)
          if (st && st.isFile()) size += st.size
        }
      } else {
        const st = await fs.stat(fullPath)
        size = st.size
      }
    } catch {}

    const readableName = entry.name.replace("--", "/")
    result.push({ name: readableName, path: fullPath, sizeBytes: size })
  }

  return result
}

export async function deleteDownloadedModel(modelPathOrName: string): Promise<void> {
  const cacheDir = getModelCacheDir()
  const target = path.isAbsolute(modelPathOrName)
    ? modelPathOrName
    : path.join(cacheDir, modelPathOrName.replace("/", "--"))

  if (existsSync(target)) {
    await fs.rm(target, { recursive: true, force: true })
  }
}

export async function getExtractor(modelName = DEFAULT_MODEL) {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", modelName, {
      quantized: true,
    }) as Promise<FeatureExtractionPipeline>
  }
  return extractorPromise
}

export async function embed(text: string, modelName = DEFAULT_MODEL): Promise<Float32Array> {
  const extractor = await getExtractor(modelName)
  const output = await extractor(text, { pooling: "mean", normalize: true })
  // @ts-ignore
  return new Float32Array(output.data)
}

export const embedEffect = (text: string) => Effect.promise(() => embed(text))
