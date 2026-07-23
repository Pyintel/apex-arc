import { google } from "googleapis"
import { OAuth2Client } from "google-auth-library"
import fs from "fs"
import { SCOPES, Paths, sanitizeEmail, type Account } from "./accounts"

const REDIRECT_URI = "http://localhost:8765/callback"

const memo = new Map<string, OAuth2Client>()

function ensureDir() {
  if (!fs.existsSync(Paths.credentialsDir)) {
    fs.mkdirSync(Paths.credentialsDir, { recursive: true })
  }
}

/** Loads the shared OAuth client secrets (the "app" Apex Arc registers with Google). */
function loadClientSecret(): { client_id: string; client_secret: string } {
  if (!fs.existsSync(Paths.clientSecret)) {
    throw new Error(
      `Google OAuth client secrets not found at ${Paths.clientSecret}. ` +
      `Download an OAuth 2.0 Desktop client secrets JSON from Google Cloud Console and save it there.`,
    )
  }
  const raw = JSON.parse(fs.readFileSync(Paths.clientSecret, "utf8"))
  const installed = raw.installed ?? raw.web
  return { client_id: installed.client_id, client_secret: installed.client_secret }
}

/**
 * Loads the persisted OAuth2 refresh token for the given Gmail user and builds
 * an OAuth2 client. Memoized per email for process lifetime. Access tokens
 * refresh silently via google-auth-library when they expire.
 *
 * `account` is any Gmail address that has authorized the Apex Arc OAuth client.
 */
export function client(account: Account): OAuth2Client {
  const email = account.trim().toLowerCase()
  if (memo.has(email)) return memo.get(email)!
  const tokenPath = Paths.tokenFor(email)
  if (!fs.existsSync(Paths.clientSecret) || !fs.existsSync(tokenPath)) {
    throw new Error(
      `Google credentials for "${email}" not found. Run ` +
      `\`bun run packages/opencode/src/google/auth-cli.ts --email ${email}\` ` +
      `to complete the one-time consent flow.`,
    )
  }
  const { client_id, client_secret } = loadClientSecret()
  const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"))
  const c = new OAuth2Client({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUri: REDIRECT_URI,
  })
  c.setCredentials(token)
  memo.set(email, c)
  return c
}

/** Returns the auth client for the requested Gmail user. */
export function authFor(account: Account): OAuth2Client {
  return client(account)
}

/** Whether the requested Gmail user has authorized Apex Arc. */
export function available(account: Account): boolean {
  const email = account.trim().toLowerCase()
  return fs.existsSync(Paths.clientSecret) && fs.existsSync(Paths.tokenFor(email))
}

/** Convenience namespace builders — each returns a fully-authed google API client for the user. */
export function gmail(account: Account) {
  const auth = authFor(account)
  return { auth, gmail: google.gmail({ version: "v1", auth } as any) }
}

export function calendar(account: Account) {
  const auth = authFor(account)
  return google.calendar({ version: "v3", auth } as any)
}

export function sheets(account: Account) {
  const auth = authFor(account)
  return google.sheets({ version: "v4", auth } as any)
}

export function docs(account: Account) {
  const auth = authFor(account)
  return google.docs({ version: "v1", auth } as any)
}

export function drive(account: Account) {
  const auth = authFor(account)
  return google.drive({ version: "v3", auth } as any)
}

export { ensureDir, REDIRECT_URI, SCOPES, sanitizeEmail }
