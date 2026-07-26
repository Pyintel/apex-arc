import { describe, expect, test } from "bun:test"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime, Layer } from "effect"
import { AppFileSystem } from "@pyintel/shared/filesystem"
import { ShellRunTool } from "../../src/tool/shell-run"
import { Truncate } from "../../src/tool"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import * as Tool from "../../src/tool/tool"
import { SessionID, MessageID } from "../../src/session/schema"
import { tmpdir } from "../fixture/fixture"

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    AppFileSystem.defaultLayer,
    Truncate.defaultLayer,
    Agent.defaultLayer,
  ),
)

async function initShellRunTool() {
  return runtime.runPromise(
    ShellRunTool.pipe(Effect.flatMap((info) => info.init())),
  )
}

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

async function runShell(command: string, opts: {
  interactive?: boolean
  responses?: Record<string, string>
  timeoutMs?: number
  force?: boolean
  workdir?: string
}): Promise<Tool.ExecuteResult> {
  const tool = await initShellRunTool()
  return await Instance.provide({
    directory: opts.workdir ?? process.cwd(),
    fn: async () =>
      Effect.runPromise(
        tool.execute({
          command,
          interactive: opts.interactive ?? true,
          responses: opts.responses,
          timeoutMs: opts.timeoutMs ?? 10_000,
          force: opts.force,
          workdir: opts.workdir,
        }, ctx),
      ),
  })
}

describe("tool.shell_run", () => {
  test("runs a simple echo command", async () => {
    const result = await runShell("echo hello_world", { interactive: false, timeoutMs: 5_000 })

    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("hello_world")
  })

  test("drives interactive prompts with a responses map", async () => {
    await using tmp = await tmpdir()

    const scriptPath = path.join(tmp.path, "prompt.cjs")
    await writeFile(
      scriptPath,
      `const readline = require('readline')\n` +
        `const rl = readline.createInterface({ input: process.stdin, output: process.stdout })\n` +
        `rl.question('Do you want to continue? (y/n) ', (answer) => {\n` +
        `  if (answer.trim() === 'y') {\n` +
        `    rl.question('Enter your name: ', (name) => {\n` +
        `      console.log('Hello ' + name.trim())\n` +
        `      process.exit(0)\n` +
        `    })\n` +
        `  } else {\n` +
        `    console.log('cancelled')\n` +
        `    process.exit(1)\n` +
        `  }\n` +
        `})\n`,
      "utf8",
    )

    const result = await runShell(`node "${scriptPath}"`, {
      interactive: true,
      responses: {
        "Do you want to continue\\? \\(y/n\\)": "y\n",
        "Enter your name:": "TestUser\n",
      },
      workdir: tmp.path,
      timeoutMs: 10_000,
    })

    if (result.metadata.exitCode !== 0) {
      console.log("TEST FAILURE DETAILS - drives interactive prompts:", JSON.stringify(result, null, 2))
    }
    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("Hello TestUser")
    expect(result.metadata.matchedPrompts).toHaveLength(2)
  })

  test("denies dangerous commands without force", async () => {
    const result = await runShell("rm -rf /", { interactive: false, force: false })

    expect(result.metadata.denied).toBe(true)
    expect(result.output).toContain("denied")
  })

  test("allows dangerous commands with force flag", async () => {
    await using tmp = await tmpdir()

    const result = await runShell('echo "forced test"', {
      interactive: false,
      force: true,
      workdir: tmp.path,
    })

    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("forced test")
  })

  test("times out on hanging command", async () => {
    const cmd = process.platform === "win32" ? "ping 192.0.2.1 -n 1 -w 10000" : "sleep 10"
    const result = await runShell(cmd, {
      interactive: false,
      timeoutMs: 300,
    })

    expect(result.metadata.timedOut).toBe(true)
  })

  test("captures stderr separately", async () => {
    const result = await runShell('node -e "process.stderr.write(\\"error output\\")"', {
      interactive: false,
      timeoutMs: 5_000,
    })

    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("error output")
  })

  test("default prompt response sends y for y/n prompts", async () => {
    await using tmp = await tmpdir()

    const scriptPath = path.join(tmp.path, "yn.cjs")
    await writeFile(
      scriptPath,
      `const readline = require('readline')\n` +
        `const rl = readline.createInterface({ input: process.stdin, output: process.stdout })\n` +
        `rl.question('Continue? (y/n) ', (answer) => {\n` +
        `  console.log('received: ' + answer.trim())\n` +
        `  process.exit(answer.trim() === 'y' ? 0 : 1)\n` +
        `})\n`,
      "utf8",
    )

    const result = await runShell(`node "${scriptPath}"`, {
      interactive: true,
      workdir: tmp.path,
      timeoutMs: 10_000,
    })

    if (result.metadata.exitCode !== 0) {
      console.log("TEST FAILURE DETAILS - default prompt response:", JSON.stringify(result, null, 2))
    }
    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("received: y")
    expect(result.metadata.matchedPrompts.length).toBeGreaterThanOrEqual(1)
  })
})
