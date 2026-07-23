import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { calendar as buildCalendarClient, available } from "../google/client"
import type { Account } from "../google/accounts"

const ACCOUNT_FIELD = z.string().email().describe("Which Google account's calendar to use")

export const CalendarCreateTool = Tool.define(
  "calendar_create",
  Effect.gen(function* () {
    return {
      description: [
        "Create an event on the configured Google calendar.",
        "Times are RFC3339 (e.g. `2026-07-23T13:40:00-04:00`). Use an end that follows start.",
        "Set `sendUpdates` to `all` if you want invite emails to reach attendees (defaults to `none`).",
      ].join("\n"),
      parameters: z.object({
        summary: z.string().describe("Event title"),
        start: z.string().describe("RFC3339 start datetime with timezone offset"),
        end: z.string().describe("RFC3339 end datetime with timezone offset"),
        location: z.string().optional().describe("Optional location string"),
        description: z.string().optional().describe("Optional description / notes"),
        attendees: z.array(z.string()).optional().describe("Optional list of attendee emails"),
        reminders: z.array(z.object({ minutes: z.number().int(), method: z.enum(["email", "popup"]) })).optional().describe("Custom reminders. If omitted, calendar defaults apply."),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).default("none").describe("Who gets invite emails (defaults to none)"),
        calendarId: z.string().default("primary").describe("Calendar identifier; 'primary' = the account's default calendar"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: {
        summary: string
        start: string
        end: string
        location?: string
        description?: string
        attendees?: string[]
        reminders?: { minutes: number; method: "email" | "popup" }[]
        sendUpdates: "all" | "externalOnly" | "none"
        calendarId: string
        account: Account
      }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const calendar = buildCalendarClient(params.account)
          const requestBody: any = {
            summary: params.summary,
            start: { dateTime: params.start },
            end: { dateTime: params.end },
            ...(params.location ? { location: params.location } : {}),
            ...(params.description ? { description: params.description } : {}),
            ...(params.attendees?.length ? { attendees: params.attendees.map((email) => ({ email })) } : {}),
            sendUpdates: params.sendUpdates,
            ...(params.reminders?.length
              ? { reminders: { useDefault: false, overrides: params.reminders.map((r) => ({ minutes: r.minutes, method: r.method })) } }
              : {}),
          }
          const res = yield* Effect.promise(async () => {
            try {
              return await calendar.events.insert({ calendarId: params.calendarId, requestBody })
            } catch (e: any) {
              throw new Error(`Calendar create failed: ${e.message ?? e}`)
            }
          })
          return {
            title: "calendar_create",
            metadata: {
              account: params.account,
              eventId: res.data.id ?? null,
              htmlLink: res.data.htmlLink ?? null,
            },
            output: `Event "${params.summary}" created on ${params.account} calendar.\n${res.data.htmlLink ?? "(no link returned)"}\n${params.attendees?.length ? `Attendees: ${params.attendees.join(", ")}\n` : ""}From ${params.start} to ${params.end}.`,
          }
        }),
    }
  })
)

export const CalendarListTool = Tool.define(
  "calendar_list",
  Effect.gen(function* () {
    return {
      description: [
        "List calendar events in a date range.",
        "Pass `timeMin` and `timeMax` as RFC3339 datetimes (with timezone offset).",
        "Returns up to `maxResults` events (default 25) sorted by start time.",
      ].join("\n"),
      parameters: z.object({
        timeMin: z.string().describe("RFC3339 lower bound (inclusive)"),
        timeMax: z.string().describe("RFC3339 upper bound (exclusive)"),
        maxResults: z.number().int().min(1).max(250).default(25),
        calendarId: z.string().default("primary"),
        account: ACCOUNT_FIELD,
      }),
      execute: (params: {
        timeMin: string
        timeMax: string
        maxResults: number
        calendarId: string
        account: Account
      }) =>
        Effect.gen(function* () {
          if (!available(params.account)) {
            throw new Error(`Google account "${params.account}" is not configured. See packages/opencode/src/google/README.md.`)
          }
          const calendar = buildCalendarClient(params.account)
          const res = yield* Effect.promise(async () => {
            try {
              return await calendar.events.list({
              calendarId: params.calendarId,
              timeMin: params.timeMin,
              timeMax: params.timeMax,
              maxResults: params.maxResults,
              singleEvents: true,
              orderBy: "startTime",
              })
            } catch (e: any) {
              throw new Error(`Calendar list failed: ${e.message ?? e}`)
            }
          })
          const items = res.data.items ?? []
          const lines = items.map((ev: any) => {
            const startRaw = ev.start?.dateTime ?? ev.start?.date ?? "?"
            const endRaw = ev.end?.dateTime ?? ev.end?.date ?? "?"
            const attendees = ev.attendees?.length ? ` · ${ev.attendees.length} attendee(s)` : ""
            return `- ${startRaw} → ${endRaw}: ${ev.summary ?? "(no title)"}${attendees}${ev.location ? ` @ ${ev.location}` : ""}`
          })
          return {
            title: "calendar_list",
            metadata: { account: params.account, count: items.length },
            output: `Found ${items.length} event(s) on ${params.account} calendar:\n${lines.join("\n")}`,
          }
        }),
    }
  })
)
