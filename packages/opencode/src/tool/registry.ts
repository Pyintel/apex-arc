import { PlanEnterTool, PlanExitTool } from "./plan"
import { Session } from "../session"
import { QuestionTool } from "./question"
import { BashTool } from "./bash"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { HistoryTool } from "./history"
import { MemoryTool } from "./memory"
import { ReadTool } from "./read"
import { ActorTool } from "./actor"
import { TaskTool } from "./task"
import { CronTool } from "./cron"
import { SessionTool } from "./session"
import { LocalCodeSearchTool } from "./local-codesearch"
import { WorkflowTool } from "./workflow"
import { WebFetchTool } from "./webfetch"
import { WriteTool } from "./write"
import { NotebookEditTool } from "./notebook-edit"
import { InvalidTool } from "./invalid"
import { SkillTool } from "./skill"
import { ClipboardCopyTool, ClipboardPasteTool } from "./clipboard"
import {
  PdfMergeTool,
  PdfSplitTool,
  PdfRotateTool,
  PdfSearchTool,
  MarkdownToPdfTool,
  ReadPptxTool,
  ReadDocxTool,
  VideoTrimTool,
  VideoMergeTool,
  VideoSpeedTool,
  VideoVolumeTool,
  AudioTrimTool,
  AudioMergeTool,
  AudioSpeedTool,
  AudioVolumeTool,
  AudioReverseTool,
  ConvertImageTool,
  ConvertAudioTool,
  ConvertVideoTool,
  GithubListReposTool,
  GithubRenameRepoTool,
  BundleCodebaseTool,
} from "./agent-tools-wrapper"

import * as Tool from "./tool"
import { Config } from "../config"
import { type ToolContext as PluginToolContext, type ToolDefinition } from "@mimo-ai/plugin"
import z from "zod"
import { Plugin } from "../plugin"
import { Provider } from "../provider"
import { Worktree } from "../worktree"
import { ProviderID, type ModelID } from "../provider/schema"
import { WebSearchTool } from "./websearch"
import { CodeSearchTool } from "./codesearch"
import { Flag } from "@/flag/flag"
import { Log } from "@/util"
import { LspTool } from "./lsp"

import { WebFetchMarkdownTool } from "./web-fetch-markdown"
import { ProcessImageTool } from "./process-image"
import { AstEditTool } from "./ast-edit"
import { ShellRunTool } from "./shell-run"
import { SandboxRunTool } from "./sandbox"
import { TddLoopTool } from "./tdd-loop"
import { Ros2Tool } from "./ros2"
import { UrdfParseTool } from "./urdf-parse"
import { SdfParseTool } from "./sdf-parse"
import { UrdfToMeshTool } from "./urdf-to-mesh"
import { MoveitPlanTool } from "./moveit-plan"
import { WokwiSimulateTool, MujocoStepTool, PybulletStepTool, SimToRealCheckTool } from "./simulators"
import { LintStreamTool } from "./lint-stream"
import { ModuleQueryKnowledgeTool } from "./module-query"

import * as Truncate from "./truncate"
import { ApplyPatchTool } from "./apply_patch"
import { ChangeDirectoryTool } from "./change-directory"
import { Glob } from "@mimo-ai/shared/util/glob"
import path from "path"
import { existsSync } from "fs"
import { pathToFileURL } from "url"

import { Effect, Layer, Context } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import * as CrossSpawnSpawner from "@/effect/cross-spawn-spawner"
import { Global, Path as GlobalPath } from "@/global"
import { Ripgrep } from "../file/ripgrep"

import { Format } from "../format"
import { InstanceState } from "@/effect"
import { Question } from "../question"
import { Todo } from "../session/todo"
import { LSP } from "../lsp"
import { Instruction } from "../session/instruction"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { Bus } from "../bus"
import { Agent } from "../agent/agent"
import { Skill } from "../skill"
import { Permission } from "@/permission"
import { ActorRegistry } from "@/actor/registry"
import { ActorWaiter } from "@/actor/waiter"
import { Team } from "@/team"
import { Memory } from "@/memory"
import { History } from "@/history"
import { SessionCheckpoint } from "@/session/checkpoint"
import { TaskRegistry } from "@/task/registry"
import { defaultLayer as SchedulerDefaultLayer } from "@/cron/scheduler"
import { Auth } from "@/auth"
import { shellWrap } from "./shell-wrap"
import * as BashInteractive from "./bash-interactive"
import { resolveInvocationStyle } from "./invocation-style"
import { BuiltinWorkflow } from "@/workflow/builtin"

