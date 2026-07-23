import z from "zod"
import { Effect } from "effect"
import TurndownService from "turndown"
import * as Tool from "./tool"
import { docs as buildDocsClient, drive as buildDriveClient, available } from "../google/client"
import type { Account } from "../google/accounts"

const ACCOUNT_FIELD = z.string().email().describe("Which Google account to operate against")

/**
 * Google Docs returns document body as a tree of StructuralElements (paragraphs, tables,
 * section breaks). We reconstruct a tiny HTML shape and let Turndown convert to markdown.
 */
function docToMarkdown(doc: any): string {
  const body = doc.body
  if (!body?.content) return ""
  const html: string[] = []
  for (const el of body.content) {
    if (el.paragraph) {
      const para = el.paragraph
      const text = (para.elements ?? [])
        .filter((e: any) => e.textRun?.content)
        .map((e: any) => {
          const content = (e.textRun.content ?? "").replace(/\n$/, "")
          const textStyle = e.textRun.textStyle
          if (textStyle?.link?.url) return `<a href="${textStyle.link.url}">${content}</a>`
          if (textStyle?.bold) return `<strong>${content}</strong>`
          if (textStyle?.italic) return `<em>${content}</em>`
          return content
        })
        .join("")
      if (!text) continue
      const style = para.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT"
      if (style.startsWith("HEADING_")) {
        const level = Number(style.split("_")[1] ?? 1)
        html.push(`<h${level}>${text}</h${level}>`)
      } else if (style === "TITLE") {
        html.push(`<h1>${text}</h1>`)
      } else {
        html.push(`<p>${text}</p>`)
      }
    }
  }
  const turndown = new TurndownService({ headingStyle: "atx" })
  return turndown.turndown(html.join("\n"))
}

/**
 * Minimal markdown → Docs batchUpdate translator. Supports:
 *  - `# H1`, `## H2`, `### H3` headings
 *  - bullet list (`- item`)
 *  - numbered list (`1. item`)
 *  - plain paragraph
 * Blank lines separate paragraphs.
 */
function markdownToBatchUpdate(md: string): any[] {
  const requests: any[] = []
  let cursor = 1 // start after the implicit newline at index 0
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd())
    if (lines[0]?.startsWith("# ")) {
      const text = lines[0].slice(2)
      requests.push(insertTextRequest(cursor, text, "HEADING_1"))
      cursor += text.length + 1
    } else if (lines[0]?.startsWith("## ")) {
      const text = lines[0].slice(3)
      requests.push(insertTextRequest(cursor, text, "HEADING_2"))
      cursor += text.length + 1
    } else if (lines[0]?.startsWith("### ")) {
      const text = lines[0].slice(4)
      requests.push(insertTextRequest(cursor, text, "HEADING_3"))
      cursor += text.length + 1
    } else if (lines.every((l) => l.startsWith("- "))) {
      for (const l of lines) {
        const text = l.slice(2)
        requests.push(insertTextRequest(cursor, text, void 0, "BULLET"))
        cursor += text.length + 1
      }
    } else if (lines.every((l) => /^\d+\.\s/.test(l))) {
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i].replace(/^\d+\.\s/, "")
        requests.push(insertTextRequest(cursor, text, void 0, "NUMBERED_BULLET", i + 1))
        cursor += text.length + 1
      }
    } else {
      const text = lines.join("\n")
      requests.push(insertTextRequest(cursor, text))
      cursor += text.length + 1
    }
  }
  return requests
}

function insertTextRequest(index: number, text: string, namedStyle?: string, glyphType?: string, bulletOrdinal?: number): any {
  return {
    insertText: { location: { index }, text },
    ...(namedStyle
      ? [{
          updateParagraphStyle: {
            range: { startIndex: index, endIndex: index + text.length },
            paragraphStyle: { namedStyleType: namedStyle },
            fields: "namedStyleType",
          },
        }]
      : []),
    ...(glyphType
      ? [{
          createParagraphBullets: {
            range: { startIndex: index, endIndex: index + text.length },
            bulletPreset: glyphType === "NUMBERED_BULLET" ? "NUMBERED_DECIMAL_ALPHA_ROMAN" : "BULLET_DISC_CIRCLE_SQUARE",
          },
        }]
      : []),
  }
}

