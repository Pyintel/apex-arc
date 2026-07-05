import { Auth } from "../../auth"
import { AppRuntime } from "../../effect/app-runtime"
import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { ModelsDev } from "../../provider"
import { map, pipe, sortBy, values } from "remeda"
import path from "path"
import fs from "fs"
import { pathToFileURL } from "url"
import os from "os"
import { Config } from "../../config"
import { Global } from "../../global"
import { Plugin } from "../../plugin"
import { t } from "../i18n"
import { Instance } from "../../project/instance"
import type { Hooks } from "@mimo-ai/plugin"
import { Process } from "../../util"
import { PROVIDER_PRIORITY } from "../../util/provider-priority"
import { text } from "node:stream/consumers"
import { Effect } from "effect"
import * as readline from "readline"

type PluginAuth = NonNullable<Hooks["auth"]>

const put = (key: string, info: Auth.Info) =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set(key, info)
    }),
  )

async function handlePluginAuth(plugin: { auth: PluginAuth }, provider: string, methodName?: string): Promise<boolean> {
  let index = 0
  if (methodName) {
    const match = plugin.auth.methods.findIndex((x) => x.label.toLowerCase() === methodName.toLowerCase())
    if (match === -1) {
      prompts.log.error(
        `Unknown method "${methodName}" for ${provider}. Available: ${plugin.auth.methods.map((x) => x.label).join(", ")}`,
      )
      process.exit(1)
    }
    index = match
  } else if (plugin.auth.methods.length > 1) {
    const method = await prompts.select({
      message: "Login method",
      options: plugin.auth.methods.map((x, index) => ({
        label: x.label,
        value: index.toString(),
      })),
    })
    if (prompts.isCancel(method)) throw new UI.CancelledError()
    index = parseInt(method)
  }
  const method = plugin.auth.methods[index]

  await new Promise((r) => setTimeout(r, 10))
  const inputs: Record<string, string> = {}
  if (method.prompts) {
    for (const prompt of method.prompts) {
      if (prompt.when) {
        const value = inputs[prompt.when.key]
        if (value === undefined) continue
        const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
        if (!matches) continue
      }
      if (prompt.condition && !prompt.condition(inputs)) continue
      if (prompt.type === "select") {
        const value = await prompts.select({
          message: prompt.message,
          options: prompt.options,
        })
        if (prompts.isCancel(value)) throw new UI.CancelledError()
        inputs[prompt.key] = value
      } else {
        const value = await prompts.text({
          message: prompt.message,
          placeholder: prompt.placeholder,
          validate: prompt.validate ? (v) => prompt.validate!(v ?? "") : undefined,
        })
        if (prompts.isCancel(value)) throw new UI.CancelledError()
        inputs[prompt.key] = value
      }
    }
  }

  if (method.type === "oauth") {
    const authorize = await method.authorize(inputs)

    if (authorize.url) {
      prompts.log.info("Go to: " + authorize.url)
    }

    if (authorize.method === "auto") {
      if (authorize.instructions) {
        prompts.log.info(authorize.instructions)
      }
      const spinner = prompts.spinner()
      spinner.start("Waiting for authorization...")
      const result = await authorize.callback()
      if (result.type === "failed") {
        spinner.stop("Failed to authorize", 1)
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        if ("refresh" in result) {
          const { type: _, provider: __, refresh, access, expires, metadata: _m, ...extraFields } = result
          await put(saveProvider, {
            type: "oauth",
            refresh,
            access,
            expires,
            ...extraFields,
          })
        }
        if ("key" in result) {
          await put(saveProvider, {
            type: "api",
            key: result.key,
            ...(result.metadata ? { metadata: result.metadata } : {}),
          })
        }
        spinner.stop("Login successful")
      }
    }

    if (authorize.method === "code") {
      const code = await prompts.text({
        message: "Paste the authorization code here: ",
        validate: (x) => (x && x.length > 0 ? undefined : "Required"),
      })
      if (prompts.isCancel(code)) throw new UI.CancelledError()
      const result = await authorize.callback(code)
      if (result.type === "failed") {
        prompts.log.error("Failed to authorize")
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        if ("refresh" in result) {
          const { type: _, provider: __, refresh, access, expires, metadata: _m, ...extraFields } = result
          await put(saveProvider, {
            type: "oauth",
            refresh,
            access,
            expires,
            ...extraFields,
          })
        }
        if ("key" in result) {
          await put(saveProvider, {
            type: "api",
            key: result.key,
            ...(result.metadata ? { metadata: result.metadata } : {}),
          })
        }
        prompts.log.success("Login successful")
      }
    }

    prompts.outro("Done")
    return true
  }

  if (method.type === "api") {
    if (method.authorize) {
      const key = await prompts.password({
        message: "Enter your API key",
        validate: (x) => (x && x.length > 0 ? undefined : "Required"),
      })
      if (prompts.isCancel(key)) throw new UI.CancelledError()

      const result = await method.authorize(inputs)
      if (result.type === "failed") {
        prompts.log.error("Failed to authorize")
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        await put(saveProvider, {
          type: "api",
          key: result.key ?? key,
        })
        prompts.log.success("Login successful")
      }
      prompts.outro("Done")
      return true
    }
  }

  return false
}