const log = Log.create({ service: "tool.registry" })

export function renderWorkflowCatalog(): string {
  const list = BuiltinWorkflow.list()
  if (list.length === 0) return ""
  const entries = list.map((w) => {
    const phases = w.phases?.length ? "\n  Phases: " + w.phases.map((p) => p.title).join(" → ") : ""
    const when = w.whenToUse ? `\n  When to use: ${w.whenToUse}` : ""
    return `- ${w.name}: ${w.description}${when}${phases}`
  })
  return [
    "",
    "## Built-in workflows",
    'These named workflows are available via operation "run" with `name`. When a request matches one, invoke it instead of writing a script from scratch:',
    "",
    ...entries,
    "",
    'Invoke a built-in: workflow({ operation: "run", name: "deep-research", args: "<the refined request>" })',
  ].join("\n")
}

const fallbackWarned = new Set<string>()
function warnShellFallbackOnce(id: string) {
  if (fallbackWarned.has(id)) return
  fallbackWarned.add(id)
  log.warn(`tool '${id}' configured with invocation_style='shell' but has no shell field; falling back to JSON`)
}

type ActorDef = Tool.InferDef<typeof ActorTool>
type ReadDef = Tool.InferDef<typeof ReadTool>

type State = {
  custom: Tool.Def[]
  builtin: Tool.Def[]
  actor: ActorDef
  read: ReadDef
}

export interface Interface {
  readonly ids: () => Effect.Effect<string[]>
  readonly all: () => Effect.Effect<Tool.Def[]>
  readonly named: () => Effect.Effect<{ actor: ActorDef; read: ReadDef }>
  readonly tools: (model: { providerID: ProviderID; modelID: ModelID; agent: Agent.Info }) => Effect.Effect<Tool.Def[]>
  readonly reload: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ToolRegistry") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const plugin = yield* Plugin.Service
    const agents = yield* Agent.Service
    const skill = yield* Skill.Service
    const truncate = yield* Truncate.Service

    const invalid = yield* InvalidTool
    const actor = yield* ActorTool
    const read = yield* ReadTool
    const question = yield* QuestionTool
    const lsptool = yield* LspTool
    const planexit = yield* PlanExitTool
    const planenter = yield* PlanEnterTool
    const webfetch = yield* WebFetchTool
    const websearch = yield* WebSearchTool
    const bash = yield* BashTool
    const codesearch = yield* CodeSearchTool
    const localcodesearchtool = yield* LocalCodeSearchTool
    const globtool = yield* GlobTool
    const writetool = yield* WriteTool
    const notebookedit = yield* NotebookEditTool
    const edit = yield* EditTool
    const greptool = yield* GrepTool
    const patchtool = yield* ApplyPatchTool
    const changedirtool = yield* ChangeDirectoryTool
    const skilltool = yield* SkillTool
    const historytool = yield* HistoryTool
    const memorytool = yield* MemoryTool
    const tasktool = yield* TaskTool
    const crontool = yield* CronTool
    const sessiontool = yield* SessionTool
    const workflowtool = yield* WorkflowTool
    const clipboardcopytool = yield* ClipboardCopyTool
    const clipboardpastetool = yield* ClipboardPasteTool
    const pdfmergetool = yield* PdfMergeTool
    const pdfsplittool = yield* PdfSplitTool
    const pdfrotatetool = yield* PdfRotateTool
    const pdfsearchtool = yield* PdfSearchTool
    const markdowntopdftool = yield* MarkdownToPdfTool
    const readpptxtool = yield* ReadPptxTool
    const readdoxtool = yield* ReadDocxTool
    const videotrimtool = yield* VideoTrimTool
    const videomergetool = yield* VideoMergeTool
    const videospeedtool = yield* VideoSpeedTool
    const videovolumetool = yield* VideoVolumeTool
    const audiotrimtool = yield* AudioTrimTool
    const audiomergetool = yield* AudioMergeTool
    const audiospeedtool = yield* AudioSpeedTool
    const audiovolumetool = yield* AudioVolumeTool
    const audioreversetool = yield* AudioReverseTool
    const convertimagetool = yield* ConvertImageTool
    const convertaudiotool = yield* ConvertAudioTool
    const convertvideotool = yield* ConvertVideoTool
    const githublistrepostool = yield* GithubListReposTool
    const githubrenamerepotool = yield* GithubRenameRepoTool
    const bundlecodebasetool = yield* BundleCodebaseTool

