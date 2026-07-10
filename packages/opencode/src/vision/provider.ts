import { readFile } from "fs/promises"
import type { VisionProviderConfig } from "@/config/vision"

export interface VisionResult {
  ocr_text: string
  detected_objects: string[]
  description: string
  diagram_type: "schematic" | "pcb" | "photo" | "datasheet" | "unknown"
  components: { label: string; confidence: number }[]
}

export interface VisionProvider {
  readonly id: string
  analyze(imagePath: string): Promise<VisionResult>
}

const NO_PROVIDER_ERROR =
  "No vision provider configured. Set ARC_VISION_PROVIDER=ollama or ARC_VISION_PROVIDER=cloud in environment, or configure vision in config."

class NoVisionProvider implements VisionProvider {
  readonly id = "none"
  async analyze(_imagePath: string): Promise<VisionResult> {
    throw new Error(NO_PROVIDER_ERROR)
  }
}

function parseOllamaResponse(raw: string): VisionResult {
  const result: VisionResult = {
    ocr_text: "",
    detected_objects: [],
    description: "",
    diagram_type: "unknown",
    components: [],
  }

  const lower = raw.toLowerCase()

  if (lower.includes("schematic") || lower.includes("circuit diagram"))
    result.diagram_type = "schematic"
  else if (lower.includes("pcb") || lower.includes("printed circuit"))
    result.diagram_type = "pcb"
  else if (lower.includes("datasheet") || lower.includes("pinout") || lower.includes("pin diagram"))
    result.diagram_type = "datasheet"
  else if (lower.includes("photo") || lower.includes("photograph") || lower.includes("image of"))
    result.diagram_type = "photo"
  else result.diagram_type = "unknown"

  result.description = raw.trim()

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean)
  const ocrLines = lines.filter((l) =>
    /^(text|ocr|found|detected|content|visible)[: ]/i.test(l) || l.length > 20
  )
  result.ocr_text = ocrLines.join("\n")

  const objectKeywords = [
    "resistor", "capacitor", "inductor", "diode", "transistor",
    "microcontroller", "sensor", "connector", "chip", "motor",
    "servo", "battery", "switch", "relay", "transformer", "crystal",
    "antenna", "camera", "display", "button", "potentiometer", "header",
    "led", "ic",
  ]
  const found = new Set<string>()
  for (const kw of objectKeywords) {
    const re = new RegExp(`\\b${kw}s?\\b`, "i")
    if (re.test(lower)) found.add(kw)
  }
  result.detected_objects = [...found]

  for (const line of lines) {
    const match = /^(.+?)\s*[-:]\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(line)
    if (match) {
      const label = match[1].trim().toLowerCase()
      if (objectKeywords.some((kw) => label.includes(kw)) || label.length < 40) {
        result.components.push({
          label,
          confidence: Math.min(1, Number(match[2]) / 100),
        })
      }
    }
  }

  return result
}

class OllamaVisionProvider implements VisionProvider {
  readonly id = "ollama"
  readonly baseUrl: string
  readonly model: string
  readonly timeoutMs: number

  constructor(config: VisionProviderConfig) {
    this.baseUrl = config.base_url.replace(/\/+$/, "")
    this.model = config.model
    this.timeoutMs = config.timeout_ms
  }

  async analyze(imagePath: string): Promise<VisionResult> {
    const imageBuffer = await readFile(imagePath)
    const base64 = imageBuffer.toString("base64")

    const body = JSON.stringify({
      model: this.model,
      prompt:
        "Analyze this image. Provide: 1) Any visible text (OCR), 2) A list of detected objects/components, 3) A description, 4) The diagram type (schematic, pcb, photo, datasheet, or unknown). Format as structured text.",
      images: [base64],
      stream: false,
    })

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!res.ok) throw new Error(`Ollama vision request failed: ${res.status} ${res.statusText}`)

    const data = await res.json()
    return parseOllamaResponse(data.response || "")
  }
}

class CloudVisionProvider implements VisionProvider {
  readonly id = "cloud"
  readonly baseUrl: string
  readonly model: string
  readonly apiKey: string | undefined
  readonly timeoutMs: number

  constructor(config: VisionProviderConfig) {
    this.baseUrl = config.base_url.replace(/\/+$/, "")
    this.model = config.model
    this.apiKey = config.api_key
    this.timeoutMs = config.timeout_ms
  }

  async analyze(imagePath: string): Promise<VisionResult> {
    if (!this.apiKey) throw new Error("Cloud vision provider requires an API key. Set ARC_VISION_API_KEY.")

    const imageBuffer = await readFile(imagePath)
    const base64 = imageBuffer.toString("base64")

    const body = JSON.stringify({
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image and return JSON with: ocr_text, detected_objects (array), description, diagram_type (schematic|pcb|photo|datasheet|unknown), components (array of {label, confidence 0-1}).",
            },
            { type: "image_url", image_url: `data:image/png;base64,${base64}` },
          ],
        },
      ],
      max_tokens: 2000,
    })

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!res.ok) throw new Error(`Cloud vision request failed: ${res.status} ${res.statusText}`)

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ""

    const jsonMatch = /\{[\s\S]*\}/.exec(content)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as VisionResult
    }
    return parseOllamaResponse(content)
  }
}

export function createVisionProvider(config: VisionProviderConfig): VisionProvider {
  if (config.provider === "ollama") return new OllamaVisionProvider(config)
  if (config.provider === "cloud") return new CloudVisionProvider(config)
  return new NoVisionProvider()
}

export function loadConfigFromEnv(): VisionProviderConfig {
  const provider = (process.env.ARC_VISION_PROVIDER as VisionProviderConfig["provider"]) || "none"
  const base_url = process.env.ARC_VISION_BASE_URL || "http://localhost:11434"
  const model = process.env.ARC_VISION_MODEL || "llava"
  const api_key = process.env.ARC_VISION_API_KEY
  const timeout_ms = Number(process.env.ARC_VISION_TIMEOUT_MS) || 30_000
  return { provider, base_url, model, api_key, timeout_ms }
}

export { parseOllamaResponse, NO_PROVIDER_ERROR }