export function resolvePluginProviders(input: {
  hooks: Hooks[]
  existingProviders: Record<string, unknown>
  disabled: Set<string>
  enabled?: Set<string>
  providerNames: Record<string, string | undefined>
}): Array<{ id: string; name: string }> {
  const seen = new Set<string>()
  const result: Array<{ id: string; name: string }> = []

  for (const hook of input.hooks) {
    if (!hook.auth) continue
    const id = hook.auth.provider
    if (seen.has(id)) continue
    seen.add(id)
    if (Object.hasOwn(input.existingProviders, id)) continue
    if (input.disabled.has(id)) continue
    if (input.enabled && !input.enabled.has(id)) continue
    result.push({
      id,
      name: input.providerNames[id] ?? id,
    })
  }

  return result
}

// Optional login extension contributed by a local module under src/ext/. The
// module declares which provider id/aliases it handles, how it appears in the
// interactive menu, and the handler to run. Resolves to undefined when no such
// module is present.
type LoginExtension = {
  id: string
  aliases?: string[]
  menu?: { label: string; hint?: string }
  run: () => Promise<void>
}

function toLoginExtension(mod: Record<string, unknown> | undefined): LoginExtension | undefined {
  const value = mod?.loginExtension
  if (!value || typeof value !== "object") return undefined
  const ext = value as Partial<LoginExtension>
  if (typeof ext.id !== "string" || typeof ext.run !== "function") return undefined
  return ext as LoginExtension
}

// Resolve the optional login extension. Prefers the generated src/ext/_manifest.ts
// (a fixed import specifier resolves inside Bun single-file executables, where
// filesystem scans do not); falls back to a directory scan for unbundled runs.
async function loadLoginExtension(): Promise<LoginExtension | undefined> {
  try {
    // @ts-ignore generated manifest; may not exist at type-check time
    const manifest = (await import("../../ext/_manifest")) as { modules?: Record<string, Record<string, unknown>> }
    for (const mod of Object.values(manifest.modules ?? {})) {
      const ext = toLoginExtension(mod)
      if (ext) return ext
    }
  } catch {}
  const extDir = path.join(import.meta.dir, "..", "..", "ext")
  if (!fs.existsSync(extDir)) return undefined
  for (const entry of fs.readdirSync(extDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))) {
    try {
      const ext = toLoginExtension(await import(/* @vite-ignore */ pathToFileURL(path.join(extDir, entry)).href))
      if (ext) return ext
    } catch {}
  }
  return undefined
}

async function mimoLogin() {
  const hooks = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const plugin = yield* Plugin.Service
      return yield* plugin.list()
    }),
  )
  const mimoHook = hooks.findLast((h) => h.auth?.provider === "xiaomi")
  if (!mimoHook?.auth) {
    prompts.log.error("MiMo auth plugin not found")
    return
  }

  const method = mimoHook.auth.methods[0]
  if (method.type !== "oauth") return

  const authorize = await method.authorize()
  if (authorize.method !== "auto") return

  prompts.log.info(`Browser didn't open? Use the url below to sign in:\n${authorize.url}`)

  const browserPromise = authorize.callback().catch(() => ({ type: "failed" as const }))

  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raceResult = await raceCallbackAndStdin(browserPromise)

    if (raceResult.source === "browser") {
      if (raceResult.data.type === "success" && "key" in raceResult.data) {
        await put("xiaomi", {
          type: "api",
          key: raceResult.data.key,
          ...(raceResult.data.metadata ? { metadata: raceResult.data.metadata } : {}),
        })
        prompts.log.success("Login successful")
        prompts.outro("Done")
        return
      }
      prompts.log.error("Login failed")
      prompts.outro("Done")
      return
    }

    const callbackResult = await authorize.callback(raceResult.input)
    if (callbackResult.type === "success" && "key" in callbackResult) {
      await put("xiaomi", {
        type: "api",
        key: callbackResult.key,
        ...(callbackResult.metadata ? { metadata: callbackResult.metadata } : {}),
      })
      prompts.log.success("Login successful")
      prompts.outro("Done")
      return
    }

    const remaining = MAX_RETRIES - attempt - 1
    if (remaining > 0) {
      prompts.log.error(t("cli.providers.mimo_login.decrypt_retry", { remaining }))
    } else {
      prompts.log.error(t("cli.providers.mimo_login.decrypt_exhausted"))
    }
  }
}

