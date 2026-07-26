# Apex Arc

<p align="center"><strong>Apex Arc: Where Models and Agents Co-Evolve</strong></p>

<p align="center">
  <a href="https://github.com/anomalyco/opencode">GitHub</a>
</p>

---

Apex Arc is a terminal-native AI coding assistant. It can read and write code, run commands, manage Git, and use a persistent memory system to keep a deep understanding of your project across sessions while continuously improving itself.

---

## Quick Start

For full Windows, macOS, and Linux setup instructions, see the
[Apex Arc Installation Guide](https://github.com/Pyintel/apex-arc/blob/master/docs/installation.md).

```bash
# Install via npm
npm install -g @pyintel/arc

# Run
apex-arc
```

The global install links both commands:

```bash
apex-arc
arc
```

If you install without `-g`, npm installs Apex Arc into the current directory's
`node_modules` and does not add the commands to your shell PATH. Run a local
install with:

```bash
npx apex-arc
```

Older published versions may show an npm `approve-scripts` warning for the
package postinstall script. Current releases do not require that script; if you
see the warning on an older version, reinstall the latest global package:

```bash
npm install -g @pyintel/arc@latest
```

Verify the install:

```bash
arc --version
arc --help
```

The first launch guides you through configuration automatically. Supported options:
- **Import from Claude Code** — migrate existing authentication in one step
- **Custom Provider** — add any OpenAI-compatible API in the TUI

---

## Core Features

- **Multiple Agents** — build (default), plan (read-only analysis), compose (specs-driven orchestration); press `Tab` to switch
- **Persistent Memory** — cross-session project knowledge, checkpoints, and task progress powered by SQLite FTS5
- **Intelligent Context Management** — automatic checkpoints, context reconstruction, and budgeted injection to stay within model limits
- **Task Tracking** — tree-shaped task system integrated with the checkpoint system
- **Subagent System** — parallel subagents with lifecycle tracking, cancellation, and background execution
- **Goal / Stop Condition** — judge model prevents premature stops during autonomous work
- **Compose Mode** — structured workflow for specs-driven development with built-in skills
- **Dream & Distill** — extract knowledge into memory (`/dream`) and discover reusable workflows (`/distill`)

For detailed documentation, configuration options, and troubleshooting, see the [GitHub repository](https://github.com/anomalyco/opencode).

---

## License

Source code is licensed under the [MIT License](https://github.com/anomalyco/opencode/blob/main/LICENSE).

Use of Apex Arc is also subject to the [Use Restrictions](https://github.com/anomalyco/opencode/blob/main/USE_RESTRICTIONS.md).
