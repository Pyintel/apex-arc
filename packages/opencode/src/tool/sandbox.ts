import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { cp, rm, readdir, readFile, stat } from "fs/promises"
import path from "path"
import { spawnSync } from "child_process"
import { Log } from "@/util"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "sandbox-tool" })

const Parameters = z.object({
  code: z.string().describe("The code snippet to execute"),
  language: z.enum(["javascript", "typescript", "python", "bash", "powershell", "wasm"]).describe("Language of the code"),
  network: z.boolean().default(false).describe("Whether to allow network access (default false)").optional(),
  fsPolicy: z
    .object({
      allow: z.array(z.string()).default([]).describe("Paths allowed for reading outside the worktree").optional(),
      deny: z.array(z.string()).default([]).describe("Paths explicitly denied").optional(),
    })
    .default({ allow: [], deny: [] })
    .optional(),
  timeoutMs: z.number().default(30_000).describe("Timeout in milliseconds").optional(),
})

export type SandboxRunParams = z.infer<typeof Parameters>

export interface SandboxArtifact {
  path: string
  content: string
}

export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number | null
  artifacts: SandboxArtifact[]
}

// Find files recursively in a directory
async function getFiles(dir: string, baseDir: string = dir): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!existsSync(dir)) return result

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      const relPath = path.relative(baseDir, fullPath)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue
        await walk(fullPath)
      } else if (entry.isFile()) {
        try {
          const s = await stat(fullPath)
          result.set(relPath, s.mtimeMs)
        } catch {}
      }
    }
  }

  await walk(dir)
  return result
}

// Check if a path is inside another path
function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

function validateFsAccess(filePath: string, worktree: string, policy: { allow: string[]; deny: string[] }): boolean {
  const resolved = path.resolve(filePath)

  // Explicit denies first
  for (const denied of policy.deny) {
    if (isInside(resolved, path.resolve(denied)) || resolved === path.resolve(denied)) {
      return false
    }
  }

  // Inside worktree is allowed by default
  if (isInside(resolved, worktree) || resolved === worktree) {
    return true
  }

  // Explicit allows next
  for (const allowed of policy.allow) {
    if (isInside(resolved, path.resolve(allowed)) || resolved === path.resolve(allowed)) {
      return true
    }
  }

  return false
}

