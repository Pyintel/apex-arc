import { describe, expect, test } from "bun:test"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime, Layer } from "effect"
import { AppFileSystem } from "@pyintel/shared/filesystem"
import { SandboxRunTool } from "../../src/tool/sandbox"
import { TddLoopTool } from "../../src/tool/tdd-loop"
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

async function initSandboxRunTool() {
  return runtime.runPromise(
    SandboxRunTool.pipe(Effect.flatMap((info) => info.init())),
  )
}

async function initTddLoopTool() {
  return runtime.runPromise(
    TddLoopTool.pipe(Effect.flatMap((info) => info.init())),
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

describe("tool.sandbox_run", () => {
  test("runs Javascript snippet and reports output + artifacts", async () => {
    await using tmp = await tmpdir()

    const tool = await initSandboxRunTool()
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute(
            {
              code: `const fs = require('fs');\nfs.writeFileSync('out.txt', 'hello sandbox', 'utf8');\nconsole.log('stdout message');\n`,
              language: "javascript",
              timeoutMs: 5000,
            },
            ctx,
          ),
        ),
    })

    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("stdout message")
    expect(result.metadata.artifactsCount).toBe(1)
  })

  test("runs Python snippet", async () => {
    await using tmp = await tmpdir()

    const tool = await initSandboxRunTool()
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute(
            {
              code: `print("hello from python")\n`,
              language: "python",
              timeoutMs: 5000,
            },
            ctx,
          ),
        ),
    })

    expect(result.metadata.exitCode).toBe(0)
    expect(result.output).toContain("hello from python")
  })
})

describe("tool.tdd_loop", () => {
  test("runs a failing test and parses failures", async () => {
    await using tmp = await tmpdir()

    const failingScript = path.join(tmp.path, "fail.test.ts")
    await writeFile(
      failingScript,
      `import { test, expect } from 'bun:test'\ntest('failing test', () => {\n  expect(1).toBe(2)\n})\n`,
      "utf8",
    )

    const tool = await initTddLoopTool()
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute(
            {
              testCommand: `bun test "${failingScript}"`,
              sourceFiles: [],
              maxIterations: 1,
            },
            ctx,
          ),
        ),
    })

    expect(result.metadata.passed).toBe(false)
    expect(result.metadata.iterationsRun).toBe(1)
    expect(result.metadata.failuresCount).toBeGreaterThan(0)
  })
})
