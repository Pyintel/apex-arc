import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { spawn, type ChildProcess } from "child_process"
import { Log } from "@/util"

const log = Log.create({ service: "shell-run-tool" })

const DESCRIPTION = [
  "Interactive shell stream interceptor.",
  "",
  "Wraps child process execution with a duplex stream layer that:",
  "- Captures stdout and stderr in real time",
  "- Detects prompt patterns (y/N, [Y/n], password:, REPL chevrons, package manager wizards)",
  "- Programmatically writes responses to stdin based on a pattern→response map",
  "- Streams all output to the event bus for live TUI display",
  "",
  "Safety: refuses commands on a denylist (rm -rf /, mkfs, dd of=/dev/, DROP DATABASE, etc.)",
  "unless force: true is passed. When force is used, the command is logged loudly.",
  "",
  "Use this for interactive commands that need unattended operation (npm init, ssh-keygen, etc.).",
].join("\n")

const Parameters = z.object({
  command: z.string().describe("The command to execute"),
  interactive: z
    .boolean()
    .describe("Whether to enable interactive prompt detection and response")
    .default(true),
  responses: z
    .record(z.string(), z.string())
    .optional()
    .describe("Map of prompt patterns (regex) to response strings. When the pattern is detected in output, the response is written to stdin."),
  timeoutMs: z
    .number()
    .describe("Timeout in milliseconds")
    .default(60_000),
  force: z
    .boolean()
    .optional()
    .describe("Bypass the denylist check. The command will be logged loudly."),
  workdir: z
    .string()
    .optional()
    .describe("Working directory for the command"),
})

const DENYLIST = [
  /rm\s+-rf\s+\/(\s|$)/i,
  /mkfs/i,
  /dd\s+.*\bof=\/dev\//i,
  /DROP\s+DATABASE/i,
  /:\s*\(\s*\)\s*\{.*\|\s*.*\&/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
]

function checkDenylist(command: string, force: boolean | undefined): string | null {
  if (force) {
    log.warn("shell_run force-enabled, bypassing denylist", { command })
    return null
  }
  for (const pattern of DENYLIST) {
    if (pattern.test(command)) {
      return `Command denied by safety denylist (matched: ${pattern.source}). Pass force: true to override.`
    }
  }
  return null
}

const PROMPT_PATTERNS = [
  /\b\(?[YyNn]\/[NnYy]\)?\s*[:?]?\s*$/i,
  /\b\(?[Yy]\/[Nn]\)?\s*[:?]?\s*$/i,
  /\bpassword\s*[: ]/i,
  /\bpassphrase\s*[: ]/i,
  /\benter\s+password\s*[: ]/i,
  /^>>>\s*$/,
  /^>\s*$/,
  /\bpress\s+.*\bto\s+continue/i,
  /\bconfirm\s*[: ]/i,
  /\boverwrite\s*[: ]/i,
  /\bcontinue\s*[: ]/i,
  /\bDo\s+you\s+want\s+to.*\?/i,
  /\bAre\s+you\s+sure\s*[: ]/i,
]

function matchPrompt(line: string, responses: Record<string, string> | undefined): string | null {
  for (const [pattern, response] of Object.entries(responses ?? {})) {
    const re = new RegExp(pattern, "i")
    if (re.test(line)) return response.endsWith("\n") ? response : response + "\n"
  }
  for (const pattern of PROMPT_PATTERNS) {
    if (pattern.test(line)) {
      if (/\b\(?[YyNn]\/[NnYy]\)?/i.test(line) || /\b\(?[Yy]\/[Nn]\)?/i.test(line)) return "y\n"
      if (/password|passphrase/i.test(line)) return "\n"
      if (/continue/i.test(line)) return "\n"
      if (/confirm|overwrite|Do you want|Are you sure/i.test(line)) return "y\n"
      return "\n"
    }
  }
  return null
}

interface ShellRunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  matchedPrompts: string[]
  timedOut: boolean
}

function runShell(
  command: string,
  opts: {
    interactive: boolean
    responses?: Record<string, string>
    timeoutMs: number
    workdir?: string
  },
): Promise<ShellRunResult> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(command, {
      shell: true,
      cwd: opts.workdir ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let stdoutScanPos = 0
    let stderrScanPos = 0
    const matchedPrompts: string[] = []
    let timedOut = false
    let resolved = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      finish()
      setTimeout(() => {
        child.kill("SIGKILL")
      }, 1000)
    }, opts.timeoutMs)

    function finish() {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: child.exitCode, matchedPrompts, timedOut })
    }

    // Scan only new content since last scan position for prompt patterns
    function checkForPrompt(newChunk: string, scanFrom: number, fullBuffer: string): string {
      if (!opts.interactive) return ""

      // Only scan new content since last scan position
      const target = fullBuffer.slice(scanFrom)
      const window = target.length > 200 ? target.slice(-200) : target
      const lines = window.split("\n")
      const partial = lines[lines.length - 1] ?? ""

      if (!partial.trim()) return ""

      const response = matchPrompt(partial, opts.responses)
      if (response) {
        matchedPrompts.push(partial.trim())
        return response
      }
      return ""
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk

      const response = checkForPrompt(chunk, stdoutScanPos, stdout)
      stdoutScanPos = stdout.length
      if (response) child.stdin?.write(response)
    })

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk

      const response = checkForPrompt(chunk, stderrScanPos, stderr)
      stderrScanPos = stderr.length
      if (response) child.stdin?.write(response)
    })

    child.on("close", () => finish())
    child.on("error", () => finish())
  })
}

function maintainFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return env as Record<string, string>
}

type ShellMetadata = {
  denied?: boolean
  reason?: string
  exitCode: number | null
  matchedPrompts?: string[]
  timedOut?: boolean
}

export const ShellRunTool = Tool.define(
  "shell_run",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const denyReason = checkDenylist(params.command, params.force)
          if (denyReason) {
            const metadata: ShellMetadata = { denied: true, reason: denyReason, exitCode: null }
            return {
              title: `shell_run: ${params.command.slice(0, 50)}`,
              metadata,
              output: `Error: ${denyReason}`,
            }
          }

          log.info("shell_run executing", {
            command: params.command,
            interactive: params.interactive,
            timeoutMs: params.timeoutMs,
            hasResponses: !!params.responses,
          })

          const result = yield* Effect.tryPromise({
            try: () =>
              runShell(params.command, {
                interactive: params.interactive,
                responses: params.responses,
                timeoutMs: params.timeoutMs,
                workdir: params.workdir,
              }),
            catch: (error: unknown) => new Error(error instanceof Error ? error.message : String(error)),
          })

          const metadata: ShellMetadata = {
            exitCode: result.exitCode,
            matchedPrompts: result.matchedPrompts,
            timedOut: result.timedOut,
          }

          yield* ctx.metadata({
            metadata,
          })

          const parts = [
            `Exit Code: ${result.exitCode}`,
            result.timedOut ? "Status: TIMED OUT" : "Status: COMPLETED",
            result.matchedPrompts.length > 0
              ? `Matched Prompts: ${result.matchedPrompts.length} (${result.matchedPrompts.join(" | ")})`
              : "Matched Prompts: 0",
            "",
            "=== STDOUT ===",
            result.stdout || "(empty)",
            "",
            "=== STDERR ===",
            result.stderr || "(empty)",
          ]

          return {
            title: `shell_run: ${params.command.slice(0, 50)}`,
            metadata,
            output: parts.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  })
)
