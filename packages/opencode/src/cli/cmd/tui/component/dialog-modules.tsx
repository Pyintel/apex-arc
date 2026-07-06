import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { Spinner } from "./spinner"
import { AVAILABLE_MODULES, isModuleInstalled, installModule, uninstallModule } from "@/service/module-manager"
import { createSignal, createMemo, Show, batch } from "solid-js"
import { TextAttributes } from "@opentui/core"

export function DialogModules() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const toast = useToast()

  const [status, setStatus] = createSignal<"list" | "select-provider" | "installing">("list")
  const [progress, setProgress] = createSignal("")
  const [refreshTrigger, setRefreshTrigger] = createSignal(0)
  const [pendingModule, setPendingModule] = createSignal<{ id: string; title: string } | null>(null)

  const rows = createMemo(() => {
    refreshTrigger()
    return AVAILABLE_MODULES.map((m) => {
      const installed = isModuleInstalled(m.id)
      return {
        title: m.name,
        value: m.id,
        description: m.description,
        footer: installed ? "Installed (Press Enter to Uninstall)" : "Not Installed (Press Enter to Install)",
        category: "Available Modules",
      } as DialogSelectOption<string>
    })
  })

  const handleSelect = async (item: DialogSelectOption<string>) => {
    const moduleId = item.value
    const installed = isModuleInstalled(moduleId)

    if (installed) {
      const confirmUninstall = await DialogConfirm.show(
        dialog,
        "Uninstall Module",
        `Do you want to uninstall "${item.title}" and remove its embedded knowledge base?`
      )

      if (confirmUninstall) {
        batch(() => {
          setStatus("installing")
          setProgress("Uninstalling module...")
        })

        try {
          await uninstallModule(moduleId)
          toast.show({
            message: `Successfully uninstalled module: ${item.title}`,
            variant: "success",
          })
        } catch (err) {
          toast.show({
            message: `Failed to uninstall module: ${err instanceof Error ? err.message : String(err)}`,
          })
        } finally {
          batch(() => {
            setRefreshTrigger((x) => x + 1)
            setStatus("list")
          })
          dialog.replace(() => <DialogModules />)
        }
      } else {
        dialog.replace(() => <DialogModules />)
      }
      return
    }

    batch(() => {
      setPendingModule({ id: moduleId, title: item.title })
      setStatus("select-provider")
    })
  }

  const startInstallation = (engine: "local" | "cloud") => {
    const moduleInfo = pendingModule()
    if (!moduleInfo) return

    batch(() => {
      setStatus("installing")
      setProgress(
        engine === "local"
          ? "Downloading lightweight local embedding model..."
          : "Connecting to cloud embedding provider..."
      )
    })

    // Run the installation
    installModule(moduleInfo.id, (msg) => {
      setProgress(msg)
    })
      .then(() => {
        toast.show({
          message: `Successfully installed module using ${engine} engine: ${moduleInfo.title}`,
          variant: "success",
        })
        batch(() => {
          setRefreshTrigger((x) => x + 1)
          setStatus("list")
          setPendingModule(null)
        })
      })
      .catch((err) => {
        toast.show({
          message: `Failed to install module: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        })
        batch(() => {
          setStatus("list")
          setPendingModule(null)
        })
      })
  }

  const providerOptions: DialogSelectOption<"local" | "cloud">[] = [
    {
      title: "Local Model (Recommended)",
      value: "local",
      description: "Downloads and runs a lightweight open-source model locally.",
    },
    {
      title: "Cloud Provider APIs",
      value: "cloud",
      description: "Uses external cloud providers like OpenAI or Cohere (requires credentials).",
    },
  ]

  return (
    <box>
      <Show when={status() === "list"}>
        <DialogSelect
          title="Modules"
          hint="Select a module to install or uninstall"
          options={rows()}
          onSelect={handleSelect}
        />
      </Show>

      <Show when={status() === "select-provider"}>
        <DialogSelect
          title="Choose Embedding Engine"
          hint="Select where to run vector embeddings generation"
          options={providerOptions}
          onSelect={(item) => startInstallation(item.value)}
        />
      </Show>

      <Show when={status() === "installing"}>
        <box paddingLeft={4} paddingRight={4} paddingTop={2} paddingBottom={2} gap={1}>
          <text attributes={TextAttributes.BOLD} fg={theme.text}>
            Processing Module...
          </text>
          <box paddingTop={1} paddingBottom={1}>
            <Spinner>{progress()}</Spinner>
          </box>
        </box>
      </Show>
    </box>
  )
}