function raceCallbackAndStdin<T>(
  browserPromise: Promise<T>,
): Promise<{ source: "browser"; data: T } | { source: "paste"; input: string }> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

    let settled = false
    const cleanup = () => {
      if (settled) return
      settled = true
      rl.close()
    }

    browserPromise.then((data) => {
      if (settled) return
      cleanup()
      process.stdout.write("\n")
      resolve({ source: "browser", data })
    })

    rl.question("Paste code here if prompted > ", (answer) => {
      if (settled) return
      const trimmed = answer.trim()
      if (trimmed.length > 0) {
        cleanup()
        resolve({ source: "paste", input: trimmed })
      }
    })
  })
}

export const ProvidersCommand = cmd({
  command: "providers",
  aliases: ["auth"],
  describe: "manage AI providers and credentials",
  builder: (yargs) =>
    yargs
      .command(ProvidersListCommand)
      .command(ProvidersLoginCommand)
      .command(ProvidersLogoutCommand)
      .command(ProvidersWhoamiCommand)
      .demandCommand(),
  async handler() {},
})

export const ProvidersListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "list providers and credentials",
  async handler(_args) {
    UI.empty()
    const authPath = path.join(Global.Path.data, "auth.json")
    const homedir = os.homedir()
    const displayPath = authPath.startsWith(homedir) ? authPath.replace(homedir, "~") : authPath
    prompts.intro(`Credentials ${UI.Style.TEXT_DIM}${displayPath}`)
    const results = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        return Object.entries(yield* auth.all())
      }),
    )
    const database = await ModelsDev.get()

    for (const [providerID, result] of results) {
      const name = database[providerID]?.name || providerID
      prompts.log.info(`${name} ${UI.Style.TEXT_DIM}${result.type}`)
    }

    prompts.outro(`${results.length} credentials`)

    const activeEnvVars: Array<{ provider: string; envVar: string }> = []

    for (const [providerID, provider] of Object.entries(database)) {
      for (const envVar of provider.env) {
        if (process.env[envVar]) {
          activeEnvVars.push({
            provider: provider.name || providerID,
            envVar,
          })
        }
      }
    }

    if (activeEnvVars.length > 0) {
      UI.empty()
      prompts.intro("Environment")

      for (const { provider, envVar } of activeEnvVars) {
        prompts.log.info(`${provider} ${UI.Style.TEXT_DIM}${envVar}`)
      }

      prompts.outro(`${activeEnvVars.length} environment variable` + (activeEnvVars.length === 1 ? "" : "s"))
    }
  },
})

export const ProvidersLoginCommand = cmd({
  command: "login [url]",
  describe: "log in to a provider",
  builder: (yargs) =>
    yargs
      .positional("url", {
        describe: "mimocode auth provider",
        type: "string",
      })
      .option("provider", {
        alias: ["p"],
        describe: "provider id or name to log in to (skips provider selection)",
        type: "string",
      })
      .option("method", {
        alias: ["m"],
        describe: "login method label (skips method selection)",
        type: "string",
      }),
  async handler(args) {
          prompts.log.error("Remote provider logins are disabled in the Helix-only build")
    prompts.outro("Done")
  },
})

export const ProvidersLogoutCommand = cmd({
  command: "logout",
  describe: "log out from a configured provider",
  async handler(_args) {
    UI.empty()
    const credentials: Array<[string, Auth.Info]> = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        return Object.entries(yield* auth.all())
      }),
    )
    prompts.intro("Remove credential")
    if (credentials.length === 0) {
      prompts.log.error("No credentials found")
      return
    }
    const database = await ModelsDev.get()
    const selected = await prompts.select({
      message: "Select provider",
      options: credentials.map(([key, value]) => ({
        label: (database[key]?.name || key) + UI.Style.TEXT_DIM + " (" + value.type + ")",
        value: key,
      })),
    })
    if (prompts.isCancel(selected)) throw new UI.CancelledError()
    const providerID = selected as string
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        yield* auth.remove(providerID)
      }),
    )
    prompts.outro("Logout successful")
  },
})

export const ProvidersWhoamiCommand = cmd({
  command: "whoami",
  describe: "show current logged-in user info",
  async handler(_args) {
    UI.empty()
    prompts.intro("Current user")
    const info = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        return yield* auth.get("xiaomi")
      }),
    )
    if (!info) {
      prompts.log.error("Not logged in. Run `mimo auth login` to log in.")
      return
    }
    if (info.type === "api" && info.metadata) {
      prompts.log.info(`Provider: MiMo`)
      prompts.log.info(`User ID: ${info.metadata.uid ?? "unknown"}`)
    } else {
      prompts.log.info(`Provider: MiMo`)
      prompts.log.info(`Type: ${info.type}`)
    }
    prompts.outro("")
  },
})
