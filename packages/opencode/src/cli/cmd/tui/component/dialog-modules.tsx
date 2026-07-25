import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { Spinner } from "./spinner"
import {
  getAllAvailableModules,
  isModuleInstalled,
  installModule,
  uninstallModule,
  type ModuleInfo,
} from "@/service/module-manager"
import { useSDK } from "@tui/context/sdk"
import { createSignal, createResource, Show, batch } from "solid-js"
import { TextAttributes } from "@opentui/core"

export function DialogModules() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const toast = useToast()
  const sdk = useSDK()


  const [status, setStatus] = createSignal<"list" | "select-provider" | "installing">("list")
  const [progress, setProgress] = createSignal("")
  const [pendingModule, setPendingModule] = createSignal<{ id: string; title: string; source?: string } | null>(null)

  const [modules, { refetch }] = createResource(getAllAvailableModules)

  const rows = () => {
    const list = modules() || []
    const options: DialogSelectOption<string>[] = list.map((m) => {
      const installed = isModuleInstalled(m.id)
      return {
        title: m.name,
        value: m.id,
        description: m.description,
        footer: installed ? "Installed (Press Enter to Uninstall)" : "Not Installed (Press Enter to Install)",
        category: installed ? "Installed Modules" : "Available Modules",
      }
    })
    return options
  }

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
          void sdk.client.tool.reload().catch(() => {})
          void sdk.client.skill.reload().catch(() => {})
          toast.show({
            message: `Successfully uninstalled module: ${item.title}`,
            variant: "success",
          })
        } catch (err) {
          toast.show({
            message: `Failed to uninstall module: ${err instanceof Error ? err.message : String(err)}`,
            variant: "error",
          })
        } finally {
          refetch()
          setStatus("list")
          dialog.replace(() => <DialogModules />)
        }
      } else {
        dialog.replace(() => <DialogModules />)
      }
      return
    }

    const found = modules()?.find((m) => m.id === moduleId)
    batch(() => {
      setPendingModule({ id: moduleId, title: item.title, source: found?.source })
      setStatus("select-provider")
    })
  }

  const startInstallation = (engine: "local" | "cloud") => {
    const moduleInfo = pendingModule()
    if (!moduleInfo) return

    batch(() => {
      setStatus("installing")
      setProgress(`Initializing ${moduleInfo.title}...`)
    })

    installModule(
      moduleInfo.id,
      (msg) => {
        setProgress(msg)
      },
      moduleInfo.source
    )
      .then(() => {
        void sdk.client.tool.reload().catch(() => {})
        void sdk.client.skill.reload().catch(() => {})
        toast.show({
          message: `Successfully installed module: ${moduleInfo.title}`,
          variant: "success",
        })

        refetch()
        batch(() => {
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
      title: "Local Embedding Model (Recommended)",
      value: "local",
      description: "Vectorizes knowledge base locally using lightweight embeddings.",
    },
    {
      title: "Cloud Provider APIs",
      value: "cloud",
      description: "Uses cloud provider APIs for embedding generation.",
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
            Processing Knowledge Module...
          </text>
          <box paddingTop={1} paddingBottom={1}>
            <Spinner>{progress()}</Spinner>
          </box>
        </box>
      </Show>
    </box>
  )
}
