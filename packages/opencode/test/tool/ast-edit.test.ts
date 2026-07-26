import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { writeFile, readFile, mkdir } from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime, Layer } from "effect"
import { AppFileSystem } from "@pyintel/shared/filesystem"
import { AstEditTool } from "../../src/tool/ast-edit"
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

async function initAstTool() {
  return runtime.runPromise(
    AstEditTool.pipe(Effect.flatMap((info) => info.init())),
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

async function writeFixture(filePath: string, content: string): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf8")
  return filePath
}

async function runEdit(file: string, op: "rename_symbol" | "add_import" | "replace_function_body" | "insert_after_node" | "delete_node", args: Record<string, unknown>): Promise<unknown> {
  const astTool = await initAstTool()
  return await Instance.provide({
    directory: path.dirname(file),
    fn: async () =>
      Effect.runPromise(
        astTool.execute({ file, op, args }, ctx),
      ),
  })
}

describe("tool.ast_edit", () => {
  let tmpPath: string
  let cleanupFn: () => Promise<void>

  beforeEach(async () => {
    const tmp = await tmpdir()
    tmpPath = tmp.path
    cleanupFn = async () => { await tmp[Symbol.asyncDispose]() }
  })

  afterEach(async () => {
    await cleanupFn()
  })

  test("renames a symbol in TypeScript", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `function foo() {\n  return 42\n}\n\nconst x = foo()\n`,
    )

    const result = await runEdit(filePath, "rename_symbol", {
      name: "foo",
      newName: "bar",
    })

    expect(result).toBeDefined()
    expect((result as Tool.ExecuteResult).output).toContain(`Renamed`)

    const after = await readFile(filePath, "utf8")
    expect(after).toContain("function bar")
    expect(after).toContain("const x = bar()")
    expect(after).not.toContain("foo")
  })

  test("adds an import statement in TypeScript", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `const x = 1\n`,
    )

    const result = await runEdit(filePath, "add_import", {
      import: 'import { foo } from "bar"',
    })

    expect((result as Tool.ExecuteResult).output).toContain("Added import")

    const after = await readFile(filePath, "utf8")
    expect(after).toContain('import { foo } from "bar"')
  })

  test("does not duplicate an existing import", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `import { foo } from "bar"\n\nconst x = foo()\n`,
    )

    const result = await runEdit(filePath, "add_import", {
      import: 'import { foo } from "bar"',
    })

    expect((result as Tool.ExecuteResult).output).toContain("already exists")

    const after = await readFile(filePath, "utf8")
    expect(after.match(/import \{ foo \} from "bar"/g)?.length).toBe(1)
  })

  test("replaces a function body in TypeScript", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `function greet(name: string) {\n  console.log("hello")\n  return name\n}\n`,
    )

    const result = await runEdit(filePath, "replace_function_body", {
      name: "greet",
      body: '  console.log("goodbye")\n  return name.toUpperCase()',
    })

    expect((result as Tool.ExecuteResult).output).toContain("Replaced body")

    const after = await readFile(filePath, "utf8")
    expect(after).toContain("goodbye")
    expect(after).not.toContain("hello")
    expect(after).toContain("toUpperCase")
  })

  test("deletes a function node in TypeScript", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `function dead() {\n  return 1\n}\n\nfunction alive() {\n  return 2\n}\n`,
    )

    const result = await runEdit(filePath, "delete_node", {
      nodeType: "function_declaration",
      name: "dead",
    })

    expect((result as Tool.ExecuteResult).output).toContain("Deleted")

    const after = await readFile(filePath, "utf8")
    expect(after).not.toContain("dead")
    expect(after).toContain("alive")
  })

  test("refuses to rename a symbol with too many bindings", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `const a = 1\nconst b = 1\nconst c = 1\nconst d = 1\nconst e = 1\nconst f = 1\nconst g = 1\nconst h = 1\n`,
    )

    const promise = runEdit(filePath, "rename_symbol", {
      name: "const",
      newName: "let",
    })

    await expect(promise).rejects.toThrow()
  })

  test("reports error for unknown symbol", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `const x = 1\n`,
    )

    const promise = runEdit(filePath, "rename_symbol", {
      name: "nonexistent",
      newName: "whatever",
    })

    await expect(promise).rejects.toThrow("not found")
  })

  test("rejects unsupported file type", async () => {
    const promise = runEdit(path.join(tmpPath, "test.go"), "rename_symbol", {
      name: "foo",
      newName: "bar",
    })

    await expect(promise).rejects.toThrow("Unsupported file type")
  })

  test("renames a function in Python", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.py"),
      `def foo():\n    return 42\n\nprint(foo())\n`,
    )

    const result = await runEdit(filePath, "rename_symbol", {
      name: "foo",
      newName: "bar",
    })

    expect((result as Tool.ExecuteResult).output).toContain("Renamed")

    const after = await readFile(filePath, "utf8")
    expect(after).toContain("def bar")
    expect(after).toContain("print(bar())")
    expect(after).not.toContain("foo")
  })

  test("inserts text after a named node", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `function first() {\n  return 1\n}\n`,
    )

    const result = await runEdit(filePath, "insert_after_node", {
      nodeType: "function_declaration",
      name: "first",
      text: "function second() {\n  return 2\n}",
    })

    expect((result as Tool.ExecuteResult).output).toContain("Inserted")

    const after = await readFile(filePath, "utf8")
    expect(after).toContain("function second")
  })

  test("is idempotent for rename when called twice with same args", async () => {
    const filePath = await writeFixture(
      path.join(tmpPath, "test.ts"),
      `function foo() {\n  return 42\n}\n`,
    )

    await runEdit(filePath, "rename_symbol", {
      name: "foo",
      newName: "bar",
    })

    const afterFirst = await readFile(filePath, "utf8")
    expect(afterFirst).toContain("function bar")

    await expect(
      runEdit(filePath, "rename_symbol", {
        name: "foo",
        newName: "bar",
      }),
    ).rejects.toThrow("not found")
  })
})
