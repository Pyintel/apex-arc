import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { listDownloadedModels, deleteDownloadedModel } from "@/util/embeddings"
import { createResource, Show } from "solid-js"

export function DialogSettings() {
  const dialog = useDialog()
  const toast = useToast()

  const [models, { refetch }] = createResource(listDownloadedModels)

  const rows = () => {
    const list = models() || []
    if (list.length === 0) {
      return [
        {
          title: "No Specialized Models Installed",
          value: "none",
          description: "Specialized embedding models (e.g. Xenova/all-MiniLM-L6-v2) will be downloaded on first module use.",
        },
      ]
    }

    return list.map((m) => {
      const sizeMb = (m.sizeBytes / (1024 * 1024)).toFixed(1)
      return {
        title: `Model: ${m.name}`,
        value: m.path,
        description: `Size: ${sizeMb} MB | Path: ${m.path}`,
        footer: "Press Enter to Uninstall / Delete Model",
      }
    })
  }

  const handleSelect = async (item: DialogSelectOption<string>) => {
    if (item.value === "none") return

    const confirmDelete = await DialogConfirm.show(
      dialog,
      "Delete Model Cache",
      `Are you sure you want to remove specialized embedding model cache "${item.title}"?`
    )

    if (confirmDelete) {
      try {
        await deleteDownloadedModel(item.value)
        toast.show({
          message: `Successfully deleted model cache: ${item.title}`,
          variant: "success",
        })
      } catch (err) {
        toast.show({
          message: `Failed to delete model: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        })
      } finally {
        refetch()
        dialog.replace(() => <DialogSettings />)
      }
    } else {
      dialog.replace(() => <DialogSettings />)
    }
  }

  return (
    <box>
      <DialogSelect
        title="Settings & Specialized Models"
        hint="Manage installed specialized vector embedding models and CLI options"
        options={rows()}
        onSelect={handleSelect}
      />
    </box>
  )
}
