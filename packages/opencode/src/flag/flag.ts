import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function nonNegativeNumber(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

// Backward compat: check ARC_ first, fall back to MIMOCODE_
function envWithFallback(arcKey: string, legacyKey: string) {
  return process.env[arcKey] ?? process.env[legacyKey]
}

function truthyWithFallback(arcKey: string, legacyKey: string) {
  const value = (process.env[arcKey] ?? process.env[legacyKey])?.toLowerCase()
  return value === "true" || value === "1"
}

const ARC_EXPERIMENTAL = truthyWithFallback("ARC_EXPERIMENTAL", "MIMOCODE_EXPERIMENTAL")

// Defaults to false. When enabled, arc runs in pure-arc mode:
//   — does NOT inherit Claude Code's settings (CLAUDE.md, ~/.claude/skills, etc.)
//   — does NOT pick up provider API keys from environment variables
//   — falls back to the mimo-auto model as the default
// Set ARC_MIMO_ONLY=true to disable .claude inheritance and env-based
// provider auto-detection.
const ARC_MIMO_ONLY = truthyWithFallback("ARC_MIMO_ONLY", "MIMOCODE_MIMO_ONLY")
const ARC_DISABLE_CLAUDE_CODE_ENV = truthyWithFallback("ARC_DISABLE_CLAUDE_CODE_ENV", "MIMOCODE_DISABLE_CLAUDE_CODE")
const ARC_DISABLE_CLAUDE_CODE = ARC_MIMO_ONLY || ARC_DISABLE_CLAUDE_CODE_ENV

const ARC_DISABLE_EXTERNAL_SKILLS = truthyWithFallback("ARC_DISABLE_EXTERNAL_SKILLS", "MIMOCODE_DISABLE_EXTERNAL_SKILLS")
const ARC_DISABLE_CLAUDE_CODE_SKILLS =
  ARC_DISABLE_EXTERNAL_SKILLS || ARC_DISABLE_CLAUDE_CODE || truthyWithFallback("ARC_DISABLE_CLAUDE_CODE_SKILLS", "MIMOCODE_DISABLE_CLAUDE_CODE_SKILLS")
const copy = envWithFallback("ARC_EXPERIMENTAL_DISABLE_COPY_ON_SELECT", "MIMOCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  ARC_AUTO_SHARE: truthyWithFallback("ARC_AUTO_SHARE", "MIMOCODE_AUTO_SHARE"),
  ARC_AUTO_HEAP_SNAPSHOT: truthyWithFallback("ARC_AUTO_HEAP_SNAPSHOT", "MIMOCODE_AUTO_HEAP_SNAPSHOT"),
  ARC_GIT_BASH_PATH: envWithFallback("ARC_GIT_BASH_PATH", "MIMOCODE_GIT_BASH_PATH"),
  ARC_CONFIG: envWithFallback("ARC_CONFIG", "MIMOCODE_CONFIG"),
  ARC_CONFIG_CONTENT: envWithFallback("ARC_CONFIG_CONTENT", "MIMOCODE_CONFIG_CONTENT"),

  ARC_DISABLE_AUTOUPDATE: truthyWithFallback("ARC_DISABLE_AUTOUPDATE", "MIMOCODE_DISABLE_AUTOUPDATE"),

  // Defaults to false (rotation enabled). When enabled, the active log file is
  // never archived to <name>.log.<stamp> on hitting MAX_FILE_SIZE — it grows in
  // place. Useful when an external tool tails/manages the single log file.
  ARC_DISABLE_LOG_ROTATION: truthyWithFallback("ARC_DISABLE_LOG_ROTATION", "MIMOCODE_DISABLE_LOG_ROTATION"),

  // Defaults to true (analytics enabled). Set ARC_ENABLE_ANALYSIS=false
  // to opt out of POSTing model_call/tool_call/agent_request metrics.
  ARC_ENABLE_ANALYSIS: !falsy(envWithFallback("ARC_ENABLE_ANALYSIS", "MIMOCODE_ENABLE_ANALYSIS") ?? ""),
  ARC_ALWAYS_NOTIFY_UPDATE: truthyWithFallback("ARC_ALWAYS_NOTIFY_UPDATE", "MIMOCODE_ALWAYS_NOTIFY_UPDATE"),
  ARC_DISABLE_PRUNE: truthyWithFallback("ARC_DISABLE_PRUNE", "MIMOCODE_DISABLE_PRUNE"),
  ARC_DISABLE_TERMINAL_TITLE: truthyWithFallback("ARC_DISABLE_TERMINAL_TITLE", "MIMOCODE_DISABLE_TERMINAL_TITLE"),
  ARC_SHOW_TTFD: truthyWithFallback("ARC_SHOW_TTFD", "MIMOCODE_SHOW_TTFD"),
  ARC_PERMISSION: envWithFallback("ARC_PERMISSION", "MIMOCODE_PERMISSION"),
  ARC_DISABLE_DEFAULT_PLUGINS: truthyWithFallback("ARC_DISABLE_DEFAULT_PLUGINS", "MIMOCODE_DISABLE_DEFAULT_PLUGINS"),
  ARC_DISABLE_LSP_DOWNLOAD: truthyWithFallback("ARC_DISABLE_LSP_DOWNLOAD", "MIMOCODE_DISABLE_LSP_DOWNLOAD"),
  ARC_ENABLE_EXPERIMENTAL_MODELS: truthyWithFallback("ARC_ENABLE_EXPERIMENTAL_MODELS", "MIMOCODE_ENABLE_EXPERIMENTAL_MODELS"),
  ARC_DISABLE_AUTOCOMPACT: truthyWithFallback("ARC_DISABLE_AUTOCOMPACT", "MIMOCODE_DISABLE_AUTOCOMPACT"),
  ARC_DISABLE_MODELS_FETCH: truthyWithFallback("ARC_DISABLE_MODELS_FETCH", "MIMOCODE_DISABLE_MODELS_FETCH"),
  ARC_DISABLE_MOUSE: truthyWithFallback("ARC_DISABLE_MOUSE", "MIMOCODE_DISABLE_MOUSE"),
  ARC_OUTPUT_LENGTH_CONTINUATION_LIMIT: number(envWithFallback("ARC_OUTPUT_LENGTH_CONTINUATION_LIMIT", "MIMOCODE_OUTPUT_LENGTH_CONTINUATION_LIMIT") ?? "") ?? 3,
  ARC_INVALID_OUTPUT_CONTINUATION_LIMIT: number(envWithFallback("ARC_INVALID_OUTPUT_CONTINUATION_LIMIT", "MIMOCODE_INVALID_OUTPUT_CONTINUATION_LIMIT") ?? "") ?? 2,
  ARC_TEXT_TOOL_CALL_RETRY_LIMIT: number(envWithFallback("ARC_TEXT_TOOL_CALL_RETRY_LIMIT", "MIMOCODE_TEXT_TOOL_CALL_RETRY_LIMIT") ?? "") ?? 2,

  // Consecutive-block repetition detection for streamed reasoning + text.
  // A block of at least N tokens repeating REPEAT_THRESHOLD times consecutively
  // within the last WINDOW_TOKENS tokens triggers recovery (remind → replan → terminate).
  ARC_TEXT_NGRAM_N: number(envWithFallback("ARC_TEXT_NGRAM_N", "MIMOCODE_TEXT_NGRAM_N") ?? "") ?? 4,
  ARC_TEXT_REPEAT_THRESHOLD: number(envWithFallback("ARC_TEXT_REPEAT_THRESHOLD", "MIMOCODE_TEXT_REPEAT_THRESHOLD") ?? "") ?? 20,
  ARC_TEXT_WINDOW_TOKENS: number(envWithFallback("ARC_TEXT_WINDOW_TOKENS", "MIMOCODE_TEXT_WINDOW_TOKENS") ?? "") ?? 500,

  // Caps applied to image attachments before a prompt is sent. Both default to
  // undefined (no limit). ARC_MAX_PROMPT_IMAGES bounds how many images may
  // be sent per request (oldest excess images are dropped); ARC_MAX_PROMPT_IMAGE_SIZE
  // bounds the decoded byte size of a single image. Values must be positive integers.
  ARC_MAX_PROMPT_IMAGES: number(envWithFallback("ARC_MAX_PROMPT_IMAGES", "MIMOCODE_MAX_PROMPT_IMAGES") ?? ""),
  ARC_MAX_PROMPT_IMAGE_SIZE: number(envWithFallback("ARC_MAX_PROMPT_IMAGE_SIZE", "MIMOCODE_MAX_PROMPT_IMAGE_SIZE") ?? ""),
  ARC_MIMO_ONLY,
  ARC_DISABLE_PROVIDER_ENV: ARC_MIMO_ONLY || truthyWithFallback("ARC_DISABLE_PROVIDER_ENV", "MIMOCODE_DISABLE_PROVIDER_ENV"),
  ARC_DISABLE_CLAUDE_CODE,
  get ARC_DISABLE_CLAUDE_CODE_MCP() {
    // MCP compatibility stays on in arc-only mode so users can reuse Claude Code
    // MCP servers without inheriting prompts, skills, or provider env keys.
    return ARC_DISABLE_CLAUDE_CODE_ENV || truthyWithFallback("ARC_DISABLE_CLAUDE_CODE_MCP", "MIMOCODE_DISABLE_CLAUDE_CODE_MCP")
  },
  ARC_DISABLE_CLAUDE_CODE_PROMPT: ARC_DISABLE_CLAUDE_CODE || truthyWithFallback("ARC_DISABLE_CLAUDE_CODE_PROMPT", "MIMOCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  // Defaults to false (enabled): markdown commands under ~/.claude/commands and
  // {project}/.claude/commands load as slash commands. Independent of the
  // arc-only master switch. Set ARC_DISABLE_CLAUDE_CODE_COMMANDS=true to disable.
  ARC_DISABLE_CLAUDE_CODE_COMMANDS: truthyWithFallback("ARC_DISABLE_CLAUDE_CODE_COMMANDS", "MIMOCODE_DISABLE_CLAUDE_CODE_COMMANDS"),
  ARC_DISABLE_CLAUDE_CODE_SKILLS,
  ARC_DISABLE_EXTERNAL_SKILLS,
  ARC_DISABLE_CODEX_SKILLS: ARC_DISABLE_EXTERNAL_SKILLS || truthyWithFallback("ARC_DISABLE_CODEX_SKILLS", "MIMOCODE_DISABLE_CODEX_SKILLS"),
  ARC_DISABLE_OPENCODE_SKILLS: ARC_DISABLE_EXTERNAL_SKILLS || truthyWithFallback("ARC_DISABLE_OPENCODE_SKILLS", "MIMOCODE_DISABLE_OPENCODE_SKILLS"),

  // Defaults to false. When enabled, skill-source commands appear in the `/`
  // autocomplete dropdown alongside user commands and MCP prompts (Claude
  // Code-style). By default skills are only surfaced via the `/skills` picker
  // and model-driven invocation, keeping the `/` list focused on user-authored
  // commands.
  ARC_ENABLE_SLASH_SKILLS: truthyWithFallback("ARC_ENABLE_SLASH_SKILLS", "MIMOCODE_ENABLE_SLASH_SKILLS"),
  ARC_FAKE_VCS: envWithFallback("ARC_FAKE_VCS", "MIMOCODE_FAKE_VCS"),

  // When enabled, skips all git subprocess calls during project discovery
  // (which git, rev-parse --git-common-dir, rev-parse --show-toplevel) and
  // branch detection. The project is treated as a non-git directory rooted at
  // the working directory. Use to avoid touching git in restricted/sandboxed
  // environments or where git startup probing is undesirable.
  ARC_DISABLE_GIT: truthyWithFallback("ARC_DISABLE_GIT", "MIMOCODE_DISABLE_GIT"),
  ARC_SERVER_PASSWORD: envWithFallback("ARC_SERVER_PASSWORD", "MIMOCODE_SERVER_PASSWORD"),
  ARC_SERVER_USERNAME: envWithFallback("ARC_SERVER_USERNAME", "MIMOCODE_SERVER_USERNAME"),
  ARC_ENABLE_QUESTION_TOOL: truthyWithFallback("ARC_ENABLE_QUESTION_TOOL", "MIMOCODE_ENABLE_QUESTION_TOOL"),

  // Defaults to false. The edit tool does pure exact-string matching with
  // explicit error signals. Set ARC_ENABLE_FUZZY_EDIT=true to opt into the
  // legacy multi-stage fuzzy fallback chain (line-trimmed / block-anchor /
  // whitespace-normalized / indentation-flexible / etc.) when old_string fails
  // to match exactly.
  ARC_ENABLE_FUZZY_EDIT: truthyWithFallback("ARC_ENABLE_FUZZY_EDIT", "MIMOCODE_ENABLE_FUZZY_EDIT"),

  // Experimental
  ARC_EXPERIMENTAL,
  ARC_EXPERIMENTAL_FILEWATCHER: Config.boolean("ARC_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  ARC_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("ARC_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  ARC_EXPERIMENTAL_ICON_DISCOVERY: ARC_EXPERIMENTAL || truthyWithFallback("ARC_EXPERIMENTAL_ICON_DISCOVERY", "MIMOCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  ARC_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy(copy ?? ""),
  ARC_ENABLE_EXA: truthyWithFallback("ARC_ENABLE_EXA", "MIMOCODE_ENABLE_EXA") || ARC_EXPERIMENTAL || truthyWithFallback("ARC_EXPERIMENTAL_EXA", "MIMOCODE_EXPERIMENTAL_EXA"),
  ARC_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number(envWithFallback("ARC_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS", "MIMOCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS") ?? ""),
  // Token-efficient post-cleanse: strip ANSI / fold \r progress bars / redact
  // secrets / elide super-long lines from bash tool output before it is
  // returned to the model. Only applies when the output fits inline — if the
  // output spills to a truncation file, cleaning is skipped so the on-disk
  // archive stays raw. Off by default. Set to 1/true to opt in.
  ARC_EXPERIMENTAL_TOKEN_EFFICIENCY: truthyWithFallback("ARC_EXPERIMENTAL_TOKEN_EFFICIENCY", "MIMOCODE_EXPERIMENTAL_TOKEN_EFFICIENCY"),
  // Tunables for the token-efficient post-cleanse pipeline (see
  // src/tool/bash_token_efficient_pipeline.ts). Positive integers only;
  // unset / non-positive values fall back to the documented defaults.
  //   MAX_LINE_CHARS   threshold above which a single line is elided  (default 500)
  //   LINE_HEAD_KEEP   chars kept from the head of an elided line     (default 160)
  //   NEVER_WORSE_MARGIN  bytes the cleaned output must beat the raw  (default 0)
  ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_MAX_LINE_CHARS: number(envWithFallback("ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_MAX_LINE_CHARS", "MIMOCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_MAX_LINE_CHARS") ?? "") ?? 500,
  ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_LINE_HEAD_KEEP: number(envWithFallback("ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_LINE_HEAD_KEEP", "MIMOCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_LINE_HEAD_KEEP") ?? "") ?? 160,
  ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_NEVER_WORSE_MARGIN: number(envWithFallback("ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_NEVER_WORSE_MARGIN", "MIMOCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_NEVER_WORSE_MARGIN") ?? "") ?? 0,
  // Heuristic (shape-based) filter pipeline for bash output. Runs AFTER the
  // common pipeline, only when the common pipeline is enabled AND this flag is
  // explicitly opted in. Each shape (gitdiff / pytest / npm / make /
  // stacktrace / tsc / kubectl / json / md / gostest) recognises a command
  // pattern or body fingerprint and rewrites the body to strip predictable
  // noise. Off by default. Set to 1/true to opt in.
  ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_HEURISTIC: truthyWithFallback("ARC_EXPERIMENTAL_TOKEN_EFFICIENCY_HEURISTIC", "MIMOCODE_EXPERIMENTAL_TOKEN_EFFICIENCY_HEURISTIC"),
  ARC_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number(envWithFallback("ARC_EXPERIMENTAL_OUTPUT_TOKEN_MAX", "MIMOCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX") ?? ""),
  ARC_EXPERIMENTAL_OXFMT: ARC_EXPERIMENTAL || truthyWithFallback("ARC_EXPERIMENTAL_OXFMT", "MIMOCODE_EXPERIMENTAL_OXFMT"),
  ARC_EXPERIMENTAL_LSP_TY: truthyWithFallback("ARC_EXPERIMENTAL_LSP_TY", "MIMOCODE_EXPERIMENTAL_LSP_TY"),
  ARC_EXPERIMENTAL_LSP_TOOL: ARC_EXPERIMENTAL || truthyWithFallback("ARC_EXPERIMENTAL_LSP_TOOL", "MIMOCODE_EXPERIMENTAL_LSP_TOOL"),
  // Defaults to OFF (opt-in): the Orchestrator primary mode — a general
  // coordinator that delegates to child sessions via the `session` tool, with a
  // global singleton workspace and child permission-approval routing. Enable with
  // ARC_EXPERIMENTAL_ORCHESTRATOR=true (or the umbrella ARC_EXPERIMENTAL).
  ARC_EXPERIMENTAL_ORCHESTRATOR: ARC_EXPERIMENTAL || truthyWithFallback("ARC_EXPERIMENTAL_ORCHESTRATOR", "MIMOCODE_EXPERIMENTAL_ORCHESTRATOR"),
  // Defaults to true: dynamic workflow + built-in deep-research are on by default.
  // Set ARC_EXPERIMENTAL_WORKFLOW_TOOL=false to opt out. The env-var name is
  // kept for backwards compat (long-running experiments still pass it as `1`).
  ARC_EXPERIMENTAL_WORKFLOW_TOOL: !falsy(envWithFallback("ARC_EXPERIMENTAL_WORKFLOW_TOOL", "MIMOCODE_EXPERIMENTAL_WORKFLOW_TOOL") ?? "true"),
  // Defaults to true: cron + self-paced loop scheduling are on by default.
  // Set ARC_EXPERIMENTAL_CRON=false to opt out. Runtime kill switch is
  // ARC_DISABLE_CRON (checked live every tick).
  ARC_EXPERIMENTAL_CRON: !falsy(envWithFallback("ARC_EXPERIMENTAL_CRON", "MIMOCODE_EXPERIMENTAL_CRON") ?? "true"),
  // Keepalive contract for self-paced loops (spec [S8]). Budget = how many
  // "forget" turns the model gets before the loop is declared model_stopped;
  // delay seconds = the auto-arm horizon used for the keepalive fire. Budget
  // accepts 0 (end immediately on the first turn without a re-arm) for tests
  // and aggressive policies. Both are getters so tests can flip the env var
  // between cases without restarting the process.
  get ARC_LOOP_KEEPALIVE_BUDGET() {
    return nonNegativeNumber(envWithFallback("ARC_LOOP_KEEPALIVE_BUDGET", "MIMOCODE_LOOP_KEEPALIVE_BUDGET") ?? "") ?? 1
  },
  get ARC_LOOP_KEEPALIVE_DELAY_S() {
    return number(envWithFallback("ARC_LOOP_KEEPALIVE_DELAY_S", "MIMOCODE_LOOP_KEEPALIVE_DELAY_S") ?? "") ?? 1200
  },
  ARC_EXPERIMENTAL_MARKDOWN: !falsy(envWithFallback("ARC_EXPERIMENTAL_MARKDOWN", "MIMOCODE_EXPERIMENTAL_MARKDOWN") ?? "true"),
  ARC_MODELS_URL: envWithFallback("ARC_MODELS_URL", "MIMOCODE_MODELS_URL"),
  ARC_MODELS_PATH: envWithFallback("ARC_MODELS_PATH", "MIMOCODE_MODELS_PATH"),
  ARC_DISABLE_EMBEDDED_WEB_UI: truthyWithFallback("ARC_DISABLE_EMBEDDED_WEB_UI", "MIMOCODE_DISABLE_EMBEDDED_WEB_UI"),
  ARC_DB: envWithFallback("ARC_DB", "MIMOCODE_DB"),

  // Defaults to true — all channels share a single apex-arc.db. The per-channel
  // DB isolation (apex-arc-{channel}.db) is unnecessary for arc since we
  // don't ship multiple release channels yet. Use ARC_HOME to isolate dev
  // environments instead. Set ARC_DISABLE_CHANNEL_DB=false to restore
  // per-channel isolation.
  ARC_DISABLE_CHANNEL_DB: !falsy(envWithFallback("ARC_DISABLE_CHANNEL_DB", "MIMOCODE_DISABLE_CHANNEL_DB") ?? "true"),
  ARC_SKIP_MIGRATIONS: truthyWithFallback("ARC_SKIP_MIGRATIONS", "MIMOCODE_SKIP_MIGRATIONS"),
  ARC_STRICT_CONFIG_DEPS: truthyWithFallback("ARC_STRICT_CONFIG_DEPS", "MIMOCODE_STRICT_CONFIG_DEPS"),

  ARC_WORKSPACE_ID: envWithFallback("ARC_WORKSPACE_ID", "MIMOCODE_WORKSPACE_ID"),
  ARC_EXPERIMENTAL_HTTPAPI: truthyWithFallback("ARC_EXPERIMENTAL_HTTPAPI", "MIMOCODE_EXPERIMENTAL_HTTPAPI"),
  ARC_EXPERIMENTAL_WORKSPACES: ARC_EXPERIMENTAL || truthyWithFallback("ARC_EXPERIMENTAL_WORKSPACES", "MIMOCODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.

  // Disables compose-agent-internal skills (e.g. compose:plan, compose:review,
  // compose:tdd). These are hidden workflow-orchestration skills only visible
  // to the compose agent and are NOT part of builtin skills.
  get ARC_DISABLE_COMPOSE_SKILLS() {
    return truthyWithFallback("ARC_DISABLE_COMPOSE_SKILLS", "MIMOCODE_DISABLE_COMPOSE_SKILLS")
  },
  // Disables user-facing builtin skills shipped with the binary (e.g.
  // self-extend). Does not affect compose skills — the two sets are
  // independent and non-overlapping.
  get ARC_DISABLE_BUILTIN_SKILLS() {
    return truthyWithFallback("ARC_DISABLE_BUILTIN_SKILLS", "MIMOCODE_DISABLE_BUILTIN_SKILLS")
  },
  // Disables the built-in document-processing skills (docx, pdf, pptx, xlsx)
  // while keeping the rest of the builtin bundle available. Defaults to false
  // (all four skills are extracted and loaded). Set
  // ARC_DISABLE_DOCUMENT_SKILLS=true to skip them.
  get ARC_DISABLE_DOCUMENT_SKILLS() {
    return truthyWithFallback("ARC_DISABLE_DOCUMENT_SKILLS", "MIMOCODE_DISABLE_DOCUMENT_SKILLS")
  },
  get ARC_DISABLE_PROJECT_CONFIG() {
    return truthyWithFallback("ARC_DISABLE_PROJECT_CONFIG", "MIMOCODE_DISABLE_PROJECT_CONFIG")
  },
  get ARC_TUI_CONFIG() {
    return envWithFallback("ARC_TUI_CONFIG", "MIMOCODE_TUI_CONFIG")
  },
  get ARC_CONFIG_DIR() {
    return envWithFallback("ARC_CONFIG_DIR", "MIMOCODE_CONFIG_DIR")
  },
  get ARC_HOME() {
    return envWithFallback("ARC_HOME", "MIMOCODE_HOME")
  },
  get ARC_PURE() {
    return truthyWithFallback("ARC_PURE", "MIMOCODE_PURE")
  },
  get ARC_PLUGIN_META_FILE() {
    return envWithFallback("ARC_PLUGIN_META_FILE", "MIMOCODE_PLUGIN_META_FILE")
  },
  get ARC_CLIENT() {
    return envWithFallback("ARC_CLIENT", "MIMOCODE_CLIENT") ?? "cli"
  },
}
