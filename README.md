# Apex Arc

<p align="center"><strong>Apex Arc: Where Models and Agents Co-Evolve</strong></p>

Apex Arc is a terminal-native AI coding assistant. It can read and write code, run commands, manage Git, use MCP servers, and keep persistent project memory across sessions.

## Install

```bash
npm install -g @pyintel/arc --registry https://registry.npmjs.org
```

Run either command:

```bash
apex-arc
arc
```

The npm package links both `apex-arc` and `arc` to the same CLI wrapper.

## Build From Source

Install dependencies from the repo root:

```bash
bun install
```

Run the CLI from source:

```bash
bun run dev
```

Typecheck the main CLI package:

```bash
cd packages/opencode
bun typecheck
```

Tests must be run from package directories, not the repo root.

## Build Binaries

Set the release version and npm dist-tag/channel with `ARC_VERSION` and `ARC_CHANNEL`.

PowerShell:

```powershell
$env:ARC_VERSION="0.2.10"
$env:ARC_CHANNEL="latest"
```

Bash:

```bash
export ARC_VERSION=0.2.10
export ARC_CHANNEL=latest
```

Build all targets:

```bash
bun run --cwd packages/opencode build
```

Build by operating system:

```bash
bun run build:windows
bun run build:linux
bun run build:macos
```

Equivalent npm commands:

```bash
npm run build:windows
npm run build:linux
npm run build:macos
```

The OS-specific scripts call:

```bash
bun run --cwd packages/opencode script/build.ts --os=windows
bun run --cwd packages/opencode script/build.ts --os=linux
bun run --cwd packages/opencode script/build.ts --os=macos
```

For a current-machine smoke build:

```bash
bun run build:windows --single --skip-install
```

On Windows x64 this writes:

```text
packages/opencode/dist/apex-arc-windows-x64/bin/apex-arc.exe
```

## Publish To npm

After building the desired platform packages, publish from `packages/opencode`:

```bash
bun run --cwd packages/opencode script/publish.ts
```

The publish script publishes platform binary packages first, then publishes the wrapper package `@pyintel/arc`.

The wrapper package installs the `arc` and `apex-arc` commands and resolves the correct native package at runtime.

## Build Environment Variables

| Variable | Purpose |
| --- | --- |
| `ARC_VERSION` | Version embedded into binaries and generated package manifests |
| `ARC_CHANNEL` | npm dist-tag/channel, for example `latest` |
| `ARC_BUMP` | Optional version bump mode used by scripts |
| `ARC_RELEASE` | Enables release-mode behavior in build scripts |
| `ARC_BIN_PATH` | Override native binary path for the JS wrapper |
| `ARC_HOME` | Override config/data/cache/state root directory |

## Runtime Configuration

Apex Arc uses JSON/JSONC config files.

| File | Project-level | Global |
| --- | --- | --- |
| Main config | `.apex-arc/config.jsonc` | `~/.config/apex-arc/config.json` |
| TUI config | `.apex-arc/tui.json` | `~/.config/apex-arc/tui.json` |
| Auth credentials | - | `~/.local/share/apex-arc/auth.json` |

On Windows, XDG-style paths are resolved under `%LOCALAPPDATA%\apex-arc\` unless `ARC_HOME` is set.

## Core Features

- Multiple agents: build, plan, and compose
- Persistent project memory backed by SQLite FTS5
- Automatic checkpoints and context reconstruction
- Task tracking with nested task IDs
- Subagent orchestration
- MCP, LSP, plugins, and custom providers
- `/goal`, `/dream`, and `/distill` workflows

## Relationship to OpenCode

Apex Arc is built as a fork of [OpenCode](https://github.com/anomalyco/opencode). It keeps the terminal UI, provider, MCP, LSP, and plugin foundation while adding Arc-specific memory, orchestration, and self-improvement workflows.

## License

Source code is licensed under the [MIT License](./LICENSE).

Use of Apex Arc is also subject to the [Use Restrictions](./USE_RESTRICTIONS.md).
