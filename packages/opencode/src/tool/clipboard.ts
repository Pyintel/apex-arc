import z from "zod"
import { Effect } from "effect"
import { copy, read } from "../cli/cmd/tui/util/clipboard.js"
import * as Tool from "./tool"

const COPY_DESCRIPTION = [
  "Copy text to the system clipboard.",
  "",
  "Use this when the user explicitly requests to copy a piece of code, text, command, or output to their clipboard.",
].join("\n")

const PASTE_DESCRIPTION = [
  "Read and return text from the system clipboard.",
  "",
  "Use this when the user asks you to read or paste what is currently in their clipboard.",
].join("\n")

export const ClipboardCopyTool = Tool.define(
  "clipboard_copy",
  Effect.gen(function* () {
    return {
      description: COPY_DESCRIPTION,
      parameters: z.object({
        text: z.string().describe("The text content to copy to the clipboard"),
      }),
      execute: (params: { text: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => copy(params.text))
          return {
            title: "copy",
            metadata: {},
            output: "Successfully copied text to clipboard.",
          }
        }),
    }
  })
)

export const ClipboardPasteTool = Tool.define(
  "clipboard_paste",
  Effect.gen(function* () {
    return {
      description: PASTE_DESCRIPTION,
      parameters: z.object({}),
      execute: (params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const content = yield* Effect.promise(() => read())
          return {
            title: "paste",
            metadata: {},
            output: content?.data ?? "",
          }
        }),
    }
  })
)
