import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers"
import { Effect } from "effect"
import path from "path"
import { Global } from "../global"

env.cacheDir = path.join(Global.Path.data, "models")

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

export async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    }) as Promise<FeatureExtractionPipeline>
  }
  return extractorPromise
}

export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor()
  const output = await extractor(text, { pooling: "mean", normalize: true })
  // @ts-ignore
  return new Float32Array(output.data)
}

export const embedEffect = (text: string) => Effect.promise(() => embed(text))
