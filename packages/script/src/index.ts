import { $ } from "bun"
import semver from "semver"
import path from "path"

let currentDir = import.meta.dir
let rootPkg: any = null
while (currentDir && currentDir !== path.dirname(currentDir)) {
  const candidate = path.join(currentDir, "package.json")
  if (Bun.file(candidate).size > 0) {
    const pkg = await Bun.file(candidate).json()
    if (pkg.packageManager) {
      rootPkg = pkg
      break
    }
  }
  currentDir = path.dirname(currentDir)
}
const expectedBunVersion = rootPkg?.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  ARC_CHANNEL: process.env["ARC_CHANNEL"],
  ARC_BUMP: process.env["ARC_BUMP"],
  ARC_VERSION: process.env["ARC_VERSION"],
  ARC_RELEASE: process.env["ARC_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.ARC_CHANNEL) return env.ARC_CHANNEL
  if (env.ARC_BUMP) return "latest"
  if (env.ARC_VERSION && !env.ARC_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim()) || "latest"
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.ARC_VERSION) return env.ARC_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const version = await Bun.file(path.resolve(import.meta.dir, "../../opencode/package.json"))
    .json()
    .then((data: any) => data.version)
  const t = env.ARC_BUMP?.toLowerCase()
  if (!t) return version
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.ARC_RELEASE
  },
}
console.log(`arc script`, JSON.stringify(Script, null, 2))
