import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { Spinner } from "./spinner"
import {
  getAllAvailableModules,
  installModule,
  uninstallModule,
  type ModuleInfo,
} from "@/service/module-manager"
import { createSignal, createResource, createMemo, Show, For, batch, onMount } from "solid-js"
import { TextAttributes, InputRenderable, ScrollBoxRenderable, RGBA } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"

export function DialogModules() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const toast = useToast()

  const [status, setStatus] = createSignal<"list" | "select-provider" | "installing">("list")
  const [progress, setProgress] = createSignal("")
  const [pendingModule, setPendingModule] = createSignal<{ id: string; title: string; source?: string } | null>(null)
  const [selected, setSelected] = createSignal(0)
  const [filter, setFilter] = createSignal("")

  const [modules, { refetch }] = createResource(getAllAvailableModules)

  const filtered = createMemo(() => {
    const list = modules() || []
    const q = filter().toLowerCase().trim()
    if (!q) return list
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
    )
  })

  const dimensions = useTerminalDimensions()
  const cardHeight = 5 // lines per card (border top + name + meta + desc + border bottom)
  const maxVisible = createMemo(() => Math.max(1, Math.floor((dimensions().height * 0.72) / cardHeight)))

  let scroll: ScrollBoxRenderable | undefined
  let inputRef: InputRenderable | undefined

  function move(dir: number) {
    const list = filtered()
    if (!list.length) return
    const next = Math.max(0, Math.min(list.length - 1, selected() + dir))
    setSelected(next)
    // scroll to keep selected visible
    if (scroll) {
      const targetY = next * cardHeight
      const scrollTop = scroll.scrollTop ?? 0
      const visibleH = scroll.height
      if (targetY < scrollTop) scroll.scrollTo(targetY)
      else if (targetY + cardHeight > scrollTop + visibleH) scroll.scrollTo(targetY + cardHeight - visibleH)
    }
  }

  useKeyboard((evt) => {
    if (status() !== "list") return
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) { evt.preventDefault(); move(-1) }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) { evt.preventDefault(); move(1) }
    if (evt.name === "pageup") { evt.preventDefault(); move(-maxVisible()) }
    if (evt.name === "pagedown") { evt.preventDefault(); move(maxVisible()) }
    if (evt.name === "return") {
      evt.preventDefault()
      const m = filtered()[selected()]
      if (m) handleSelectModule(m)
    }
  })

  const handleSelectModule = async (m: ModuleInfo) => {
    const installed = m.installed === true

    if (installed) {
      const confirmUninstall = await DialogConfirm.show(
        dialog,
        "Uninstall Module",
        `Do you want to uninstall "${m.name}" and remove its embedded knowledge base?`,
      )
      if (confirmUninstall) {
        batch(() => { setStatus("installing"); setProgress("Uninstalling module...") })
        try {
          await uninstallModule(m.id)
          toast.show({ message: `Successfully uninstalled module: ${m.name}`, variant: "success" })
        } catch (err) {
          toast.show({ message: `Failed to uninstall module: ${err instanceof Error ? err.message : String(err)}`, variant: "error" })
        } finally {
          refetch()
          setStatus("list")
          dialog.setSize("xlarge")
          dialog.replace(() => <DialogModules />)
        }
      } else {
        dialog.setSize("xlarge")
        dialog.replace(() => <DialogModules />)
      }
      return
    }

    batch(() => {
      setPendingModule({ id: m.id, title: m.name, source: m.source })
      setStatus("select-provider")
    })
  }

  const startInstallation = (engine: "local" | "cloud") => {
    const moduleInfo = pendingModule()
    if (!moduleInfo) return
    batch(() => { setStatus("installing"); setProgress(`Initializing ${moduleInfo.title}...`) })
    installModule(moduleInfo.id, (msg) => setProgress(msg), moduleInfo.source)
      .then(() => {
        toast.show({ message: `Successfully installed module: ${moduleInfo.title}`, variant: "success" })
        refetch()
        batch(() => { setStatus("list"); setPendingModule(null) })
      })
      .catch((err) => {
        toast.show({ message: `Failed to install module: ${err instanceof Error ? err.message : String(err)}`, variant: "error" })
        batch(() => { setStatus("list"); setPendingModule(null) })
      })
  }

  const providerOptions: DialogSelectOption<"local" | "cloud">[] = [
    { title: "Local Embedding Model (Recommended)", value: "local", description: "Vectorizes knowledge base locally using lightweight embeddings." },
    { title: "Cloud Provider APIs", value: "cloud", description: "Uses cloud provider APIs for embedding generation." },
  ]

  return (
    <box>
      <Show when={status() === "list"}>
        {/* ── Header ── */}
        <box gap={1} paddingBottom={1}>
          <box paddingLeft={4} paddingRight={4}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme.text} attributes={TextAttributes.BOLD}>Modules</text>
              <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>esc</text>
            </box>
            <box paddingTop={1}>
              <text fg={theme.textMuted}>Select a module to install or manage</text>
            </box>
            {/* Search input */}
            <box paddingTop={1}>
              <input
                onInput={(e) => { setFilter(e); setSelected(0) }}
                focusedBackgroundColor={theme.backgroundPanel}
                cursorColor={theme.primary}
                focusedTextColor={theme.textMuted}
                ref={(r) => {
                  inputRef = r
                  inputRef.traits = { status: "FILTER" }
                  setTimeout(() => { if (inputRef && !inputRef.isDestroyed) inputRef.focus() }, 1)
                }}
                placeholder="Search modules..."
                placeholderColor={theme.textMuted}
              />
            </box>
          </box>

          {/* ── Card List ── */}
          <Show
            when={filtered().length > 0}
            fallback={
              <box paddingLeft={4} paddingTop={1}>
                <text fg={theme.textMuted}>No modules found</text>
              </box>
            }
          >
            <scrollbox
              paddingLeft={2}
              paddingRight={2}
              scrollbarOptions={{ visible: false }}
              ref={(r: ScrollBoxRenderable) => (scroll = r)}
              maxHeight={maxVisible() * cardHeight}
            >
              <For each={filtered()}>
                {(m, i) => {
                  const isActive = () => i() === selected()
                  const isInstalled = () => m.installed === true
                  const cardBg = () => isActive() ? theme.primary : RGBA.fromInts(0, 0, 0, 0)
                  const fg = () => isActive() ? theme.background : theme.text
                  const mutedFg = () => isActive() ? theme.background : theme.textMuted
                  const accentFg = () => isActive() ? theme.background : theme.accent

                  return (
                    <box
                      flexDirection="column"
                      backgroundColor={cardBg()}
                      paddingLeft={2}
                      paddingRight={2}
                      paddingTop={1}
                      paddingBottom={1}
                      marginBottom={1}
                      onMouseDown={() => setSelected(i())}
                      onMouseUp={() => { setSelected(i()); handleSelectModule(m) }}
                    >
                      {/* Row 1: Name + status badge */}
                      <box flexDirection="row" justifyContent="space-between">
                        <text fg={fg()} attributes={TextAttributes.BOLD}>
                          {m.name}
                        </text>
                        <Show
                          when={isInstalled()}
                          fallback={
                            <text fg={mutedFg()}>◦ Not installed</text>
                          }
                        >
                          <text fg={accentFg()} attributes={TextAttributes.BOLD}>✓ Installed</text>
                        </Show>
                      </box>

                      {/* Row 2: ID + version */}
                      <box flexDirection="row" gap={2} paddingTop={0}>
                        <text fg={mutedFg()}>{m.id}</text>
                        <Show when={m.version}>
                          <text fg={mutedFg()}>v{m.version}</text>
                        </Show>
                        <Show when={m.type === "npm"}>
                          <text fg={accentFg()}>npm</text>
                        </Show>
                      </box>

                      {/* Row 3: Description */}
                      <box paddingTop={0}>
                        <text fg={mutedFg()} overflow="hidden" wrapMode="none">
                          {m.description && m.description.length > 90
                            ? m.description.slice(0, 88) + "…"
                            : m.description}
                        </text>
                      </box>

                      {/* Row 4: Action hint */}
                      <Show when={isActive()}>
                        <box paddingTop={0}>
                          <text fg={mutedFg()}>
                            {isInstalled() ? "↵  Uninstall" : "↵  Install"}
                          </text>
                        </box>
                      </Show>
                    </box>
                  )
                }}
              </For>
            </scrollbox>
          </Show>

          {/* Footer: count */}
          <box paddingLeft={4} paddingRight={4} paddingTop={1} flexDirection="row" justifyContent="space-between">
            <text fg={theme.textMuted}>
              {filtered().length} module{filtered().length !== 1 ? "s" : ""}
              {" • "}
              {(modules() || []).filter((m) => m.installed).length} installed
            </text>
            <text fg={theme.textMuted}>↑↓ navigate  ↵ select</text>
          </box>
        </box>
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
          <text attributes={TextAttributes.BOLD} fg={theme.text}>Processing Knowledge Module...</text>
          <box paddingTop={1} paddingBottom={1}>
            <Spinner>{progress()}</Spinner>
          </box>
        </box>
      </Show>
    </box>
  )
}
