import type { Hooks, PluginInput } from "@mimo-ai/plugin"

const BASE_URL = process.env.NINE_ROUTER_BASE_URL ?? process.env.PYINTEL_HELIX_BASE_URL ?? "https://api.pyintel.cc/helix"

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
        models: {
          helix: {
            name: "Pyintel Helix",
          },
        },
      }
    },
  }
}