#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@pyintel/script"
import { fileURLToPath } from "url"
import fs from "fs"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const registry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org"
const npmjs = registry.includes("registry.npmjs.org")

async function published(name: string, version: string) {
  try {
    const res = await $`npm view ${name}@${version} version --registry ${registry}`.text()
    return res.trim() === version
  } catch {
    return false
  }
}

async function publish(dir: string, name: string, version: string) {
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) {
    console.log(`already published ${name}@${version}`)
    return
  }
  await $`bun pm pack`.cwd(dir)
  if (npmjs) {
    await $`npm publish --access public --tag ${Script.channel} --registry ${registry}`.cwd(dir)
    return
  }
  await $`npm publish --tag ${Script.channel} --registry ${registry}`.cwd(dir)
}

const binaries: { dir: string; name: string; version: string }[] = []
for (const entry of fs.readdirSync("./dist", { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const pkgFile = Bun.file(`./dist/${entry.name}/package.json`)
    if (await pkgFile.exists()) {
      const p = await pkgFile.json()
      binaries.push({ dir: `./dist/${entry.name}`, name: p.name, version: p.version })
    }
  }
}
console.log("binaries", Object.fromEntries(binaries.map((b) => [b.name, b.version])))
const version = binaries[0]?.version || pkg.version

const tasks = binaries.map(async (b) => {
  await publish(b.dir, b.name, b.version)
})
await Promise.all(tasks)

const targetDir = `./dist/arc-wrapper`
await $`rm -rf ${targetDir}`
await $`mkdir -p ${targetDir}/bin`
await Bun.write(`${targetDir}/bin/apex-arc`, await Bun.file("./bin/apex-arc").text())
await Bun.write(`${targetDir}/bin/apex-arc.cjs`, await Bun.file("./bin/apex-arc.cjs").text())
await Bun.file(`${targetDir}/postinstall.mjs`).write(await Bun.file("./script/postinstall.mjs").text())
await Bun.file(`${targetDir}/LICENSE`).write(await Bun.file("../../LICENSE").text())
await Bun.file(`${targetDir}/README.md`).write(await Bun.file("../../README_npm.md").text())

await Bun.file(`${targetDir}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name,
      version: version,
      description: "Apex Arc",
      license: "MIT",
      author: "Apex Arc Team",
      homepage: "https://github.com/Pyintel/apex-arc",
      repository: {
        type: "git",
        url: "git+https://github.com/Pyintel/apex-arc.git",
      },
      keywords: ["ai", "coding", "agent", "cli", "arc"],
      bin: {
        arc: "./bin/apex-arc.cjs",
        "apex-arc": "./bin/apex-arc.cjs",
      },
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      optionalDependencies: Object.fromEntries(binaries.map((b) => [b.name, b.version])),
    },
    null,
    2,
  ),
)

await publish(targetDir, pkg.name, version)
