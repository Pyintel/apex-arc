import { createMemo, createSignal, onMount, For, Show } from "solid-js"
import { useTheme, selectedForeground } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import { useRoute } from "../context/route"
import { useProject } from "../context/project"
import { useToast } from "../ui/toast"
import { MessageID } from "@/session/schema"
import { getScrollAcceleration } from "../util/scroll"
import { useTuiConfig } from "../context/tui-config"
import fs from "fs/promises"
import path from "path"

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
  loaded: boolean
  expanded: boolean
  depth: number
  parent?: TreeNode
}

export function DialogTree() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const route = useRoute()
  const project = useProject()
  const toast = useToast()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const [loading, setLoading] = createSignal(true)
  const [rootNodes, setRootNodes] = createSignal<TreeNode[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [refresh, setRefresh] = createSignal(0)

  const currentCwd = createMemo(() => {
    const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
    return (sessionID ? sync.data.session_cwd[sessionID] : undefined) || project.instance.directory() || process.cwd()
  })

  async function readDir(dirPath: string, depth: number, maxDepth: number, parent?: TreeNode): Promise<TreeNode[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      const nodes: TreeNode[] = []
      for (const entry of sorted) {
        const fullPath = path.join(dirPath, entry.name)
        const isDir = entry.isDirectory()
        const node: TreeNode = {
          name: entry.name,
          path: fullPath,
          isDir,
          loaded: false,
          expanded: false,
          depth,
          parent,
        }
        if (isDir && depth < maxDepth) {
          node.children = await readDir(fullPath, depth + 1, maxDepth, node)
          node.loaded = true
          node.expanded = true
        }
        nodes.push(node)
      }
      return nodes
    } catch (e) {
      return []
    }
  }

  function flattenTree(nodes: TreeNode[], result: TreeNode[] = []): TreeNode[] {
    for (const node of nodes) {
      result.push(node)
      if (node.isDir && node.expanded && node.children) {
        flattenTree(node.children, result)
      }
    }
    return result
  }

  const visibleNodes = createMemo(() => {
    refresh()
    return flattenTree(rootNodes())
  })

  onMount(async () => {
    dialog.setSize("large")
    setLoading(true)
    const rootPath = currentCwd()
    const initialTree = await readDir(rootPath, 1, 3)
    setRootNodes(initialTree)
    setLoading(false)
  })

  async function toggleExpand(node: TreeNode) {
    if (!node.isDir) return
    if (node.expanded) {
      node.expanded = false
    } else {
      if (!node.loaded) {
        setLoading(true)
        node.children = await readDir(node.path, node.depth + 1, node.depth + 1, node)
        node.loaded = true
        setLoading(false)
      }
      node.expanded = true
    }
    setRefresh((x) => x + 1)
  }

  async function setCwdTo(dirPath: string) {
    const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
    if (!sessionID) {
      toast.show({ message: "No active session to change CWD", variant: "warning" })
      return
    }

    const agent = local.agent.current()
    const selectedModel = local.model.current()
    const variant = local.model.variant.current()
    const messageID = MessageID.ascending()

    if (!agent || !selectedModel) {
      toast.show({ message: "Agent or model not found", variant: "error" })
      return
    }

    dialog.clear()

    void sdk.client.session.command({
      sessionID,
      command: "cd",
      arguments: dirPath,
      agent: agent.name,
      model: `${selectedModel.providerID}/${selectedModel.modelID}`,
      messageID,
      variant,
      parts: [],
    })
  }

  let scroll: ScrollBoxRenderable | undefined

  function scrollToSelected() {
    if (!scroll) return
    const index = selectedIndex()
    const target = scroll.getChildren().find((child) => child.id === String(index))
    if (!target) return
    const y = target.y - scroll.y
    if (y >= scroll.height) {
      scroll.scrollBy(y - scroll.height + 1)
    }
    if (y < 0) {
      scroll.scrollBy(y)
      if (index === 0) {
        scroll.scrollTo(0)
      }
    }
  }

  useKeyboard((evt) => {
    const list = visibleNodes()
    if (list.length === 0) return

    if (evt.name === "up") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((idx) => {
        const next = idx - 1
        return next < 0 ? list.length - 1 : next
      })
      scrollToSelected()
    }

    if (evt.name === "down") {
      evt.preventDefault()
      evt.stopPropagation()
      setSelectedIndex((idx) => {
        const next = idx + 1
        return next >= list.length ? 0 : next
      })
      scrollToSelected()
    }

    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      const node = list[selectedIndex()]
      if (node && node.isDir) {
        void toggleExpand(node)
      }
    }

    if (evt.name === "left") {
      evt.preventDefault()
      evt.stopPropagation()
      const node = list[selectedIndex()]
      if (!node) return
      if (node.isDir && node.expanded) {
        node.expanded = false
        setRefresh((x) => x + 1)
      } else if (node.parent) {
        const parentIndex = list.findIndex((n) => n === node.parent)
        if (parentIndex >= 0) {
          setSelectedIndex(parentIndex)
          scrollToSelected()
        }
      }
    }

    if (evt.name === "right") {
      evt.preventDefault()
      evt.stopPropagation()
      const node = list[selectedIndex()]
      if (!node) return
      if (node.isDir) {
        if (!node.expanded) {
          void toggleExpand(node)
        } else if (node.children && node.children.length > 0) {
          const firstChildIndex = list.findIndex((n) => n === node.children![0])
          if (firstChildIndex >= 0) {
            setSelectedIndex(firstChildIndex)
            scrollToSelected()
          }
        }
      }
    }

    if (evt.name === "space") {
      evt.preventDefault()
      evt.stopPropagation()
      const node = list[selectedIndex()]
      if (node) {
        const targetCwd = node.isDir ? node.path : path.dirname(node.path)
        void setCwdTo(targetCwd)
      }
    }
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() => Math.min(visibleNodes().length, Math.floor(dimensions().height / 2) - 6))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Explore Worktree (Tree)
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          Press ESC to close
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted} wrapMode="none">Current root: {currentCwd()}</text>
      </box>

      <Show when={loading() && rootNodes().length === 0}>
        <box paddingLeft={2} paddingBottom={1}>
          <text fg={theme.textMuted}>Loading directory tree...</text>
        </box>
      </Show>

      <Show when={rootNodes().length > 0}>
        <scrollbox
          paddingLeft={1}
          paddingRight={1}
          scrollbarOptions={{ visible: false }}
          scrollAcceleration={scrollAcceleration()}
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          maxHeight={height()}
        >
          <For each={visibleNodes()}>
            {(node, idx) => {
              const active = () => idx() === selectedIndex()
              const indentation = () => "  ".repeat(node.depth - 1)
              const displayFg = () => active() ? selectedForeground(theme) : (node.isDir ? theme.accent : theme.text)
              const toggleIndicator = () => node.isDir ? (node.expanded ? "▼ " : "▶ ") : "  "
              const icon = () => node.isDir ? "📁 " : "📄 "

              return (
                <box
                  id={String(idx())}
                  flexDirection="row"
                  backgroundColor={active() ? theme.primary : undefined}
                  onMouseUp={() => {
                    setSelectedIndex(idx())
                    if (node.isDir) {
                      void toggleExpand(node)
                    }
                  }}
                >
                  <text fg={active() ? selectedForeground(theme) : theme.textMuted} wrapMode="none">
                    {indentation()}
                  </text>
                  <text fg={displayFg()} wrapMode="none">
                    {toggleIndicator()}{icon()}{node.name}
                  </text>
                </box>
              )
            }}
          </For>
        </scrollbox>
      </Show>

      <box border={["top"]} borderColor={theme.borderSubtle} paddingTop={1} flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>
          ◀/▶: Collapse/Expand · Enter: Toggle · Space: Set CWD to selection
        </text>
      </box>
    </box>
  )
}