    const webfetchmarkdowntool = yield* WebFetchMarkdownTool

    const processimagetool = yield* ProcessImageTool
    const astedittool = yield* AstEditTool
    const shellruntool = yield* ShellRunTool
    const sandboxruntool = yield* SandboxRunTool
    const tddlooptool = yield* TddLoopTool
    const ros2tool = yield* Ros2Tool
    const urdfparsetool = yield* UrdfParseTool
    const sdfparsetool = yield* SdfParseTool
    const urdftomeshtool = yield* UrdfToMeshTool
    const moveitplantool = yield* MoveitPlanTool
    const wokwisimulatetool = yield* WokwiSimulateTool
    const mujocosteptool = yield* MujocoStepTool
    const pybulletsteptool = yield* PybulletStepTool
    const simtorealchecktool = yield* SimToRealCheckTool
    const lintstreamtool = yield* LintStreamTool
    const modulequeryknowledgetool = yield* ModuleQueryKnowledgeTool

    const agent = yield* Agent.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("ToolRegistry.state")(function* (ctx) {
        const custom: Tool.Def[] = []

        function parseArgSchema(arg: any): z.ZodTypeAny {
          if (!arg) return z.any()
          if (typeof arg === "object" && ("_zod" in arg || "parse" in arg)) return arg
          if (typeof arg === "object" && arg.type === "string") return z.string().describe(arg.description || "")
          if (typeof arg === "object" && arg.type === "number") return z.number().describe(arg.description || "")
          if (typeof arg === "object" && arg.type === "boolean") return z.boolean().describe(arg.description || "")
          return z.any()
        }

        function fromPlugin(id: string, def: ToolDefinition): Tool.Def {
          if (!def) {
            return {
              id,
              parameters: z.object({}),
              description: `Tool ${id}`,
              execute: () => Effect.succeed({ title: id, output: "Empty tool" }),
            }
          }
          const shape: Record<string, z.ZodTypeAny> = {}
          for (const [k, v] of Object.entries(def.args ?? {})) {
            shape[k] = parseArgSchema(v)
          }
          return {
            id,
            parameters: z.object(shape),
            description: def.description ?? `Tool ${id}`,
            execute: (args, toolCtx) =>


              Effect.gen(function* () {
                const pluginCtx: PluginToolContext = {
                  ...toolCtx,
                  ask: (req) => toolCtx.ask(req),
                  directory: ctx.directory,
                  worktree: ctx.worktree,
                }
                const result = yield* Effect.promise(() => def.execute(args as any, pluginCtx))
                const output = typeof result === "string" ? result : result.output
                const metadata = typeof result === "string" ? {} : (result.metadata ?? {})
                const info = yield* agent.get(toolCtx.agent)
                const out = yield* truncate.output(output, {}, info)
                return {
                  title: "",
                  output: out.truncated ? out.content : output,
                  metadata: {
                    ...metadata,
                    truncated: out.truncated,
                    ...(out.truncated && { outputPath: out.outputPath }),
                  },
                }
              }),
          }
        }

        const dirs = yield* config.directories()
        const matches = dirs.flatMap((dir) =>
          Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true }),
        )
        const modulesDir = path.join(Global.Path.data, "modules")
        const moduleMatches = existsSync(modulesDir)
          ? Glob.scanSync("*/{tool,tools}/*.{js,ts}", { cwd: modulesDir, absolute: true, dot: true, symlink: true })
          : []

        const allMatches = [...matches, ...moduleMatches]
        if (allMatches.length) yield* config.waitForDependencies()
        for (const match of allMatches) {
          const namespace = path.basename(match, path.extname(match))
          const mod = yield* Effect.promise(() => import(`${pathToFileURL(match).href}?v=${Date.now()}`))
          for (const [id, def] of Object.entries<ToolDefinition>(mod)) {
            if (def && typeof def === "object" && typeof (def as any).execute === "function") {
              custom.push(fromPlugin(id === "default" ? namespace : id, def))
            }

          }
        }



