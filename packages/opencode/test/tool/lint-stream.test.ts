import { describe, expect, test } from "bun:test"
import { writeFile } from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime, Layer } from "effect"
import { AppFileSystem } from "@pyintel/shared/filesystem"
import { LintStreamTool, type Diagnostic } from "../../src/tool/lint-stream"
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

describe("tool.lint_stream", () => {
  test("streams diagnostics when change occurs", async () => {
    await using tmp = await tmpdir()

    const tsconfig = path.join(tmp.path, "tsconfig.json")
    await writeFile(
      tsconfig,
      JSON.stringify({
        compilerOptions: {
          target: "es2022",
          module: "esnext",
          strict: true,
          noEmit: true,
        },
        include: ["index.ts"],
      }),
      "utf8",
    )

    const badFile = path.join(tmp.path, "index.ts")
    await writeFile(
      badFile,
      `const x: number = "not a number"\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(LintStreamTool.pipe(Effect.flatMap((info) => info.init())))

    const result = (await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ worktreePath: tmp.path, tools: ["tsc"] }, ctx),
        ),
    })) as any

    expect(result.metadata.active).toBe(true)

    // Consume the async iterator until we find the diagnostic for our bad file
    const iterator = result[Symbol.asyncIterator]()
    let foundDiag: Diagnostic | null = null

    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 10_000))

    const readLoop = async () => {
      while (true) {
        const item = await iterator.next()
        if (item.done) break
        const diag = item.value as Diagnostic
        if (diag.file.includes("index.ts")) {
          foundDiag = diag
          break
        }
      }
    }

    // Simulate change to trigger linter
    await writeFile(
      badFile,
      `const x: string = 123\n`,
      "utf8",
    )

    await Promise.race([readLoop(), timeout])

    // Clean up
    await result.close()

    expect(foundDiag).toBeDefined()
    expect(foundDiag).not.toBeNull()
    expect(foundDiag!.tool).toBe("tsc")
    expect(foundDiag!.file).toContain("index.ts")
  })
})
