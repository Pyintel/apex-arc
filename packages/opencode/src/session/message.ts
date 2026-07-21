import z from "zod"
import { SessionID } from "./schema"
import { ModelID, ProviderID } from "../provider/schema"
import { NamedError } from "@mimo-ai/shared/util/error"

export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
export const AuthError = NamedError.create(
  "ProviderAuthError",
  z.object({
    providerID: z.string(),
    message: z.string(),
  }),
)

export const ToolCall = z
  .object({
    state: z.literal("call"),
    step: z.number().optional(),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.custom<Required<unknown>>(),
  })
  
export type ToolCall = z.infer<typeof ToolCall>

export const ToolPartialCall = z
  .object({
    state: z.literal("partial-call"),
    step: z.number().optional(),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.custom<Required<unknown>>(),
  })
  
export type ToolPartialCall = z.infer<typeof ToolPartialCall>

export const ToolResult = z
  .object({
    state: z.literal("result"),
    step: z.number().optional(),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.custom<Required<unknown>>(),
    result: z.string(),
  })
  
export type ToolResult = z.infer<typeof ToolResult>

export const ToolInvocation = z.discriminatedUnion("state", [ToolCall, ToolPartialCall, ToolResult])
export type ToolInvocation = z.infer<typeof ToolInvocation>

export const TextPart = z
  .object({
    type: z.literal("text"),
    text: z.string(),
  })
  
export type TextPart = z.infer<typeof TextPart>

export const ReasoningPart = z
  .object({
    type: z.literal("reasoning"),
    text: z.string(),
    providerMetadata: z.record(z.string(), z.any()).optional(),
  })
  
export type ReasoningPart = z.infer<typeof ReasoningPart>

export const ToolInvocationPart = z
  .object({
    type: z.literal("tool-invocation"),
    toolInvocation: ToolInvocation,
  })
  
export type ToolInvocationPart = z.infer<typeof ToolInvocationPart>

export const SourceUrlPart = z
  .object({
    type: z.literal("source-url"),
    sourceId: z.string(),
    url: z.string(),
    title: z.string().optional(),
    providerMetadata: z.record(z.string(), z.any()).optional(),
  })
  
export type SourceUrlPart = z.infer<typeof SourceUrlPart>

export const FilePart = z
  .object({
    type: z.literal("file"),
    mediaType: z.string(),
    filename: z.string().optional(),
    url: z.string(),
  })
  
export type FilePart = z.infer<typeof FilePart>

export const StepStartPart = z
  .object({
    type: z.literal("step-start"),
  })
  
export type StepStartPart = z.infer<typeof StepStartPart>

export const MessagePart = z
  .discriminatedUnion("type", [TextPart, ReasoningPart, ToolInvocationPart, SourceUrlPart, FilePart, StepStartPart])
  
export type MessagePart = z.infer<typeof MessagePart>

export const Info = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    parts: z.array(MessagePart),
    metadata: z
      .object({
        time: z.object({
          created: z.number(),
          completed: z.number().optional(),
        }),
        error: z
          .union([AuthError.Schema, NamedError.Unknown.Schema, OutputLengthError.Schema])
          .optional(),
        sessionID: SessionID.zod,
        tool: z.record(
          z.string(),
          z
            .object({
              title: z.string(),
              snapshot: z.string().optional(),
              time: z.object({
                start: z.number(),
                end: z.number(),
              }),
            })
            .catchall(z.any()),
        ),
        assistant: z
          .object({
            system: z.string().array(),
            modelID: ModelID.zod,
            providerID: ProviderID.zod,
            path: z.object({
              cwd: z.string(),
              root: z.string(),
            }),
            cost: z.number(),
            summary: z.boolean().optional(),
            tokens: z.object({
              input: z.number(),
              output: z.number(),
              reasoning: z.number(),
              cache: z.object({
                read: z.number(),
                write: z.number(),
              }),
            }),
          })
          .optional(),
        snapshot: z.string().optional(),
      })
      ,
  })
  
export type Info = z.infer<typeof Info>

export * as Message from "./message"