        const plugins = yield* plugin.list()
        for (const p of plugins) {
          for (const [id, def] of Object.entries(p.tool ?? {})) {
            custom.push(fromPlugin(id, def))
          }
        }

        yield* config.get()
        const questionEnabled =
          ["app", "cli", "desktop"].includes(Flag.ARC_CLIENT) || Flag.ARC_ENABLE_QUESTION_TOOL

        const tool = yield* Effect.all({
          invalid: Tool.init(invalid),
          bash: Tool.init(bash),
          read: Tool.init(read),
          glob: Tool.init(globtool),
          grep: Tool.init(greptool),
          edit: Tool.init(edit),
          write: Tool.init(writetool),
          notebookedit: Tool.init(notebookedit),
          actor: Tool.init(actor),
          fetch: Tool.init(webfetch),
          search: Tool.init(websearch),
          code: Tool.init(codesearch),
          local_codesearch: Tool.init(localcodesearchtool),
          skill: Tool.init(skilltool),
          patch: Tool.init(patchtool),
          changedir: Tool.init(changedirtool),
          question: Tool.init(question),
          lsp: Tool.init(lsptool),
          planexit: Tool.init(planexit),
          planenter: Tool.init(planenter),
          memory: Tool.init(memorytool),
          history: Tool.init(historytool),
          task: Tool.init(tasktool),
          cron: Tool.init(crontool),
          session: Tool.init(sessiontool),
          workflow: Tool.init(workflowtool),
          clipboardcopy: Tool.init(clipboardcopytool),
          clipboardpaste: Tool.init(clipboardpastetool),
          pdfmerge: Tool.init(pdfmergetool),
          pdfsplit: Tool.init(pdfsplittool),
          pdfrotate: Tool.init(pdfrotatetool),
          pdfsearch: Tool.init(pdfsearchtool),
          markdowntopdf: Tool.init(markdowntopdftool),
          readpptx: Tool.init(readpptxtool),
          readdocx: Tool.init(readdoxtool),
          videotrim: Tool.init(videotrimtool),
          videomerge: Tool.init(videomergetool),
          videospeed: Tool.init(videospeedtool),
          videovolume: Tool.init(videovolumetool),
          audiotrim: Tool.init(audiotrimtool),
          audiomerge: Tool.init(audiomergetool),
          audiospeed: Tool.init(audiospeedtool),
          audiovolume: Tool.init(audiovolumetool),
          audioreverse: Tool.init(audioreversetool),
          convertimage: Tool.init(convertimagetool),
          convertaudio: Tool.init(convertaudiotool),
          convertvideo: Tool.init(convertvideotool),
          githublistrepos: Tool.init(githublistrepostool),
          githubrenamerepo: Tool.init(githubrenamerepotool),
          bundlecodebase: Tool.init(bundlecodebasetool),

          webfetchmarkdown: Tool.init(webfetchmarkdowntool),

          processimage: Tool.init(processimagetool),
          astedit: Tool.init(astedittool),
          shellrun: Tool.init(shellruntool),
          sandboxrun: Tool.init(sandboxruntool),
          tddloop: Tool.init(tddlooptool),
          ros2: Tool.init(ros2tool),
          urdfparse: Tool.init(urdfparsetool),
          sdfparse: Tool.init(sdfparsetool),
          urdftomesh: Tool.init(urdftomeshtool),
          moveitplan: Tool.init(moveitplantool),
          wokwisimulate: Tool.init(wokwisimulatetool),
          mujocostep: Tool.init(mujocosteptool),
          pybulletstep: Tool.init(pybulletsteptool),
          simtorealcheck: Tool.init(simtorealchecktool),
          lintstream: Tool.init(lintstreamtool),
        })

