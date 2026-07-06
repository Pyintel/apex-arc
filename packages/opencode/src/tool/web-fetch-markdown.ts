import z from "zod"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as Tool from "./tool"
import TurndownService from "turndown"
import { assertSafeUrl } from "@/util/ssrf"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

const DESCRIPTION = [
  "Fetch content from a web page and convert it to clean, minimal Markdown.",
  "Designed specifically to save context length and prevent LLM confusion by stripping out navigation bars, menus, sidebars, headers, footers, styles, and scripts before returning the core article/guide text.",
].join("\n")

const parameters = z.object({
  url: z.string().describe("The URL of the documentation or web page to fetch"),
  timeout: z.number().describe("Optional timeout in seconds (max 120)").optional(),
})

async function cleanHTML(html: string): Promise<string> {
  const rewriter = new HTMLRewriter()
    .on("header, footer, nav, aside, script, style, noscript, iframe, svg, form, .navbar, .navigation, .sidebar, .menu, #sidebar, #footer, #header, #nav, [class*='menu' i], [class*='sidebar' i], [class*='footer' i], [class*='nav-bar' i], [class*='navbar' i]", {
      element(element) {
        element.remove()
      }
    })
  
  const response = rewriter.transform(new Response(html))
  return await response.text()
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  // Strip head elements
  turndownService.remove(["script", "style", "meta", "link", "title"])
  return turndownService.turndown(html)
}

export const WebFetchMarkdownTool = Tool.define(
  "web_fetch_markdown",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(http)

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            throw new Error("URL must start with http:// or https://")
          }

          yield* Effect.promise(() => assertSafeUrl(params.url))

          yield* ctx.ask({
            permission: "webfetch",
            patterns: [params.url],
            always: ["*"],
            metadata: {
              url: params.url,
            },
          })

          const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT)
          const headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          }

          const request = HttpClientRequest.get(params.url).pipe(HttpClientRequest.setHeaders(headers))

          // Retry with honest UA if blocked by Cloudflare bot detection
          const response = yield* httpOk.execute(request).pipe(
            Effect.catchIf(
              (err) =>
                err.reason._tag === "StatusCodeError" &&
                err.reason.response.status === 403 &&
                err.reason.response.headers["cf-mitigated"] === "challenge",
              () =>
                httpOk.execute(
                  HttpClientRequest.get(params.url).pipe(
                    HttpClientRequest.setHeaders({ ...headers, "User-Agent": "mimocode" }),
                  ),
                ),
            ),
            Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.die(new Error("Request timed out")) }),
          )

          // Block SSRF via redirect
          const source = (response as any).source as Response | undefined
          if (source?.url && source.url !== params.url) {
            yield* Effect.promise(() => assertSafeUrl(source.url))
          }

          const arrayBuffer = yield* response.arrayBuffer
          if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
            throw new Error("Response too large (exceeds 5MB limit)")
          }

          const content = new TextDecoder().decode(arrayBuffer)
          const contentType = response.headers["content-type"] || ""

          if (contentType.includes("text/html")) {
            const cleanedHtml = yield* Effect.promise(() => cleanHTML(content))
            const markdown = convertHTMLToMarkdown(cleanedHtml)
            return {
              title: `web_fetch_markdown: ${params.url}`,
              metadata: {},
              output: markdown.trim() || "No text content found on the page.",
            }
          }

          // If not HTML, fallback to returning raw text/markdown
          return {
            title: `web_fetch_markdown: ${params.url}`,
            metadata: {},
            output: content,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
