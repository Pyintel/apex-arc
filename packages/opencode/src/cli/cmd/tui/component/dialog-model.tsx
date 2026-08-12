import { createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import { useKeybind } from "../context/keybind"
import { useSDK } from "../context/sdk"
import { useToast, type ToastContext } from "../ui/toast"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useLanguage } from "@tui/context/language"
import * as Model from "../util/model"
import { PROVIDER_PRIORITY } from "@/util/provider-priority"
import * as fuzzysort from "fuzzysort"

const ADD_MODEL_SENTINEL = "__add_model__"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => x.id !== "opencode" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
}
export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const keybind = useKeybind()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()
  const t = useLanguage().t
  const modelName = (providerID: string, modelID: string) =>
    modelID === "arc-auto" ? t("tui.model.arc_auto.name") : Model.name(sync.data.provider, providerID, modelID)

  const showExtra = createMemo(() => connected() && !props.providerID)

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? local.model.favorite() : []
    const recents = local.model.recent()
    // A model already shown in the Favorites/Recent shortcut sections must not
    // appear again in its provider group (show each model at most once).
    const inShortcuts = (providerID: string, modelID: string) =>
      favorites.some((item) => item.providerID === providerID && item.modelID === modelID) ||
      recents.some((item) => item.providerID === providerID && item.modelID === modelID)

    function toOptions(items: typeof favorites, category: string) {
      if (!showSections) return []
      return items.flatMap((item) => {
        const provider = sync.data.provider.find((x) => x.id === item.providerID)
        if (!provider) return []
        const model = provider.models[item.modelID]
        if (!model) return []
        return [
          {
            key: item,
            value: { providerID: provider.id, modelID: model.id },
            title: modelName(provider.id, model.id),
            // Hide provider name for arc-auto to avoid redundancy
            description: item.modelID === "arc-auto" ? undefined : provider.name,
            category,
            disabled: provider.id === "opencode" && model.id.includes("-nano"),
            footer: model.cost?.input === 0 && provider.id === "opencode" ? "Free" : undefined,
            onSelect: () => {
              onSelect(provider.id, model.id)
            },
          },
        ]
      })
    }

    const favoriteOptions = toOptions(favorites, "Favorites")
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      "Recent",
    )

    // arc-free and pyintel provider pinned at top (after favorites/recents)
    const arcProvider = sync.data.provider.find((p) => p.id === "arc")
    const pyintelProvider = sync.data.provider.find((p) => p.id === "pyintel")
    const pinnedCategory = pyintelProvider?.name ?? "Arc"
    // Show pinned section when not scoped to a specific provider
    const showPinned = connected() && !props.providerID

    const pinnedOptions = showPinned
      ? [
          // arc-free model
          ...(arcProvider && "arc-auto" in arcProvider.models && arcProvider.models["arc-auto"].status !== "deprecated" && (!showSections || !inShortcuts("arc", "arc-auto"))
            ? [
                {
                  value: { providerID: "arc", modelID: "arc-auto" },
                  title: modelName("arc", "arc-auto"),
                  description: undefined as string | undefined,
                  category: pinnedCategory,
                  disabled: false,
                  footer: undefined as "Free" | undefined,
                  onSelect() {
                    onSelect("arc", "arc-auto")
                  },
                },
              ]
            : []),
          // pyintel provider models
          ...(pyintelProvider
            ? [
                ...pipe(
                  pyintelProvider.models,
                  entries(),
                  filter(([_, info]) => info.status !== "deprecated"),
                  map(([model, info]) => ({
                    value: { providerID: pyintelProvider.id, modelID: model },
                    title: info.name ?? model,
                    description: undefined as string | undefined,
                    category: pinnedCategory,
                    disabled: false,
                    footer: undefined as "Free" | undefined,
                    onSelect() {
                      onSelect(pyintelProvider.id, model)
                    },
                  })),
                  filter((x) => !showSections || !inShortcuts(x.value.providerID, x.value.modelID)),
                ),
                // "+ Add model" for config-sourced providers
                ...(pyintelProvider.source === "config"
                  ? [
                      {
                        value: { providerID: pyintelProvider.id, modelID: ADD_MODEL_SENTINEL },
                        title: "+ Add model",
                        description: undefined,
                        category: pinnedCategory,
                        disabled: false,
                        footer: undefined as "Free" | undefined,
                        onSelect() {
                          void runAddModelWizard({ dialog, sdk, sync, toast, providerID: pyintelProvider.id })
                        },
                      },
                    ]
                  : []),
              ]
            : []),
        ]
      : []

    const providerOptions = pipe(
      sync.data.provider,
      // Exclude pyintel/arc from regular list only when pinned section is shown
      filter((provider) => !showPinned || (provider.id !== "pyintel" && provider.id !== "arc")),
      sortBy(
        (provider) => provider.id !== "opencode",
        (provider) => PROVIDER_PRIORITY[provider.id] ?? 99,
        (provider) => provider.name,
      ),
      flatMap((provider) => {
        const models = pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          // Scoped views ("you just connected provider X, pick a model from X")
          // intentionally show only that provider's own models. The free
          // arc-auto belongs to the `arc` provider, so it is NOT surfaced
          // here — it stays pinned in the unscoped picker. Don't re-add it.
          filter(([_, info]) => (props.providerID ? (info.providerID ?? provider.id) === props.providerID : true)),
          map(([model, info]) => ({
            value: { providerID: provider.id, modelID: model },
            title: info.name ?? model,
            description: undefined as string | undefined,
            category: connected() ? provider.name : undefined,
            disabled: provider.id === "opencode" && model.includes("-nano"),
            footer: info.cost?.input === 0 && provider.id === "opencode" ? "Free" : undefined,
            onSelect() {
              onSelect(provider.id, model)
            },
          })),
          // Favorites/recents live in their own sections; don't repeat them here.
          filter((x) => {
            if (!showSections) return true
            return !inShortcuts(x.value.providerID, x.value.modelID)
          }),
          sortBy(
            (x) => x.footer !== "Free",
            (x) => x.title,
          ),
        )
        if (provider.source !== "config") return models
        if (props.providerID && props.providerID !== provider.id) return models
        return [
          ...models,
          {
            value: { providerID: provider.id, modelID: ADD_MODEL_SENTINEL },
            title: "+ Add model",
            description: undefined,
            category: connected() ? provider.name : undefined,
            disabled: false,
            footer: undefined as "Free" | undefined,
            onSelect() {
              void runAddModelWizard({ dialog, sdk, sync, toast, providerID: provider.id })
            },
          },
        ]
      }),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...fuzzysort.go(needle, pinnedOptions, { keys: ["title", "category"] }).map((x) => x.obj),
        ...fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
        ...fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj),
      ]
    }

    return [...favoriteOptions, ...recentOptions, ...pinnedOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((x) => x.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    const value = provider()
    if (!value) return "Select model"
    return value.name
  })

  function onSelect(providerID: string, modelID: string) {
    local.model.set({ providerID, modelID }, { recent: true })
    const list = local.model.variant.list()
    const cur = local.model.variant.selected()
    if (cur === "default" || (cur && list.includes(cur))) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      options={options()}
      keybind={[
        {
          keybind: keybind.all.model_refresh?.[0],
          title: "Refresh",
          side: "left",
          onTrigger: () => {
            void refreshModelsFromProviders({ sdk, sync, toast, dialog })
          },
        },
        {
          keybind: keybind.all.model_provider_list?.[0],
          title: "Connect provider",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          keybind: keybind.all.model_favorite_toggle?.[0],
          title: "Favorite",
          disabled: !connected(),
          onTrigger: (option) => {
            const v = option.value as { providerID: string; modelID: string }
            if (v.modelID === ADD_MODEL_SENTINEL) return
            local.model.toggleFavorite(v)
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      title={title()}
      hint={t("tui.dialog.model.login_hint")}
      current={local.model.current()}
    />
  )
}

async function runAddModelWizard(opts: {
  dialog: DialogContext
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  toast: ToastContext
  providerID: string
}) {
  const { dialog, sdk, sync, toast, providerID } = opts

  function step(n: number, total: number, title: string, placeholder?: string, value?: string) {
    return DialogPrompt.show(dialog, `${title} (${n}/${total})`, { placeholder, value })
  }

  const modelIDRaw = await step(1, 2, "Model id", "gateway model id")
  if (modelIDRaw === null) return
  const modelID = modelIDRaw.trim()
  if (!modelID) return

  const modelNameRaw = await step(2, 2, "Display name", "shown in model picker", modelID)
  if (modelNameRaw === null) return
  const modelName = modelNameRaw.trim() || modelID

  const patch = {
    provider: {
      [providerID]: {
        models: {
          [modelID]: {
            name: modelName,
          },
        },
      },
    },
  }

  const updateRes = await sdk.client.global.config.update(patch as any)
  if (updateRes.error) {
    toast.show({ variant: "error", message: JSON.stringify(updateRes.error) })
    return
  }

  await sdk.client.instance.dispose()
  await sync.bootstrap()
  dialog.replace(() => <DialogModel providerID={providerID} />)
}

async function refreshModelsFromProviders(opts: {
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  toast: ToastContext
  dialog: DialogContext
}) {
  const { sdk, sync, toast, dialog } = opts
  const providers = sync.data.provider
  let refreshed = false

  for (const provider of providers) {
    if (provider.id === "opencode") continue
    if (!provider.api) continue

    try {
      const url = `${sdk.url}/${provider.id}/models/refresh`
      const res = await sdk.fetch(url, {
        method: "POST",
      })

      if (!res.ok) {
        continue
      }

      const data = await res.json()
      if (data && data.refreshed) {
        refreshed = true
      }
    } catch (err) {
      toast.show({ variant: "error", message: `Error refreshing ${provider.id}: ${err}` })
    }
  }

  if (refreshed) {
    toast.show({ variant: "success", message: "Models refreshed" })
  } else {
    toast.show({ variant: "info", message: "No models to refresh. Reconnect provider to update." })
  }

  await sdk.client.instance.dispose()
  await sync.bootstrap()
  dialog.replace(() => <DialogModel />)
}