export const DocsGetTool = Tool.define(
  "docs_get",
  Effect.gen(function* () {
    return {
      description: [
        "Fetch the body of a Google Docs document as markdown.",
        "Headings become `# / ## / ###`, links become `[text](url)`, bold/italic preserved.",
      ].join("\n"),
      parameters: z.object({
        documentId: z.string().describe("Google Docs document ID (between /d/ and /edit in the URL)"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: { documentId: string; account: Account }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const docs = buildDocsClient(params.account)
          const res = yield* Effect.promise(async () => {
            try {
              return await docs.documents.get({ documentId: params.documentId })
            } catch (e: any) {
              throw new Error(`Docs get failed: ${e.message ?? e}`)
            }
          })
          const md = yield* Effect.sync(() => {
            try {
              return docToMarkdown(res.data)
            } catch (e: any) {
              throw new Error(`Failed to convert Doc to markdown: ${e.message ?? e}`)
            }
          })
          return {
            title: "docs_get",
            metadata: { account: params.account, documentId: params.documentId, title: res.data.title ?? null },
            output: `# ${res.data.title ?? "(untitled)"}\n\n${md}`,
          }
        }),
    }
  })
)

export const DocsCreateTool = Tool.define(
  "docs_create",
  Effect.gen(function* () {
    return {
      description: [
        "Create a new Google Doc with the given title and markdown body.",
        "Supports `# H1`, `## H2`, `### H3` headings, bullet lists (`- `), numbered lists (`1. `), plain paragraphs.",
        "Returns the document ID and a `docs.google.com` URL.",
      ].join("\n"),
      parameters: z.object({
        title: z.string().describe("Document title"),
        body: z.string().describe("Markdown body content"),
        folderId: z.string().optional().describe("Optional Drive folder ID to place the Doc in (else root)"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: { title: string; body: string; folderId?: string; account: Account }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const docs = buildDocsClient(params.account)
          const drive = buildDriveClient(params.account)
          const create = yield* Effect.promise(async () => {
            try {
              return await docs.documents.create({ requestBody: { title: params.title } })
            } catch (e: any) {
              throw new Error(`Docs create failed: ${e.message ?? e}`)
            }
          })
          const documentId = create.data.documentId!
          const batchRequests = yield* Effect.sync(() => {
            try {
              return markdownToBatchUpdate(params.body)
            } catch (e: any) {
              throw new Error(`Failed to compile markdown to batch update: ${e.message ?? e}`)
            }
          })
          if (batchRequests.length) {
            yield* Effect.promise(async () => {
              try {
                await docs.documents.batchUpdate({ documentId, requestBody: { requests: batchRequests } })
              } catch (e: any) {
                throw new Error(`Docs body fill failed: ${e.message ?? e}`)
              }
            })
          }
          if (params.folderId) {
            // Move Doc into the requested folder by patching parents via Drive API.
            yield* Effect.promise(async () => {
              try {
                await drive.files.update({ fileId: documentId, addParents: params.folderId, removeParents: "root", fields: "id, parents" })
              } catch (e: any) {
                throw new Error(`Docs move-to-folder failed: ${e.message ?? e}`)
              }
            })
          }
          return {
            title: "docs_create",
            metadata: { account: params.account, documentId, url: `https://docs.google.com/document/d/${documentId}/edit` },
            output: `Created Doc "${params.title}" via ${params.account}.\nDocument ID: ${documentId}\nURL: https://docs.google.com/document/d/${documentId}/edit`,
          }
        }),
    }
  })
)
