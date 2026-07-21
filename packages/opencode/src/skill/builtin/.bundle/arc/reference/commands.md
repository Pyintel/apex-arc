# Arc Commands Reference

## CLI (`arc <command>`)

Invoked from the shell. `arc` with no command opens the TUI.

| Command | Purpose |
|---------|---------|
| `arc` | Launch the interactive TUI |
| `arc run` | Headless, non-interactive run (scripting/eval) |
| `arc mcp` | Manage / inspect MCP servers |
| `arc agent` | Manage agents |
| `arc models` | List available models |
| `arc providers` | List / manage providers |
| `arc account` (console) | Account / login console |
| `arc upgrade` | Update to the latest version |
| `arc uninstall` | Uninstall Arc |
| `arc serve` | Run the server |
| `arc stats` | Usage statistics |
| `arc export` / `arc import` | Export / import sessions |
| `arc session` | Manage sessions |
| `arc github` / `arc pr` | GitHub / pull-request integration |
| `arc generate` | Code generation entry |
| `arc plugin` (plug) | Manage plugins |
| `arc db` | Database utilities |
| `arc acp` / `arc attach` | ACP / attach to a running session |
| `arc debug` | Debug utilities |
| `arc completion` | Generate shell completion script |

Run `arc <command> --help` for flags on any command.

## Slash commands (inside the TUI)

| Command | Purpose |
|---------|---------|
| `/goal` | Set a stop condition; a judge model verifies it's truly met before the agent halts (prevents premature stops in autonomous work) |
| `/dream` | Scan recent traces, extract durable knowledge into project memory, prune stale entries |
| `/distill` | Detect repeated manual workflows and package high-confidence ones into skills/subagents/commands |
| `/voice` | Toggle streaming voice input (needs `sox`; Arc-logged-in users) |
| `/loop` | `[interval] <prompt>` — schedule a repeating prompt (also runs once now); maps the interval to a cron job |
| `/loops` | List scheduled cron/loop jobs; `/loops cancel <id>` stops one |
| `/connect` | Sign in to a provider (e.g. OpenRouter) |
| `/<skill-name>` | Invoke any available skill directly by name |

## Keybindings

- `Tab` — cycle primary agents (build → plan → compose).
- Other keybinds are configurable; the keybinds config module governs them.

## Notes

- The web command is currently disabled; TUI is the supported interface.
- Voice ASR (`arc-v2.5-asr`) is Arc-platform only; voice control (`arc-v2.5`) also runs on OpenRouter and compatible relays via the `voice` config (see config.md and the README voice section).
