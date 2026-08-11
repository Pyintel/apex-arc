import { defineConfig } from "electron-vite"
import appPlugin from "@pyintel/web/vite"
import * as fs from "node:fs/promises"

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const OPENCODE_SERVER_DIST = "../opencode/dist/node"

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

export default defineConfig({
  main: {
    define: {
      "import.meta.env.OPENCODE_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts" },
        external: [nodePtyPkg],
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "opencode:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "opencode:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:opencode-server") return { id: "./opencode-server.js", external: true }
        },
      },
      {
        name: "opencode:copy-server-assets",
        async buildStart() {
          await fs.mkdir("./out/main", { recursive: true })
          for (const l of await fs.readdir(OPENCODE_SERVER_DIST)) {
            const targetName = l === "node.js" ? "opencode-server.js" : l
            await fs.writeFile(`./out/main/${targetName}`, await fs.readFile(`${OPENCODE_SERVER_DIST}/${l}`))
          }
        },
        async writeBundle() {
          await fs.mkdir("./out/main", { recursive: true })
          for (const l of await fs.readdir(OPENCODE_SERVER_DIST)) {
            const targetName = l === "node.js" ? "opencode-server.js" : l
            await fs.writeFile(`./out/main/${targetName}`, await fs.readFile(`${OPENCODE_SERVER_DIST}/${l}`))
          }
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: [appPlugin],
    publicDir: "../../../web/public",
    root: "src/renderer",
    define: {
      "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(channel),
    },
    css: {
      transformer: "lightningcss",
      lightningcss: {
        drafts: {
          customMedia: true,
        },
        errorRecovery: true,
      },
    },
    build: {
      cssMinify: "lightningcss",
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
        },
      },
    },
  },
})