        return {
          custom,
          builtin: [
            tool.invalid,
            ...(questionEnabled ? [tool.question] : []),
            tool.bash,
            tool.read,
            tool.glob,
            tool.grep,
            tool.edit,
            tool.write,
            tool.notebookedit,
            tool.actor,
            tool.fetch,
            tool.search,
            tool.local_codesearch,
            tool.code,
            tool.skill,
            tool.patch,
            tool.changedir,
            ...(Flag.ARC_EXPERIMENTAL_LSP_TOOL ? [tool.lsp] : []),
            tool.planexit,
            tool.planenter,
            tool.memory,
            tool.history,
            tool.task,
            tool.clipboardcopy,
            tool.clipboardpaste,
            tool.pdfmerge,
            tool.pdfsplit,
            tool.pdfrotate,
            tool.pdfsearch,
            tool.markdowntopdf,
            tool.readpptx,
            tool.readdocx,
            tool.videotrim,
            tool.videomerge,
            tool.videospeed,
            tool.videovolume,
            tool.audiotrim,
            tool.audiomerge,
            tool.audiospeed,
            tool.audiovolume,
            tool.audioreverse,
            tool.convertimage,
            tool.convertaudio,
            tool.convertvideo,
            tool.githublistrepos,
            tool.githubrenamerepo,
            tool.bundlecodebase,
            tool.calendarcreate,
            tool.calendarlist,
            tool.docscreate,
            tool.docsget,
            tool.drivelist,
            tool.driveupload,
            tool.gmaildraft,
            tool.gmailsend,
            tool.sheetsappend,
            tool.webfetchmarkdown,

            tool.processimage,
            tool.astedit,
            tool.shellrun,
            tool.sandboxrun,
            tool.tddloop,
            tool.ros2,
            tool.urdfparse,
            tool.sdfparse,
            tool.urdftomesh,
            tool.moveitplan,
            tool.wokwisimulate,
            tool.mujocostep,
            tool.pybulletstep,
            tool.simtorealcheck,
            tool.lintstream,
            ...(Flag.ARC_EXPERIMENTAL_CRON ? [tool.cron] : []),
            ...(Flag.ARC_EXPERIMENTAL_ORCHESTRATOR ? [tool.session] : []),
            ...(Flag.ARC_EXPERIMENTAL_WORKFLOW_TOOL ? [tool.workflow] : []),
          ],
          actor: tool.actor,
          read: tool.read,
        }
      }),
    )

    const all: Interface["all"] = Effect.fn("ToolRegistry.all")(function* () {
      const s = yield* InstanceState.get(state)
      const validCustom = (s.custom ?? []).filter((t): t is Tool.Def => Boolean(t && typeof t.id === "string"))
      const validBuiltin = (s.builtin ?? []).filter((t): t is Tool.Def => Boolean(t && typeof t.id === "string"))
      const customIds = new Set(validCustom.map((t) => t.id))
      const builtins = validBuiltin.filter((t) => !customIds.has(t.id))
      return [...builtins, ...validCustom]
    })


    const ids: Interface["ids"] = Effect.fn("ToolRegistry.ids")(function* () {
      return (yield* all()).map((tool) => tool.id)
    })

    const describeSkill = Effect.fn("ToolRegistry.describeSkill")(function* (agent: Agent.Info) {
      const list = yield* skill.available(agent)
      if (list.length === 0) return "No skills are currently available."
      return [
        "Load a specialized skill that provides domain-specific instructions and workflows.",
        "",
        "When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.",
        "",
        "The skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.",
        "",
        'Tool output includes a `<skill_content name="...">` block with the loaded content.',
        "",
        "The following skills provide specialized sets of instructions for particular tasks",
        "Invoke this tool to load a skill when a task matches one of the available skills listed below:",
        "",
        Skill.fmt(list, { verbose: false }),
      ].join("\n")
    })

    const describeWorkflow = Effect.fn("ToolRegistry.describeWorkflow")(function* () {
      return renderWorkflowCatalog()
    })

    const describeTask = Effect.fn("ToolRegistry.describeTask")(function* (agent: Agent.Info) {
      const items = (yield* agents.list()).filter(
        (item) => item.mode !== "primary" && !item.hidden,
      )
      const filtered = items.filter(
        (item) => Permission.evaluate("task", item.name, agent.permission).action !== "deny",
      )
      const list = filtered.toSorted((a, b) => a.name.localeCompare(b.name))
      const description = list
        .map(
          (item) =>
            `- ${item.name}: ${item.description ?? "This subagent should only be called manually by the user."}`,
        )
        .join("\n")
      return ["Available agent types and the tools they have access to:", description].join("\n")
    })

    const tools: Interface["tools"] = Effect.fn("ToolRegistry.tools")(function* (input) {
      let filtered = (yield* all()).filter((tool) => {
        if (tool.id === CodeSearchTool.id || tool.id === WebSearchTool.id) {
          if (tool.id === WebSearchTool.id) {
            return (
              input.providerID === ProviderID.opencode ||
              input.providerID === "xiaomi" ||
              Flag.ARC_ENABLE_EXA
            )
          }
          return input.providerID === ProviderID.opencode || Flag.ARC_ENABLE_EXA
        }

        const usePatch =
          input.modelID.includes("gpt-") && !input.modelID.includes("oss") && !input.modelID.includes("gpt-4")
        if (tool.id === ApplyPatchTool.id) return usePatch
        if (tool.id === EditTool.id || tool.id === WriteTool.id) return !usePatch

        return true
      })

      if (input.agent.toolAllowlist) {
        const allowed = new Set(input.agent.toolAllowlist)
        filtered = filtered.filter((tool) => tool.id === "invalid" || allowed.has(tool.id))
      }

      // The `session` tool is orchestrator-only. Orchestrator is a
      // full-capability agent (no toolAllowlist), so gate on the agent name
      // rather than an allowlist: every other agent — primaries without an
      // allowlist (build/plan/compose) and subagents — must not see `session`.
      filtered = filtered.filter((tool) => tool && typeof tool.id === "string")
      filtered = filtered.filter((tool) => tool.id !== "session" || input.agent.name === "orchestrator")


      const cfg = yield* config.get()
      const resolveStyle = (toolId: string): "json" | "shell" => resolveInvocationStyle(cfg.tool, toolId)

      return yield* Effect.forEach(
        filtered,
        Effect.fnUntraced(function* (tool: Tool.Def) {
          using _ = log.time(tool.id)
          const output = {
            description: tool.description,
            parameters: tool.parameters,
          }
          yield* plugin.trigger("tool.definition", { toolID: tool.id }, output)
          const style = resolveStyle(tool.id)
          const useShell = style === "shell" && tool.shell !== undefined
          if (style === "shell" && !tool.shell) {
            warnShellFallbackOnce(tool.id)
          }
          const effective: Tool.Def = useShell ? shellWrap(tool) : tool
          const description = useShell ? tool.shell!.description : output.description
          return {
            id: tool.id,
            description: [
              description,
              tool.id === ActorTool.id ? yield* describeTask(input.agent) : undefined,
              tool.id === SkillTool.id ? yield* describeSkill(input.agent) : undefined,
              tool.id === WorkflowTool.id ? yield* describeWorkflow() : undefined,
            ]
              .filter(Boolean)
              .join("\n"),
            parameters: useShell ? effective.parameters : output.parameters,
            execute: effective.execute,
            formatValidationError: effective.formatValidationError,
          }
        }),
        { concurrency: "unbounded" },
      )
    })

    const named: Interface["named"] = Effect.fn("ToolRegistry.named")(function* () {
      const s = yield* InstanceState.get(state)
      return { actor: s.actor, read: s.read }
    })

    const reload: Interface["reload"] = Effect.fn("ToolRegistry.reload")(function* () {
      yield* skill.reload()
      yield* plugin.reloadFileHooks()
      yield* InstanceState.invalidate(state)
    })

    return Service.of({ ids, all, named, tools, reload })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Question.defaultLayer),
    Layer.provide(Todo.defaultLayer),
    Layer.provide(Skill.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(LSP.defaultLayer),
    Layer.provide(Instruction.defaultLayer),
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(Bus.layer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Format.defaultLayer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
    Layer.provide(Ripgrep.defaultLayer),
    Layer.provide(Truncate.defaultLayer),
    Layer.provide(Layer.mergeAll(ActorRegistry.defaultLayer, ActorWaiter.defaultLayer, Worktree.defaultLayer)),
    Layer.provide(Team.defaultLayer),
    Layer.provide(
      Layer.mergeAll(
        Memory.defaultLayer,
        History.defaultLayer,
        SessionCheckpoint.defaultLayer,
        TaskRegistry.defaultLayer,
        SchedulerDefaultLayer,
        Auth.defaultLayer,
      ),
    ),
  ),
)
