# Google Workspace integration for Apex Arc

Ten in-process tools wired to five Google APIs (Gmail, Calendar, Sheets, Docs, Drive). Each tool
takes an `account: "primary" | "secondary"` parameter so the agent can target the right inbox /
calendar / drive.

## First-time setup

Both accounts use the **same OAuth 2.0 Desktop flow** — no service accounts, no domain-wide
delegation, no IT involvement.

For each account (`primary`, `secondary`):

1. In Google Cloud Console, create (or reuse) a project. Enable the Gmail, Calendar, Sheets,
   Docs, and Drive APIs.
2. Create an **OAuth 2.0 Client ID** of type *Desktop app*. Download the JSON.
3. Save it to one of these paths:
   - Primary: `~/.local/share/apex-arc/google/oauth-client-primary.json`
   - Secondary: `~/.local/share/apex-arc/google/oauth-client-secondary.json`
     *(Windows: `%LOCALAPPDATA%\apex-arc\google\…`)*
4. Run the one-time auth flow with the `--account` flag:
   ```bash
   bun packages/opencode/src/google/auth-cli.ts --account primary
   bun packages/opencode/src/google/auth-cli.ts --account secondary
   ```
   Each command opens a browser, completes consent for that account, and saves a refresh token
   to `token-primary.json` / `token-secondary.json` in the same directory. After this, all tool
   calls for that account refresh silently.

> **Note on "unverified app" warnings**: nau school emails / personal Gmail will see a
> "Google hasn't verified this app" screen during consent. Click *Advanced → Go to <app name>
> (unsafe)* to proceed. This is expected for private developer OAuth clients; the scopes are
> declared in `accounts.ts → SCOPES` and stored only on your machine.

## Tool surface

| Tool | Description |
|---|---|
| `gmail_send` | Send email. Requires `confirm: true` to actually send, else drafts. |
| `gmail_draft` | Create a draft for review. |
| `calendar_create` | Create an event. |
| `calendar_list` | List events in a date range. |
| `sheets_append` | Append a row to a sheet. |
| `sheets_read` | Read a range. |
| `docs_get` | Fetch a Doc body as markdown. |
| `docs_create` | Create a new Doc from markdown. |
| `drive_upload` | Upload a local file to a Drive folder. |
| `drive_list` | List files in a folder. |

## Safety

`gmail_send` will create a draft instead of sending if `confirm` is omitted or `false`. The agent
is instructed to always re-call with `confirm: true` only after explicit user confirmation. Calendar
events include a `sendUpdates` field (defaults `"none"`) so invites aren't emailed without intent.
