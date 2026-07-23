/**
 * One-time OAuth flow to authorize a Gmail user against the Apex Arc OAuth client.
 *
 * Usage:
 *   1. In Google Cloud Console, create ONE OAuth 2.0 "Desktop app" client ID.
 *      Download the JSON and save it to:
 *        ~/.local/share/apex-arc/google/oauth-client.json
 *        (Windows: %LOCALAPPDATA%\apex-arc\google\oauth-client.json)
 *   2. For each Gmail user you want to authorize:
 *        bun packages/opencode/src/google/auth-cli.ts --email rites@oakland.edu
 *        bun packages/opencode/src/google/auth-cli.ts --email you@gmail.com
 *        bun packages/opencode/src/google/auth-cli.ts --email other@foo.org
 *   3. Each command opens a browser for THAT user's consent, then saves their refresh token
 *      to `token-<sanitized-email>.json` in the same directory.
 *
 * Notes:
 * - One OAuth client, unlimited Gmail users. Each consent is a separate browser flow with
 *   the user signed into the matching Google account in the browser.
 * - Apex Arc is an unverified app for sensitive scopes — user sees "Google hasn't verified
 *   this app". Click *Advanced → Go to Apex Arc (unsafe)* to proceed. This is expected
 *   for private developer OAuth clients.
 */
import http from "http"
import { URL } from "url"
import { OAuth2Client } from "google-auth-library"
import open from "open"
import fs from "fs"
import path from "path"
import { Paths, SCOPES, sanitizeEmail } from "./accounts"

const REDIRECT_PORT = 8765
const REDIRECT_PATH = "/callback"
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`

function parseEmail(): string {
  const idx = process.argv.indexOf("--email")
  const value = idx >= 0 ? process.argv[idx + 1] : undefined
  if (!value || !value.includes("@")) {
    console.error("Usage: bun packages/opencode/src/google/auth-cli.ts --email <gmail-address>")
    process.exit(1)
  }
  return value
}

function main() {
  const email = parseEmail()
  const tokenPath = Paths.tokenFor(email)

  if (!fs.existsSync(Paths.clientSecret)) {
    console.error(`✗ Missing OAuth client secrets:\n  ${Paths.clientSecret}`)
    console.error(`  Download an OAuth 2.0 Desktop client secrets JSON from Google Cloud Console and save it there.`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(Paths.clientSecret, "utf8"))
  const installed = raw.installed ?? raw.web
  const client = new OAuth2Client({
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    redirectUri: REDIRECT_URI,
  })

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    login_hint: email,
  })

  console.log(`↪ OAuth flow for "${email}"`)
  console.log(`  Make sure you are signed into THAT account in your browser before approving.`)
  console.log(`  Waiting for callback at ${REDIRECT_URI}...`)
  console.log(`  Opening browser for consent...`)
  console.log(`  If it doesn't open, visit:\n  ${authUrl}`)

  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "", REDIRECT_URI)
    if (u.pathname !== REDIRECT_PATH) {
      res.writeHead(404)
      res.end("not found")
      return
    }
    const code = u.searchParams.get("code")
    const err = u.searchParams.get("error")
    if (err) {
      res.writeHead(400, { "content-type": "text/html" })
      res.end(`OAuth error: ${err}`)
      server.close()
      console.error(`✗ OAuth flow reported error: ${err}`)
      process.exit(1)
    }
    if (!code) {
      res.writeHead(400)
      res.end("missing code")
      return
    }
    client.getToken({ code, redirect_uri: REDIRECT_URI }).then(({ tokens }) => {
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2))
      res.writeHead(200, { "content-type": "text/html" })
      res.end(`<h1>Authorized (${email})</h1><p>You can close this tab now.</p>`)
      server.close()
      console.log(`✓ Token saved for "${email}" → ${tokenPath}`)
      process.exit(0)
    }).catch((e) => {
      res.writeHead(500, { "content-type": "text/html" })
      res.end(`<h1>Token exchange failed</h1><pre>${String(e)}</pre>`)
      server.close()
      console.error(`✗ Token exchange failed: ${e}`)
      process.exit(1)
    })
  })

  server.listen(REDIRECT_PORT, () => {
    void open(authUrl)
  })
}

main()
