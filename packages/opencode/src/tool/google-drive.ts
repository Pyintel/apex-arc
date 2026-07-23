import z from "zod"
import { Effect } from "effect"
import fs from "fs"
import path from "path"
import * as Tool from "./tool"
import { drive as buildDriveClient, available } from "../google/client"
import type { Account } from "../google/accounts"

const ACCOUNT_FIELD = z.string().email().describe("Which Google account's Drive to use")

export const DriveUploadTool = Tool.define(
  "drive_upload",
  Effect.gen(function* () {
    return {
      description: [
        "Upload a local file to the configured Google Drive account.",
        "Provide a `folderId` (Drive folder ID) to place the file in a specific folder; omit (or use 'root') to upload to My Drive root.",
        "If a file with the same name already exists in the target folder, a second copy is created (Drive's default behavior).",
      ].join("\n"),
      parameters: z.object({
        filePath: z.string().describe("Absolute path to the local file to upload"),
        name: z.string().optional().describe("Optional filename in Drive (defaults to local basename)"),
        folderId: z.string().optional().describe("Optional Drive folder ID; omit or 'root' for My Drive root"),
        mimeType: z.string().optional().describe("Optional MIME type; auto-detected from extension if omitted"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: { filePath: string; name?: string; folderId?: string; mimeType?: string; account: Account }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          if (!fs.existsSync(params.filePath)) {
            throw new Error(`File not found: ${params.filePath}`)
          }
          const drive = buildDriveClient(params.account) as any
          const filename = params.name ?? path.basename(params.filePath)
          const media = { mimeType: params.mimeType ?? "application/octet-stream", body: fs.createReadStream(params.filePath) }
          const resource: any = { name: filename }
          if (params.folderId && params.folderId !== "root") resource.parents = [params.folderId]
          const res = yield* Effect.promise(async () => {
            try {
              return await drive.files.create({ requestBody: resource, media, fields: "id, name, webViewLink" })
            } catch (e: any) {
              throw new Error(`Drive upload failed: ${e.message ?? e}`)
            }
          })
          return {
            title: "drive_upload",
            metadata: { account: params.account, fileId: res.data.id ?? null, name: res.data.name ?? filename },
            output: `Uploaded ${filename} to ${params.account} Drive.\nFile ID: ${res.data.id ?? "(unknown)"}\nLink: ${res.data.webViewLink ?? "(no link returned)"}`,
          }
        }),
    }
  })
)

export const DriveListTool = Tool.define(
  "drive_list",
  Effect.gen(function* () {
    return {
      description: [
        "List files in a Drive folder.",
        "Pass `folderId` (or 'root' for My Drive root). Returns up to `pageSize` files (default 25).",
        "Use `q` to pass a Drive query (e.g. `name contains 'exam'`), or omit to list all files in the folder.",
      ].join("\n"),
      parameters: z.object({
        folderId: z.string().default("root").describe("Drive folder ID; 'root' for My Drive root"),
        pageSize: z.number().int().min(1).max(200).default(25),
        q: z.string().optional().describe("Optional Drive query string (e.g. `trashed = false and name contains 'foo'`)"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: { folderId: string; pageSize: number; q?: string; account: Account }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const drive = buildDriveClient(params.account) as any
          const query = params.q ?? `'${params.folderId}' in parents and trashed = false`
          const res = yield* Effect.promise(async () => {
            try {
              return await drive.files.list({
              q: query,
              pageSize: params.pageSize,
              fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
              })
            } catch (e: any) {
              throw new Error(`Drive list failed: ${e.message ?? e}`)
            }
          })
          const files = (res.data.files ?? []) as any[]
          const lines = files.map((f) => {
            const link = f.webViewLink ?? ""
            return `- ${f.name} [${f.mimeType}]${link ? ` — ${link}` : ""}  (id: ${f.id})`
          })
          return {
            title: "drive_list",
            metadata: { account: params.account, count: files.length, folderId: params.folderId },
            output: `Found ${files.length} file(s) in folder ${params.folderId} via ${params.account}:\n${lines.join("\n")}`,
          }
        }),
    }
  })
)
