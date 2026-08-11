import { createMemo, For, Match, Switch } from "solid-js"
import { Button } from "@pyintel/ui/button"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@pyintel/shared/util/encode"
import { Icon } from "@pyintel/ui/icon"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@pyintel/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { StarryBackground } from "@/components/starry-background"
import { TuiLogo } from "@/components/tui-logo"

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const homedir = createMemo(() => sync.data.path.home)
  const recent = createMemo(() => {
    return sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5)
  })

  const serverDotClass = createMemo(() => {
    const healthy = server.healthy()
    if (healthy === true) return "bg-icon-success-base"
    if (healthy === false) return "bg-icon-critical-base"
    return "bg-border-weak-base"
  })

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  async function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory)
        }
      } else if (result) {
        openProject(result)
      }
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
    } else {
      dialog.show(
        () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
        () => resolve(null),
      )
    }
  }

  return (
    <div class="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-[#090d16] text-white">
      <StarryBackground meteor={() => true} />

      <div class="relative z-10 mx-auto w-full max-w-4xl px-4 flex flex-col items-center">
        {/* TUI ASCII Logo */}
        <div class="mb-4">
          <TuiLogo variant="thin" />
        </div>

        {/* Sub-header Branding Tagline */}
        <div class="text-12-mono text-emerald-400/80 tracking-widest uppercase mb-6 text-center font-mono">
          APEX by Pyintel • Powered by Pyintel Helix
        </div>

        <Button
          size="large"
          variant="ghost"
          class="mb-8 mx-auto text-14-regular text-text-weak bg-surface-raised-stronger-non-alpha/60 backdrop-blur border border-border-weak-base rounded-full px-4"
          onClick={() => dialog.show(() => <DialogSelectServer />)}
        >
          <div
            classList={{
              "size-2 rounded-full": true,
              [serverDotClass()]: true,
            }}
          />
          {server.name}
        </Button>

        <Switch>
          <Match when={sync.data.project.length > 0}>
            <div class="w-full max-w-xl flex flex-col gap-4 bg-surface-raised-stronger-non-alpha/75 backdrop-blur border border-border-weak-base rounded-xl p-6 shadow-2xl">
              <div class="flex gap-2 items-center justify-between">
                <div class="text-14-medium text-text-strong font-mono uppercase tracking-wider">
                  {language.t("home.recentProjects")}
                </div>
                <Button icon="folder-add-left" size="normal" class="pl-2 pr-3" onClick={chooseProject}>
                  {language.t("command.project.open")}
                </Button>
              </div>
              <ul class="flex flex-col gap-2">
                <For each={recent()}>
                  {(project) => (
                    <Button
                      size="large"
                      variant="ghost"
                      class="text-14-mono text-left justify-between px-3 border border-transparent hover:border-border-weak-base hover:bg-surface-raised-base-hover rounded-lg transition-all"
                      onClick={() => openProject(project.worktree)}
                    >
                      <span class="truncate font-mono">{project.worktree.replace(homedir() ?? "", "~")}</span>
                      <div class="text-12-regular text-text-weak shrink-0">
                        {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                      </div>
                    </Button>
                  )}
                </For>
              </ul>
            </div>
          </Match>
          <Match when={!sync.ready}>
            <div class="mx-auto flex flex-col items-center gap-3">
              <div class="text-12-regular text-text-weak">{language.t("common.loading")}</div>
              <Button class="px-3" onClick={chooseProject}>
                {language.t("command.project.open")}
              </Button>
            </div>
          </Match>
          <Match when={true}>
            <div class="mx-auto flex flex-col items-center gap-3 bg-surface-raised-stronger-non-alpha/75 backdrop-blur border border-border-weak-base rounded-xl p-8 shadow-2xl">
              <Icon name="folder-add-left" size="large" />
              <div class="flex flex-col gap-1 items-center justify-center">
                <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
                <div class="text-12-regular text-text-weak">{language.t("home.empty.description")}</div>
              </div>
              <Button class="px-3 mt-1" onClick={chooseProject}>
                {language.t("command.project.open")}
              </Button>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}
