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
  let fetchedModels: Record<string, { name: string; providerID: string }> = {}

  let cleanBase = baseURL.replace(/\/+$/, "")
  let targetUrl = cleanBase.endsWith("/v1") ? `${cleanBase}/models` : `${cleanBase}/v1/models`

  try {
    let res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!res.ok && !cleanBase.endsWith("/v1")) {
      const fallbackUrl = `${cleanBase}/models`
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      })
      if (fallbackRes.ok) {
        res = fallbackRes
        targetUrl = fallbackUrl
      }
    }

    if (res.ok) {
      if (targetUrl.includes("/v1/models") && !cleanBase.endsWith("/v1")) {
        baseURL = `${cleanBase}/v1`
      } else {
        baseURL = cleanBase
      }

      const contentType = res.headers.get("content-type") || ""
      if (contentType && !contentType.includes("json")) {
        const text = await res.text().catch(() => "")
        const cleanPreview = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150)
        toast.show({
          variant: "error",
          message: `Endpoint returned HTML page instead of JSON (${res.status}). Preview: "${cleanPreview}". Please check your endpoint URL.`,
        })
        return
      }

      const data = await res.json().catch(() => null)
      if (!data) {
        toast.show({ variant: "error", message: `Failed to parse JSON response from ${targetUrl}` })
        return
      }

      if (data && data.success === false && data.error) {
        const errMsg = typeof data.error === "string" ? data.error : (data.error.message || data.error.note || JSON.stringify(data.error))
        toast.show({ variant: "error", message: `Helix API Error: ${errMsg}` })
        return
      }
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        fetchedModels = {}
        for (const model of data.data) {
          fetchedModels[model.id] = { name: model.name || model.id, providerID }
        }
      }
    } else {
      const errText = await res.text().catch(() => "")
      const cleanErr = (errText.startsWith("<") || errText.includes("<html") || errText.includes("<!DOCTYPE"))
        ? `HTTP ${res.status} HTML 404 page returned at ${targetUrl}. Ensure your endpoint URL includes /v1.`
        : errText.slice(0, 200)
      toast.show({ variant: "error", message: `Helix server error (${res.status}): ${cleanErr}` })
      return
    }
  } catch (err: any) {
    toast.show({ variant: "error", message: `Failed to connect to Helix endpoint (${targetUrl}): ${err.message || String(err)}` })
    return
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

  const updateRes = await sdk.client.global.config.update(patch as any)
  if (updateRes.error) {
    toast.show({ variant: "error", message: JSON.stringify(updateRes.error) })
    return
  }

  const authRes = await sdk.client.auth.set({
    providerID,
    body: { type: "api", key: apiKey },
  })
  if (authRes.error) {
    toast.show({ variant: "error", message: JSON.stringify(authRes.error) })
    return
  }

  await sdk.client.instance.dispose()
  await sync.bootstrap()
  dialog.replace(() => <DialogModel providerID={providerID} />)
}
