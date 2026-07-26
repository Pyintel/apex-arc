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

  const url = `${baseURL.replace(/\/+$/, "")}/models`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) })
  if (!res.ok) throw new Error(`helix /models returned ${res.status}`)

  const data = await res.json()
  if (!data || !Array.isArray(data.data)) throw new Error("helix /models unexpected shape")

  const result: Record<string, Model> = { ...existing }
  for (const m of data.data) {
    const id: string = m.id
    result[id] = {
      id,
      providerID: "pyintel-helix",
      api: {
        id,
        url: baseURL,
        npm: "@ai-sdk/openai-compatible",
      },
      status: "active",
      name: m.name || id,
      capabilities: {
        temperature: existing[id]?.capabilities.temperature ?? true,
        reasoning: existing[id]?.capabilities.reasoning ?? false,
        attachment: existing[id]?.capabilities.attachment ?? false,
        toolcall: existing[id]?.capabilities.toolcall ?? true,
        input: { text: true, audio: false, image: false, video: false, pdf: false },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
      },
      limit: existing[id]?.limit ?? {},
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
        return fetchHelixModels(BASE_URL, apiKey, provider.models).catch(() => provider.models)
      },
    },
  }
}
