import z from "zod"
import { Effect } from "effect"
import type { Metadata } from "./tool"
import fs from "fs"
import path from "path"
import * as Tool from "./tool"
import { gmail as buildGmailClient, available } from "../google/client"
import type { Account } from "../google/accounts"

const ACCOUNT_FIELD = z.string().email().describe("Which Google account (email address) to operate against")

/**
 * Builds a base64url-encoded RFC822 message from the supplied fields, mirroring
 * the shape Gmail's API expects for `.send({ requestBody: { raw } })`.
 */
function buildRfc822(args: {
  to: string[]
  subject: string
  body: string
  cc?: string[]
  bcc?: string[]
  from?: string
  attachments?: string[]
}): string {
  const lines: string[] = []
  lines.push(`To: ${args.to.join(", ")}`)
  if (args.cc?.length) lines.push(`Cc: ${args.cc.join(", ")}`)
  if (args.bcc?.length) lines.push(`Bcc: ${args.bcc.join(", ")}`)
  if (args.from) lines.push(`From: ${args.from}`)
  lines.push(`Subject: ${args.subject}`)
  lines.push("MIME-Version: 1.0")

  const hasAttachments = !!args.attachments?.length
  if (!hasAttachments) {
    lines.push('Content-Type: text/plain; charset="UTF-8"')
    lines.push("")
    lines.push(args.body)
  } else {
    const boundary = `apex_arc_${Date.now()}_${Math.random().toString(36).slice(2)}`
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    lines.push("")
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset="UTF-8"')
    lines.push("")
    lines.push(args.body)
    for (const file of args.attachments ?? []) {
      if (!fs.existsSync(file)) throw new Error(`Attachment not found: ${file}`)
      const buf = fs.readFileSync(file)
      const b64 = buf.toString("base64")
      const filename = path.basename(file)
      lines.push(`--${boundary}`)
      lines.push(`Content-Type: application/octet-stream; name="${filename}"`)
      lines.push("Content-Transfer-Encoding: base64")
      lines.push(`Content-Disposition: attachment; filename="${filename}"`)
      lines.push("")
      lines.push(b64)
    }
    lines.push(`--${boundary}--`)
  }

  const raw = lines.join("\r\n")
  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sendRaw(account: Account, raw: string) {
  const { gmail } = buildGmailClient(account)
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } })
}

async function createDraft(account: Account, raw: string) {
  const { gmail } = buildGmailClient(account)
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  })
  return res.data
}

export const GmailSendTool = Tool.define(
  "gmail_send",
  Effect.gen(function* () {
    const parameters = z.object({
      to: z.array(z.string()).min(1).describe("Recipient email address(es)"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
      cc: z.array(z.string()).optional().describe("Optional CC recipients"),
      bcc: z.array(z.string()).optional().describe("Optional BCC recipients"),
      from: z.string().optional().describe("Optional From override (within the account's allowed aliases)"),
      attachments: z.array(z.string()).optional().describe("Absolute paths to files to attach"),
      account: ACCOUNT_FIELD,
      confirm: z.boolean().default(false).describe("Must be true to actually send. If false/omitted, a draft is created."),
    })
    return {
      description: [
        "Send an email through the configured Google account.",
        "Refuses to send without `confirm: true` — instead creates a draft and asks the caller to re-invoke with confirm:true after reviewing.",
        "Addresses: pass `to` (required), optional `cc` and `bcc`.",
        "Attachments: list of absolute local file paths; embedded as base64 MIME parts.",
      ].join("\n"),
      parameters,
      execute: (params: z.infer<typeof parameters>) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const raw = yield* Effect.sync(() => {
            try {
              return buildRfc822(params)
            } catch (e: any) {
              throw new Error(`Failed to encode email: ${e.message ?? e}`)
            }
          })
          if (!params.confirm) {
            const draft = yield* Effect.promise(async () => {
              try {
                return await createDraft(params.account, raw)
              } catch (e: any) {
                throw new Error(`Gmail draft creation failed: ${e.message ?? e}`)
              }
            })
            return {
              title: "gmail_send (drafted — confirm:false)",
              metadata: { account: params.account, confirm: false, draftId: draft.id ?? null, to: params.to } satisfies Metadata,
              output: `Draft created instead of sending (confirm=false). Draft id: ${draft.id ?? "(unknown)"}.\nRe-call this tool with confirm:true to send.`,
            }
          }
          yield* Effect.promise(async () => {
            try {
              await sendRaw(params.account, raw)
            } catch (e: any) {
              throw new Error(`Gmail send failed: ${e.message ?? e}`)
            }
          })
          return {
            title: "gmail_send (sent)",
            metadata: { account: params.account, confirm: true, draftId: null, to: params.to } satisfies Metadata,
            output: `Email sent to ${params.to.join(", ")}${params.cc?.length ? ` (cc: ${params.cc.join(", ")})` : ""}${params.bcc?.length ? ` (bcc: ${params.bcc.join(", ")})` : ""} via ${params.account} account.\nSubject: ${params.subject}`,
          }
        }),
    } satisfies Tool.DefWithoutID<typeof parameters, Metadata>
  })
)

export const GmailDraftTool = Tool.define(
  "gmail_draft",
  Effect.gen(function* () {
    return {
      description: [
        "Create a draft email in the configured Google account for the user to review before sending.",
        "Same field shape as `gmail_send`, minus `confirm`.",
      ].join("\n"),
      parameters: z.object({
        to: z.array(z.string()).min(1).describe("Recipient email address(es)"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        from: z.string().optional(),
        attachments: z.array(z.string()).optional(),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: {
        to: string[]
        subject: string
        body: string
        cc?: string[]
        bcc?: string[]
        from?: string
        attachments?: string[]
        account: Account
      }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const raw = yield* Effect.sync(() => {
            try {
              return buildRfc822(params)
            } catch (e: any) {
              throw new Error(`Failed to encode email: ${e.message ?? e}`)
            }
          })
          const draft = yield* Effect.promise(async () => {
            try {
              return await createDraft(params.account, raw)
            } catch (e: any) {
              throw new Error(`Gmail draft creation failed: ${e.message ?? e}`)
            }
          })
          return {
            title: "gmail_draft",
            metadata: { account: params.account, draftId: draft.id ?? null },
            output: `Draft created in ${params.account} account. Draft id: ${draft.id ?? "(unknown)"}\nTo: ${params.to.join(", ")}\nSubject: ${params.subject}`,
          }
        }),
    }
  })
)
