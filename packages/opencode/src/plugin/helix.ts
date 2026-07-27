import type { Hooks, PluginInput } from "@pyintel/plugin"
import type { Model } from "@pyintel/sdk/v2"

const BASE_URL =
  process.env.NINE_ROUTER_BASE_URL ??
  process.env.PYINTEL_HELIX_BASE_URL ??
  "http://localhost:20128/v1"

async function fetchHelixModels(
  baseURL: string,
  apiKey: string | undefined,
  existing: Record<string, Model>,
): Promise<Record<string, Model>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`

  const cleanBase = baseURL.replace(/\/+$/, "")
  const primaryUrl = cleanBase.endsWith("/v1") ? `${cleanBase}/models` : `${cleanBase}/v1/models`

  let res = await fetch(primaryUrl, { headers, signal: AbortSignal.timeout(5_000) }).catch(() => null)
  if (!res || !res.ok) {
    if (!cleanBase.endsWith("/v1")) {
      const fallbackUrl = `${cleanBase}/models`
      res = await fetch(fallbackUrl, { headers, signal: AbortSignal.timeout(5_000) }).catch(() => null)
    }
  }

  if (!res || !res.ok) return existing

  const contentType = res.headers.get("content-type") || ""
  if (contentType && !contentType.includes("json")) return existing

  const data = await res.json().catch(() => null)
  if (!data || !Array.isArray(data.data) || data.data.length === 0) return existing

  const result: Record<string, Model> = { ...existing }
  for (const m of data.data) {
    const id: string = m.id
    const caps = m.capabilities || {}
    result[id] = {
      id,
      providerID: "pyintel-helix",
      api: {
        id,
        url: cleanBase.endsWith("/v1") ? cleanBase : `${cleanBase}/v1`,
        npm: "@ai-sdk/openai-compatible",
      },
      status: "active",
      name: m.name || id,
      capabilities: {
        temperature: caps.temperature ?? existing[id]?.capabilities?.temperature ?? true,
        reasoning: caps.reasoning ?? existing[id]?.capabilities?.reasoning ?? false,
        attachment: caps.attachment ?? existing[id]?.capabilities?.attachment ?? false,
        toolcall: caps.tools ?? caps.toolcall ?? existing[id]?.capabilities?.toolcall ?? true,
        input: {
          text: true,
          audio: caps.audioInput ?? false,
          image: caps.vision ?? false,
          video: caps.videoInput ?? false,
          pdf: caps.pdf ?? false,
        },
        output: {
          text: true,
          audio: caps.audioOutput ?? false,
          image: caps.imageOutput ?? false,
          video: false,
          pdf: false,
        },
        interleaved: false,
      },
      limit: {
        context: caps.contextWindow ?? existing[id]?.limit?.context ?? 128000,
        input: caps.contextWindow ?? existing[id]?.limit?.input ?? 128000,
        output: caps.maxOutput ?? existing[id]?.limit?.output ?? 64000,
      },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      options: existing[id]?.options ?? {},
      headers: existing[id]?.headers ?? {},
      release_date: existing[id]?.release_date,
      variants: existing[id]?.variants ?? {},
    }
  }
  return result
}

export async function HelixOnlyPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    config: async (input) => {
      input.enabled_providers ??= ["pyintel-helix"]
      input.provider ??= {}
      input.provider["pyintel-helix"] ??= {
        name: "Pyintel Helix",
        npm: "@ai-sdk/openai-compatible",
        api: BASE_URL,
        env: ["NINE_ROUTER_API_KEY", "PYINTEL_HELIX_API_KEY"],
        options: {
          baseURL: BASE_URL,
          setCacheKey: false,
        },
        models: {},
      }
    },
    provider: {
      id: "pyintel-helix",
      async models(provider, ctx) {
        const apiKey =
          ctx.auth?.type === "api" ? ctx.auth.key : (process.env.NINE_ROUTER_API_KEY ?? process.env.PYINTEL_HELIX_API_KEY)
        const baseUrl = (provider.options as any)?.baseURL ?? provider.api ?? BASE_URL
        return fetchHelixModels(baseUrl, apiKey, provider.models).catch(() => provider.models)
      },
    },
  }
}
