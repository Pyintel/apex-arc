import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { sheets as buildSheetsClient, available } from "../google/client"
import type { Account } from "../google/accounts"

const ACCOUNT_FIELD = z.string().email().describe("Which Google account to operate against")

export const SheetsAppendTool = Tool.define(
  "sheets_append",
  Effect.gen(function* () {
    return {
      description: [
        "Append one or more rows to the end of a sheet in a Google Sheets spreadsheet.",
        "`range` should be the sheet name (e.g. `Sheet1`) or a column-prefixed range like `Sheet1!A:Z`.",
        "Values are passed as an array of rows; each row is an array of cell values (strings/numbers/booleans).",
      ].join("\n"),
      parameters: z.object({
        spreadsheetId: z.string().describe("Google Sheets spreadsheet ID (between /d/ and /edit in the URL)"),
        range: z.string().describe("Target sheet name or A1 range to append to"),
        values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).min(1).describe("Rows to append"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: {
        spreadsheetId: string
        range: string
        values: (string | number | boolean)[][]
        account: Account
      }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const sheets = buildSheetsClient(params.account)
          const res = yield* Effect.promise(async () => {
            try {
              return await sheets.spreadsheets.values.append({
              spreadsheetId: params.spreadsheetId,
              range: params.range,
              valueInputOption: "USER_ENTERED",
              insertDataOption: "INSERT_ROWS",
              requestBody: { values: params.values },
              })
            } catch (e: any) {
              throw new Error(`Sheets append failed: ${e.message ?? e}`)
            }
          })
          return {
            title: "sheets_append",
            metadata: { account: params.account, updates: res.data.updates ?? null },
            output: `Appended ${params.values.length} row(s) to "${params.range}" in spreadsheet ${params.spreadsheetId} via ${params.account} account.\nUpdated range: ${res.data.updates?.updatedRange ?? "(unknown)"}`,
          }
        }),
    }
  })
)

export const SheetsReadTool = Tool.define(
  "sheets_read",
  Effect.gen(function* () {
    return {
      description: [
        "Read a range of cells from a Google Sheets spreadsheet.",
        "Returns rows as arrays of cell values (strings/numbers/booleans). Empty trailing cells in each row are trimmed.",
      ].join("\n"),
      parameters: z.object({
        spreadsheetId: z.string().describe("Google Sheets spreadsheet ID"),
        range: z.string().describe("Sheet name or A1 range (e.g. `Sheet1!A1:E10`)"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: { spreadsheetId: string; range: string; account: Account }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const sheets = buildSheetsClient(params.account)
          const res = yield* Effect.promise(async () => {
            try {
              return await sheets.spreadsheets.values.get({ spreadsheetId: params.spreadsheetId, range: params.range })
            } catch (e: any) {
              throw new Error(`Sheets read failed: ${e.message ?? e}`)
            }
          })
          const values = res.data.values ?? []
          const lines = values.map((row: any[], i: number) => `${String(i + 1).padStart(3)} | ${(row ?? []).map((c: any) => String(c ?? "")).join("\t")}`)
          return {
            title: "sheets_read",
            metadata: { account: params.account, range: params.range, rows: values.length },
            output: `Read ${values.length} row(s) from "${params.range}" in ${params.spreadsheetId} via ${params.account}:\n${lines.join("\n")}`,
          }
        }),
    }
  })
)
