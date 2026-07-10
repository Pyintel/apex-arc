import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "@/config"
import { Provider } from "@/provider"
import { ModelsDev } from "@/provider"
import { ProviderAuth } from "@/provider"
import { Auth } from "@/auth"
import { ProviderID } from "@/provider/schema"
import { mapValues } from "remeda"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { Effect } from "effect"
import { jsonRequest } from "./trace"

export const ProviderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List providers",
        description: "Get a list of all available AI providers, including both available and connected ones.",
        operationId: "provider.list",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(Provider.ListResult.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ProviderRoutes.list", c, function* () {
          const svc = yield* Provider.Service
          const cfg = yield* Config.Service
          const config = yield* cfg.get()
          const all = yield* Effect.promise(() => ModelsDev.get())
          const disabled = new Set(config.disabled_providers ?? [])
          const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined
          const filtered: Record<string, (typeof all)[string]> = {}
          for (const [key, value] of Object.entries(all)) {
            if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
              filtered[key] = value
            }
          }
          const connected = yield* svc.list()
          const providers = Object.assign(
            mapValues(filtered, (x) => Provider.fromModelsDevProvider(x)),
            connected,
          )
          return {
            all: Object.values(providers),
            default: Provider.defaultModelIDs(providers),
            connected: Object.keys(connected),
          }
        }),
    )
    .get(
      "/auth",
      describeRoute({
        summary: "Get provider auth methods",
        description: "Retrieve available authentication methods for all AI providers.",
        operationId: "provider.auth",
        responses: {
          200: {
            description: "Provider auth methods",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Methods.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ProviderRoutes.auth", c, function* () {
          const svc = yield* ProviderAuth.Service
          return yield* svc.methods()
        }),
    )
    .post(
      "/:providerID/models/refresh",
      describeRoute({
        summary: "Refresh provider models",
        description: "Fetch and update the list of models for a specific provider by querying its upstream API.",
        operationId: "provider.models.refresh",
        responses: {
          200: {
            description: "Number of models refreshed",
            content: {
              "application/json": {
                schema: resolver(z.object({
                  refreshed: z.boolean(),
                  count: z.number(),
                })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      async (c) =>
        jsonRequest("ProviderRoutes.models.refresh", c, function* () {
          const providerID = c.req.valid("param").providerID
          const svc = yield* Provider.Service
          const configSvc = yield* Config.Service
          const auth = yield* Auth.Service

          const connected = yield* svc.list()
          const provider = connected[providerID]

          if (!provider || !provider.api) {
            return { refreshed: false, count: 0 }
          }

          const baseURL = provider.api
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          }

          // Fetch credentials securely using the backend auth service
          const authInfo = yield* Effect.catchAll(auth.get(providerID), () => Effect.succeed(undefined))
          if (authInfo && authInfo.type === "api" && authInfo.key) {
            headers["Authorization"] = `Bearer ${authInfo.key}`
          }

          let modelsUrl = `${baseURL.replace(/\/+$/, "")}/models`
          let res = yield* Effect.tryPromise(() => fetch(modelsUrl, { headers }))

          if (!res.ok && !baseURL.endsWith("/v1")) {
            modelsUrl = `${baseURL.replace(/\/+$/, "")}/v1/models`
            res = yield* Effect.tryPromise(() => fetch(modelsUrl, { headers }))
          }

          if (!res.ok) {
            return { refreshed: false, count: 0 }
          }

          const data = yield* Effect.tryPromise(() => res.json())
          if (!data || !Array.isArray(data.data) || data.data.length === 0) {
            return { refreshed: false, count: 0 }
          }

          const fetchedModels: Record<string, { name: string }> = {}
          for (const model of data.data) {
            fetchedModels[model.id] = { name: model.name || model.id }
          }

          const patch = {
            provider: {
              [providerID]: {
                models: fetchedModels,
              },
            },
          }

          yield* configSvc.update(patch as any)
          
          return { refreshed: true, count: data.data.length }
        }),
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        summary: "OAuth authorize",
        description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
        operationId: "provider.oauth.authorize",
        responses: {
          200: {
            description: "Authorization URL and method",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Authorization.zod.optional()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator("json", ProviderAuth.AuthorizeInput.zod),
      async (c) =>
        jsonRequest("ProviderRoutes.oauth.authorize", c, function* () {
          const providerID = c.req.valid("param").providerID
          const { method, inputs } = c.req.valid("json")
          const svc = yield* ProviderAuth.Service
          return yield* svc.authorize({
            providerID,
            method,
            inputs,
          })
        }),
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        summary: "OAuth callback",
        description: "Handle the OAuth callback from a provider after user authorization.",
        operationId: "provider.oauth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator("json", ProviderAuth.CallbackInput.zod),
      async (c) =>
        jsonRequest("ProviderRoutes.oauth.callback", c, function* () {
          const providerID = c.req.valid("param").providerID
          const { method, code } = c.req.valid("json")
          const svc = yield* ProviderAuth.Service
          yield* svc.callback({
            providerID,
            method,
            code,
          })
          return true
        }),
    ),
)
