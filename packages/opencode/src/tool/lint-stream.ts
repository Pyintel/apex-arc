import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { existsSync } from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { Log } from "@/util"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import watcher from "@parcel/watcher"

const log = Log.create({ service: "lint-stream-tool" })

const DiagnosticSchema = z.object({
  tool: z.string(),
  file: z.string(),
  line: z.number(),
  col: z.number(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  fix: z
    .object({
      range: z.array(z.number()).length(2).describe("Character range [start, end]"),
      replacement: z.string(),
    })
    .optional(),
})

export type Diagnostic = z.infer<typeof DiagnosticSchema>

export const LintDiagnosticEvent = BusEvent.define(
  "lint.diagnostic",
  z.object({
    diagnostic: DiagnosticSchema,
  }),
)

const Parameters = z.object({
  worktreePath: z.string().describe("Path to the worktree to watch"),
  tools: z.array(z.string()).default(["tsc", "eslint", "biome"]).describe("Linters to run"),
})

function runLinter(toolName: string, worktree: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  switch (toolName) {
    case "tsc":
      try {
        const res = spawnSync("tsgo", ["--noEmit"], { cwd: worktree, encoding: "utf8", shell: true })
        const output = res.stdout || ""
        // Parse: "src/file.ts(10,15): error TS2304: Cannot find name 'foo'."
        const lines = output.split("\n")
        for (const line of lines) {
          const match = /^(.*?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)$/.exec(line.trim())
          if (match) {
            diagnostics.push({
              tool: "tsc",
              file: path.relative(worktree, path.resolve(worktree, match[1])),
              line: Number(match[2]),
              col: Number(match[3]),
              severity: "error",
              message: `[${match[4]}] ${match[5]}`,
            })
          }
        }
      } catch {}
      break

    case "eslint":
      try {
        const res = spawnSync("npx", ["eslint", ".", "--format=json"], { cwd: worktree, encoding: "utf8", shell: true })
        if (res.stdout) {
          const parsed = JSON.parse(res.stdout)
          for (const fileResult of parsed) {
            const relFile = path.relative(worktree, fileResult.filePath)
            for (const msg of fileResult.messages) {
              diagnostics.push({
                tool: "eslint",
                file: relFile,
                line: msg.line || 1,
                col: msg.column || 1,
                severity: msg.severity === 2 ? "error" : "warning",
                message: msg.message,
              })
            }
          }
        }
      } catch {}
      break

    case "biome":
      try {
        const res = spawnSync("npx", ["biome", "lint", ".", "--reporter=json"], { cwd: worktree, encoding: "utf8", shell: true })
        if (res.stdout) {
          const parsed = JSON.parse(res.stdout)
          if (parsed.diagnostics) {
            for (const diag of parsed.diagnostics) {
              const file = diag.location?.path || ""
              const primary = diag.location?.span
              diagnostics.push({
                tool: "biome",
                file: path.relative(worktree, path.resolve(worktree, file)),
                line: diag.location?.line || 1,
                col: diag.location?.column || 1,
                severity: diag.severity === "error" ? "error" : "warning",
                message: diag.message,
              })
            }
          }
        }
      } catch {}
      break
  }

  return diagnostics
}

interface AsyncLintIterator extends AsyncIterator<Diagnostic> {
  close(): Promise<void>
}

class LintStreamInstance implements AsyncLintIterator {
  private queue: Diagnostic[] = []
  private resolveNext: ((value: IteratorResult<Diagnostic>) => void) | null = null
  private subscription: watcher.AsyncSubscription | null = null
  private debouncer: Timer | null = null

  constructor(
    private worktree: string,
    private tools: string[],
  ) {
    this.startWatcher()
  }

  private async startWatcher() {
    // Run once initially
    this.triggerLint()

    this.subscription = await watcher.subscribe(this.worktree, (err, events) => {
      if (err) return
      if (this.debouncer) clearTimeout(this.debouncer)
      this.debouncer = setTimeout(() => this.triggerLint(), 300)
    }, {
      ignore: ["node_modules", ".git", "dist", ".artifacts"],
    })
  }

  private triggerLint() {
    log.info("Running debounced linter stream")
    for (const tool of this.tools) {
      const diags = runLinter(tool, this.worktree)
      for (const diag of diags) {
        this.push(diag)
        // Publish to TUI bus
        void Bus.publish(LintDiagnosticEvent, { diagnostic: diag })
      }
    }
  }

  private push(diag: Diagnostic) {
    if (this.resolveNext) {
      const resolve = this.resolveNext
      this.resolveNext = null
      resolve({ value: diag, done: false })
    } else {
      this.queue.push(diag)
    }
  }

  async next(): Promise<IteratorResult<Diagnostic>> {
    if (this.queue.length > 0) {
      return { value: this.queue.shift()!, done: false }
    }
    return new Promise((resolve) => {
      this.resolveNext = resolve
    })
  }

  async close() {
    if (this.subscription) {
      await this.subscription.unsubscribe()
    }
    if (this.debouncer) {
      clearTimeout(this.debouncer)
    }
    if (this.resolveNext) {
      this.resolveNext({ value: undefined as any, done: true })
    }
  }
}

interface LintStreamExecuteResult extends Tool.ExecuteResult {
  [Symbol.asyncIterator](): AsyncIterator<Diagnostic>
  close(): Promise<void>
}

export const LintStreamTool = Tool.define(
  "lint_stream",
  Effect.gen(function* () {
    return {
      description: "A background watcher that runs configured linters and streams diagnostics.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const resolvedPath = path.resolve(params.worktreePath)
          if (!existsSync(resolvedPath)) {
            throw new Error(`Worktree path not found: ${resolvedPath}`)
          }

          const stream = new LintStreamInstance(resolvedPath, params.tools)

          const output = `Subscribed to lint stream on ${resolvedPath} using: ${params.tools.join(", ")}`

          const result: LintStreamExecuteResult = {
            title: `lint_stream: ${params.worktreePath}`,
            metadata: { tools: params.tools, active: true },
            output,
            [Symbol.asyncIterator]() {
              return stream
            },
            async close() {
              await stream.close()
            },
          }

          return result
        }).pipe(Effect.orDie),
    }
  })
)