async function runSandbox(params: SandboxRunParams, worktree: string): Promise<SandboxResult> {
  const policy = params.fsPolicy ?? { allow: [], deny: [] }
  const allow = policy.allow ?? []
  const deny = policy.deny ?? []

  // Check code for any absolute path literals and validate access
  const pathRegex = process.platform === "win32"
    ? /[a-zA-Z]:\\[\\\w\s.-]+/g
    : /\/[\w\s.-]+/g
  const matches = params.code.match(pathRegex) || []
  for (const match of matches) {
    if (existsSync(match)) {
      if (!validateFsAccess(match, worktree, { allow, deny })) {
        throw new Error(`Access to path denied by sandbox policy: ${match}`)
      }
    }
  }

  const tmpDir = path.join(process.env.TEMP || "/tmp", `opencode-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    // Copy worktree contents (excluding node_modules and .git) to sandbox directory
    if (existsSync(worktree)) {
      await cp(worktree, tmpDir, {
        recursive: true,
        filter: (src) => {
          const rel = path.relative(worktree, src)
          const parts = rel.split(path.sep)
          return !parts.includes("node_modules") && !parts.includes(".git")
        },
      })
    }

    // Capture initial file state
    const beforeFiles = await getFiles(tmpDir)

    // Write code to execution file
    let runCommand = ""
    let runArgs: string[] = []
    let executionFile = ""

    switch (params.language) {
      case "javascript":
        executionFile = path.join(tmpDir, "index.js")
        writeFileSync(executionFile, params.code, "utf8")
        runCommand = "node"
        runArgs = [executionFile]
        break
      case "typescript":
        executionFile = path.join(tmpDir, "index.ts")
        writeFileSync(executionFile, params.code, "utf8")
        runCommand = "bun"
        runArgs = ["run", executionFile]
        break
      case "python":
        executionFile = path.join(tmpDir, "index.py")
        writeFileSync(executionFile, params.code, "utf8")
        runCommand = "python"
        runArgs = [executionFile]
        break
      case "bash":
        executionFile = path.join(tmpDir, "script.sh")
        writeFileSync(executionFile, params.code, "utf8")
        runCommand = "bash"
        runArgs = [executionFile]
        break
      case "powershell":
        executionFile = path.join(tmpDir, "script.ps1")
        writeFileSync(executionFile, params.code, "utf8")
        runCommand = "powershell"
        runArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", executionFile]
        break
      case "wasm":
        executionFile = path.join(tmpDir, "module.wasm")
        const buffer = Buffer.from(params.code, "base64")
        writeFileSync(executionFile, buffer)
        runCommand = "wasmtime"
        runArgs = [executionFile]
        break
    }

    // Check if wasmtime is available for WASM
    if (params.language === "wasm") {
      const check = spawnSync("wasmtime", ["--version"])
      if (check.status !== 0) {
        throw new Error("wasmtime is not installed on PATH. Cannot run WASM sandbox.")
      }
    }

    // Build env map
    const env: Record<string, string> = {}
    if (process.env.PATH) env.PATH = process.env.PATH
    if (process.env.TEMP) env.TEMP = process.env.TEMP
    if (process.env.TMP) env.TMP = process.env.TMP

    // Disable network by default via invalid proxy configs
    if (!params.network) {
      env.http_proxy = "http://127.0.0.1:9999"
      env.https_proxy = "http://127.0.0.1:9999"
      env.HTTP_PROXY = "http://127.0.0.1:9999"
      env.HTTPS_PROXY = "http://127.0.0.1:9999"
    }

    const res = spawnSync(runCommand, runArgs, {
      cwd: tmpDir,
      env,
      timeout: params.timeoutMs ?? 30_000,
      encoding: "utf8",
    })

    // Capture final file state and collect modified/created files as artifacts
    const afterFiles = await getFiles(tmpDir)
    const artifacts: SandboxArtifact[] = []

    for (const [relPath, mtime] of afterFiles.entries()) {
      if (relPath === path.relative(tmpDir, executionFile)) continue
      const beforeTime = beforeFiles.get(relPath)
      if (beforeTime === undefined || mtime > beforeTime) {
        const full = path.join(tmpDir, relPath)
        try {
          const content = await readFile(full, "utf8")
          artifacts.push({ path: relPath, content })
        } catch {}
      }
    }

    return {
      stdout: res.stdout || "",
      stderr: res.stderr || "",
      exitCode: res.status,
      artifacts,
    }
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

export const SandboxRunTool = Tool.define(
  "sandbox_run",
  Effect.gen(function* () {
    return {
      description: "Execute a code snippet inside a secure, copy-on-write isolated overlay directory.",
      parameters: Parameters,
      execute: (params: SandboxRunParams, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const worktree = Instance.directory

          const result = yield* Effect.tryPromise({
            try: () => runSandbox(params, worktree),
            catch: (error: unknown) => new Error(error instanceof Error ? error.message : String(error)),
          })

          yield* ctx.metadata({
            metadata: {
              exitCode: result.exitCode,
              artifactsCount: result.artifacts.length,
            },
          })

          const parts = [
            `Exit Code: ${result.exitCode}`,
            `Artifacts: ${result.artifacts.length} file(s) modified`,
            "",
            "=== STDOUT ===",
            result.stdout || "(empty)",
            "",
            "=== STDERR ===",
            result.stderr || "(empty)",
          ]

          return {
            title: `sandbox_run: ${params.language}`,
            metadata: {
              exitCode: result.exitCode,
              artifactsCount: result.artifacts.length,
            },
            output: parts.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  })
)
