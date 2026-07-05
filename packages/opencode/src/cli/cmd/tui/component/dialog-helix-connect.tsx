import { onMount } from "solid-js"
import { useSDK } from "../context/sdk"
import { useSync } from "@tui/context/sync"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { type ToastContext, useToast } from "../ui/toast"
import { DialogModel } from "./dialog-model"

export function DialogHelixConnect() {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()

  onMount(async () => {
    await runHelixProviderWizard({ dialog, sdk, sync, toast })
  })

  return <box />
}

export async function runHelixProviderWizard(opts: {
  dialog: DialogContext
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  toast: ToastContext
}) {
  const { dialog, sdk, sync, toast } = opts

  function step(n: number, total: number, title: string, placeholder?: string, value?: string) {
    return DialogPrompt.show(dialog, `${title} (${n}/${total})`, { placeholder, value })
  }

  const baseURLRaw = await step(1, 2, "Pyintel Helix Endpoint", "https://api.pyintel.cc/helix", "https://api.pyintel.cc/helix")
  if (baseURLRaw === null) return
  let baseURL = baseURLRaw.trim()
  if (!baseURL) return

  const apiKeyRaw = await step(2, 2, "Pyintel Helix API Key", "sk-...")
  if (apiKeyRaw === null) return
  const apiKey = apiKeyRaw.trim()
  if (!apiKey) return

  const providerID = "pyintel-helix"

  let fetchedModels: Record<string, { name: string }> = {
    helix: { name: "Pyintel Helix" },
  }

  try {
    let modelsUrl = `${baseURL.replace(/\/+$/, "")}/models`
    let res = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })
    
    if (!res.ok && !baseURL.endsWith("/v1")) {
      modelsUrl = `${baseURL.replace(/\/+$/, "")}/v1/models`
      res = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      })
      if (res.ok) {
        baseURL = `${baseURL.replace(/\/+$/, "")}/v1`
      }
    }

    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        fetchedModels = {}
        for (const model of data.data) {
          fetchedModels[model.id] = { name: model.name || model.id }
        }
      }
    }
  } catch (err) {
    // fallback to default if fetch fails
  }

  const patch = {
    provider: {
      [providerID]: {
        name: "Pyintel Helix",
        npm: "@ai-sdk/openai-compatible",
        api: baseURL,
        env: ["PYINTEL_HELIX_API_KEY"],
        options: {
          baseURL,
          setCacheKey: false,
        },
        models: fetchedModels,
      },
    },
  } as const

  const updateRes = await sdk.client.global.config.update({ config: patch as any })
  if (updateRes.error) {
    toast.show({ variant: "error", message: JSON.stringify(updateRes.error) })
    return
  }

  const authRes = await sdk.client.auth.set({
    providerID,
    auth: { type: "api", key: apiKey },
  })
  if (authRes.error) {
    toast.show({ variant: "error", message: JSON.stringify(authRes.error) })
    return
  }

  await sdk.client.instance.dispose()
  await sync.bootstrap()
  dialog.replace(() => <DialogModel providerID={providerID} />)
}
