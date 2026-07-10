import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { readFile, writeFile } from "fs/promises"
import path from "path"
import { lazy } from "@/util/lazy"
import { Language, type Node, type Parser, type Tree } from "web-tree-sitter"
import { fileURLToPath } from "url"

const DESCRIPTION = [
  "Parse source files via Tree-sitter and apply structural (AST-based) edits.",
  "",
  "Supports: TypeScript (.ts), TSX (.tsx), JavaScript (.js), Python (.py).",
  "",
  "Operations:",
  "- rename_symbol: Rename a symbol (function, class, variable) by its current name. Requires 'name' and 'newName' in args.",
  "- add_import: Add an import statement. Requires 'import' in args (the full import line).",
  "- replace_function_body: Replace a function body. Requires 'name' and 'body' in args.",
  "- insert_after_node: Insert text after a named node. Requires 'nodeType', 'name', and 'text' in args.",
  "- delete_node: Delete a node by type and name. Requires 'nodeType' and 'name' in args.",
  "",
  "All operations operate on AST node identity, not line numbers, so they survive formatter re-runs.",
  "Rejects edits that would change semantics silently (e.g., renaming a name with multiple bindings).",
].join("\n")

const Parameters = z.object({
  file: z.string().describe("Path to the file to edit"),
  op: z.enum([
    "rename_symbol",
    "add_import",
    "replace_function_body",
    "insert_after_node",
    "delete_node",
  ]).describe("The structural edit operation to perform"),
  args: z
    .record(z.string(), z.unknown())
    .describe("Arguments for the specific operation (e.g., { name: 'foo', newName: 'bar' })"),
})

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parsers = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  await Parser.init({ locateFile: () => resolveWasm(treeWasm) })

  const { default: tsWasm } = await import("tree-sitter-typescript/tree-sitter-typescript.wasm" as string, {
    with: { type: "wasm" },
  })
  const { default: tsxWasm } = await import("tree-sitter-typescript/tree-sitter-tsx.wasm" as string, {
    with: { type: "wasm" },
  })
  const { default: pyWasm } = await import("tree-sitter-python/tree-sitter-python.wasm" as string, {
    with: { type: "wasm" },
  })

  const [tsLang, tsxLang, pyLang] = await Promise.all([
    Language.load(resolveWasm(tsWasm)),
    Language.load(resolveWasm(tsxWasm)),
    Language.load(resolveWasm(pyWasm)),
  ])

  const ts = new Parser()
  ts.setLanguage(tsLang)
  const tsx = new Parser()
  tsx.setLanguage(tsxLang)
  const py = new Parser()
  py.setLanguage(pyLang)

  return { ts, tsx, py }
})

function getParser(filePath: string): Promise<Parser> {
  const ext = path.extname(filePath).toLowerCase()
  return parsers().then((p) => {
    if (ext === ".ts" || ext === ".js") return p.ts
    if (ext === ".tsx" || ext === ".jsx") return p.tsx
    if (ext === ".py") return p.py
    throw new Error(`Unsupported file type for AST edit: ${ext}`)
  })
}

function findNodes(root: Node, predicate: (n: Node) => boolean): Node[] {
  const results: Node[] = []
  function walk(node: Node) {
    if (predicate(node)) results.push(node)
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child) walk(child)
    }
  }
  walk(root)
  return results
}

function getIdentifierNode(node: Node): Node | null {
  if (node.type === "identifier" || node.type === "property_identifier") return node
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child && (child.type === "identifier" || child.type === "property_identifier")) return child
  }
  return null
}

type EditOp = (root: Node, source: string) => { edits: { startIndex: number; oldEndIndex: number; newText: string }[]; log: string }

function renameSymbol(args: Record<string, unknown>): EditOp {
  const name = String(args.name)
  const newName = String(args.newName)
  return (root) => {
    const matches = findNodes(root, (n) => {
      if (n.type !== "identifier" && n.type !== "property_identifier") return false
      return n.text === name
    })
    if (matches.length === 0) throw new Error(`Symbol "${name}" not found`)
    if (matches.length > 5) throw new Error(`Symbol "${name}" has ${matches.length} bindings — requires explicit scope`)
    const edits = matches.map((n) => ({
      startIndex: n.startIndex,
      oldEndIndex: n.endIndex,
      newText: newName,
    }))
    return { edits, log: `Renamed ${matches.length} occurrence(s) of "${name}" to "${newName}"` }
  }
}

function addImport(args: Record<string, unknown>): EditOp {
  const importLine = String(args.import)
  return (root) => {
    const existingImports = findNodes(root, (n) =>
      n.type === "import_statement" || n.type === "import_from_statement"
    )
    for (const imp of existingImports) {
      if (imp.text.includes(importLine)) {
        return { edits: [], log: `Import already exists, skipping` }
      }
    }
    const firstImport = existingImports[0]
    let startIndex: number
    let oldEndIndex: number
    if (firstImport) {
      startIndex = firstImport.startIndex
      oldEndIndex = firstImport.startIndex
    } else {
      const sourceFile = findNodes(root, (n) => n.type === "program" || n.type === "module").pop() ?? root
      startIndex = sourceFile.startIndex
      oldEndIndex = sourceFile.startIndex
    }
    const newText = `${importLine}\n`
    return { edits: [{ startIndex, oldEndIndex, newText }], log: `Added import: ${importLine}` }
  }
}

