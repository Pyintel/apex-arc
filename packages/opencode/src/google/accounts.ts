import path from "path"
import fs from "fs"
import { Path as GlobalPath } from "@/global"

/**
 * Apex Arc uses ONE OAuth 2.0 Desktop client (the "app"). Any number of Gmail
 * users — including your own accounts — can consent to that client and have
 * their refresh token stored side-by-side. Each tool call targets a user by
 * email, so you can wire up as many accounts as you like.
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
]

const dir = path.join(GlobalPath.data, "google")

/**
 * File layout:
 *   - oauth-client.json    : the ONE OAuth 2.0 Desktop client secrets JSON from Google Cloud Console
 *   - token-<email>.json   : one refresh token per Gmail user who consented (email is sanitized to a safe filename)
 */
export const Paths = {
  credentialsDir: dir,
  clientSecret: path.join(dir, "oauth-client.json"),
  tokenFor: (email: string) => path.join(dir, `token-${sanitizeEmail(email)}.json`),
} as const

/** Lowercases and replaces characters that are not safe in a Windows/Linux filename. */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9._@+-]/g, "_")
}

/** Lists every authorized user by reading `token-*.json` filenames in the credentials dir. */
export function authorizedEmails(): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("token-") && f.endsWith(".json"))
    .map((f) => f.slice("token-".length, -".json".length))
}

/** The `account` parameter accepted by every tool — any Gmail address. */
export type Account = string
