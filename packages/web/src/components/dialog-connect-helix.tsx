import { Button } from "@pyintel/ui/button"
import { useDialog } from "@pyintel/ui/context/dialog"
import { Dialog } from "@pyintel/ui/dialog"
import { IconButton } from "@pyintel/ui/icon-button"
import { ProviderIcon } from "@pyintel/ui/provider-icon"
import { Spinner } from "@pyintel/ui/spinner"
import { TextField } from "@pyintel/ui/text-field"
import { showToast } from "@pyintel/ui/toast"
import { createSignal } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

export function DialogConnectHelix() {
  const dialog = useDialog()
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const language = useLanguage()

  const [endpoint, setEndpoint] = createSignal("http://cloudvm:20128/v1")
  const [apiKey, setApiKey] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()

  function goBack() {
    void import("./dialog-select-provider").then((x) => {
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    const inputUrl = endpoint().trim()
    const key = apiKey().trim()

    if (!inputUrl) {
      setError("Endpoint URL is required")
      return
    }

    setLoading(true)
    setError(undefined)

    const providerID = "pyintel-helix"
    let cleanBase = inputUrl.replace(/\/+$/, "")
    let targetUrls: string[] = []
    if (cleanBase.endsWith("/v1")) {
      targetUrls = [`${cleanBase}/models`, cleanBase]
    } else {
      targetUrls = [`${cleanBase}/v1/models`, `${cleanBase}/models`, `${cleanBase}/v1`]
    }

    let baseURL = cleanBase
    let fetchedModels: Record<string, { name: string; providerID: string }> = {}
    let logLines: string[] = []
    let success = false

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (key) {
      headers["Authorization"] = `Bearer ${key}`
    }

    console.log("[HelixConnect] Starting discovery...", { inputUrl, cleanBase, targetUrls, hasKey: !!key })

    for (const targetUrl of targetUrls) {
      console.log(`[HelixConnect] Attempting fetch to: ${targetUrl}`)
      try {
        const res = await fetch(targetUrl, { headers }).catch((e) => {
          const msg = `[Fetch Error] ${targetUrl}: ${e?.name} - ${e?.message || String(e)}`
          console.error(msg, e)
          logLines.push(msg)
          return null
        })

        if (!res) {
          logLines.push(`[No Response] ${targetUrl} returned null/network error (CORS or server down?)`)
          continue
        }

        console.log(`[HelixConnect] Response from ${targetUrl}: status=${res.status}, ok=${res.ok}`)
        logLines.push(`[Response] ${targetUrl} → Status ${res.status}`)

        if (res.ok) {
          const contentType = res.headers.get("content-type") || ""
          if (contentType && !contentType.includes("json")) {
            const text = await res.text().catch(() => "")
            const cleanPreview = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
            logLines.push(`[Non-JSON Content-Type ${contentType}] Preview: "${cleanPreview}"`)
            continue
          }

          const data = await res.json().catch((err) => {
            console.error(`[HelixConnect] JSON parse error:`, err)
            logLines.push(`[JSON Parse Error] ${err?.message || String(err)}`)
            return null
          })

          if (!data) continue

          if (data && data.success === false && data.error) {
            const errMsg = typeof data.error === "string" ? data.error : (data.error.message || data.error.note || JSON.stringify(data.error))
            logLines.push(`[Helix API Error] ${errMsg}`)
            continue
          }

          if (data && Array.isArray(data.data) && data.data.length > 0) {
            fetchedModels = {}
            for (const model of data.data) {
              fetchedModels[model.id] = { name: model.name || model.id, providerID }
            }
            logLines.push(`[Models Discovered] Found ${data.data.length} models: ${Object.keys(fetchedModels).join(", ")}`)
          }

          if (targetUrl.endsWith("/v1/models")) {
            baseURL = targetUrl.replace(/\/models$/, "")
          } else if (targetUrl.endsWith("/models")) {
            baseURL = targetUrl.replace(/\/models$/, "")
          } else {
            baseURL = targetUrl
          }

          success = true
          break
        } else {
          const errText = await res.text().catch(() => "")
          const cleanErr = (errText.startsWith("<") || errText.includes("<html") || errText.includes("<!DOCTYPE"))
            ? `HTTP ${res.status} HTML response`
            : errText.slice(0, 150)
          logLines.push(`[HTTP Error ${res.status}] ${cleanErr}`)
        }
      } catch (err: any) {
        const msg = `[Exception] ${targetUrl}: ${err?.name} - ${err?.message || String(err)}`
        console.error(msg, err)
        logLines.push(msg)
      }
    }

    if (!success) {
      const summary = logLines.join("\n")
      console.warn("[HelixConnect] Discovery failed. Summary:\n" + summary)
      setError(`Connection Debug Log:\n${summary}`)
      setLoading(false)
      return
    }

    try {
      const disabledProviders = globalSync.data.config.disabled_providers ?? []
      const nextDisabled = disabledProviders.filter((id) => id !== providerID)

      if (key) {
        await globalSDK.client.auth.set({
          providerID,
          body: {
            type: "api",
            key,
          },
        })
      }

      const providerConfig = {
        name: "Pyintel Helix",
        npm: "@ai-sdk/openai-compatible",
        api: baseURL,
        env: ["PYINTEL_HELIX_API_KEY"],
        options: {
          baseURL,
          setCacheKey: false,
        },
        models: fetchedModels,
      }

      await globalSync.updateConfig({
        provider: { [providerID]: providerConfig as any },
        disabled_providers: nextDisabled,
      })

      await globalSDK.client.global.dispose()
      dialog.close()

      showToast({
        variant: "success",
        icon: "circle-check",
        title: "Pyintel Helix Connected",
        description: `Successfully connected to ${baseURL}`,
      })
    } catch (err: any) {
      setError(err?.message || "Failed to save Pyintel Helix configuration")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={goBack}
          aria-label={language.t("common.goBack")}
        />
      }
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3">
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id="pyintel-helix" class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">Connect Pyintel Helix</div>
        </div>

        <div class="px-2.5 pb-6 flex flex-col gap-6">
          <div class="text-14-regular text-text-base">
            Configure your Pyintel Helix endpoint and API Key to access Helix AI models.
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col items-start gap-4 w-full">
            <TextField
              autofocus
              type="text"
              label="Pyintel Helix Endpoint"
              placeholder="http://cloudvm:20128/v1"
              value={endpoint()}
              onChange={setEndpoint}
            />

            <TextField
              type="password"
              label="Pyintel Helix API Key (Optional if endpoint has no key required)"
              placeholder="sk-..."
              value={apiKey()}
              onChange={setApiKey}
            />

            {error() && (
              <div class="w-full p-3 bg-red-950/40 border border-red-800/60 rounded-md font-mono text-12-mono text-red-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {error()}
              </div>
            )}

            <Button class="w-auto" type="submit" size="large" variant="primary" disabled={loading()}>
              {loading() ? (
                <div class="flex items-center gap-2">
                  <Spinner />
                  <span>Connecting...</span>
                </div>
              ) : (
                language.t("common.continue")
              )}
            </Button>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