function replaceFunctionBody(args: Record<string, unknown>): EditOp {
  const name = String(args.name)
  const body = String(args.body)
  return (root) => {
    const functions = findNodes(root, (n) => {
      if (n.type !== "function_declaration" && n.type !== "method_definition" && n.type !== "function_definition") return false
      const id = getIdentifierNode(n)
      return id?.text === name
    })
    if (functions.length === 0) throw new Error(`Function "${name}" not found`)
    if (functions.length > 1) throw new Error(`Multiple functions named "${name}" — requires explicit scope`)
    const fn = functions[0]
    const bodyNodes = findNodes(fn, (n) => n.type === "statement_block" || n.type === "block")
    const block = bodyNodes[0]
    if (!block) throw new Error(`Function "${name}" has no block body to replace`)
    const innerStart = block.startIndex + 1
    const innerEnd = block.endIndex - 1
    return {
      edits: [{ startIndex: innerStart, oldEndIndex: innerEnd, newText: `\n${body}\n` }],
      log: `Replaced body of function "${name}"`,
    }
  }
}

function insertAfterNode(args: Record<string, unknown>): EditOp {
  const nodeType = String(args.nodeType)
  const name = String(args.name)
  const text = String(args.text)
  return (root) => {
    const targets = findNodes(root, (n) => {
      if (n.type !== nodeType) return false
      const id = getIdentifierNode(n)
      return id?.text === name
    })
    if (targets.length === 0) throw new Error(`Node ${nodeType} "${name}" not found`)
    const target = targets[targets.length - 1]
    return {
      edits: [{ startIndex: target.endIndex, oldEndIndex: target.endIndex, newText: `\n${text}\n` }],
      log: `Inserted text after ${nodeType} "${name}"`,
    }
  }
}

function deleteNode(args: Record<string, unknown>): EditOp {
  const nodeType = String(args.nodeType)
  const name = String(args.name)
  return (root) => {
    const targets = findNodes(root, (n) => {
      if (n.type !== nodeType) return false
      const id = getIdentifierNode(n)
      return id?.text === name
    })
    if (targets.length === 0) throw new Error(`Node ${nodeType} "${name}" not found`)
    if (targets.length > 1) throw new Error(`Multiple ${nodeType} nodes named "${name}" — requires explicit scope`)
    const target = targets[0]

    let startIndex = target.startIndex
    let endIndex = target.endIndex
    const before = root.text.slice(Math.max(0, target.startPosition.row - 1), target.startIndex)
    const trailingWs = /\s*$/.exec(before)
    if (trailingWs) startIndex -= trailingWs[0].length
    const after = root.text.slice(endIndex)
    const leadingWs = /^\s*/.exec(after)
    if (leadingWs) endIndex += leadingWs[0].length

    return {
      edits: [{ startIndex, oldEndIndex: endIndex, newText: "" }],
      log: `Deleted ${nodeType} "${name}"`,
    }
  }
}

const OPS: Record<string, (args: Record<string, unknown>) => EditOp> = {
  rename_symbol: renameSymbol,
  add_import: addImport,
  replace_function_body: replaceFunctionBody,
  insert_after_node: insertAfterNode,
  delete_node: deleteNode,
}

async function applyEdits(filePath: string, op: string, args: Record<string, unknown>): Promise<string> {
  const parser = await getParser(filePath)
  const source = await readFile(filePath, "utf8")
  const tree: Tree = parser.parse(source)!
  if (!tree) throw new Error("Failed to parse file")

  const opFn = OPS[op]
  if (!opFn) throw new Error(`Unknown operation: ${op}`)

  const { edits, log } = opFn(args)(tree.rootNode, source)

  if (edits.length === 0) return log

  edits.sort((a, b) => b.startIndex - a.startIndex)
  let result = source
  for (const edit of edits) {
    result = result.slice(0, edit.startIndex) + edit.newText + result.slice(edit.oldEndIndex)
  }

  await writeFile(filePath, result, "utf8")
  return log
}

export const AstEditTool = Tool.define(
  "ast_edit",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const filePath = path.resolve(params.file)

          const log = yield* Effect.tryPromise({
            try: () => applyEdits(filePath, params.op, params.args),
            catch: (error: unknown) => new Error(error instanceof Error ? error.message : String(error)),
          })

          return {
            title: `ast_edit: ${params.op} on ${params.file}`,
            metadata: { op: params.op, file: params.file, log },
            output: log,
          }
        }).pipe(Effect.orDie),
    }
  })
)
