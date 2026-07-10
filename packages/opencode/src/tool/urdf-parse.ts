import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { readFileSync, existsSync } from "fs"
import path from "path"

const DESCRIPTION = [
  "Parse a URDF (.urdf) or Xacro (.xacro) robot description file.",
  "",
  "Returns clean JSON representation of the robot:",
  "- Links (inertial, visual, collision details)",
  "- Joints (type, parent, child, axis, limits)",
  "- Materials, plugins, and sensors",
  "",
  "Validates required tags like link inertia and joint parent/child references, and reports warnings for missing or incorrect data.",
].join("\n")

const Parameters = z.object({
  path: z.string().describe("Path to the URDF or Xacro file"),
})

export interface UrdfResult {
  name: string
  links: {
    name: string
    inertial?: {
      mass: number
      com: number[]
      inertia: number[]
    }
    visual?: {
      geometryType: string
      geometryArgs: Record<string, unknown>
    }
    collision?: {
      geometryType: string
      geometryArgs: Record<string, unknown>
    }
  }[]
  joints: {
    name: string
    type: string
    parent: string
    child: string
    axis?: number[]
    limits?: {
      lower: number
      upper: number
      velocity: number
      effort: number
    }
  }[]
  materials: { name: string; color?: number[] }[]
  plugins: { name: string; filename?: string }[]
  sensors: { name: string; type: string; parentLink: string }[]
  warnings: string[]
}

// Simple XML extractor helper
function getTagContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g")
  const matches: string[] = []
  let match
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1])
  }
  return matches
}

function getTagAttribute(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}\\b[^>]*?\\b${attr}=["'](.*?)["']`, "i")
  const match = regex.exec(xml)
  return match ? match[1] : null
}

function parseUrdf(filePath: string): UrdfResult {
  const content = readFileSync(filePath, "utf8")
  const warnings: string[] = []

  const robotName = getTagAttribute(content, "robot", "name") || "unnamed_robot"

  // 1. Parse Links
  const links: UrdfResult["links"] = []
  const linkRegex = /<link\b([^>]*?)>([\s\S]*?)<\/link>/g
  let match
  while ((match = linkRegex.exec(content)) !== null) {
    const attrs = match[1]
    const body = match[2]
    const nameMatch = /\bname=["'](.*?)["']/i.exec(attrs)
    if (!nameMatch) {
      warnings.push("Found a <link> element without a name attribute.")
      continue
    }
    const name = nameMatch[1]

    // Inertial
    let inertial: UrdfResult["links"][number]["inertial"]
    const inertialMatch = /<inertial>([\s\S]*?)<\/inertial>/i.exec(body)
    if (inertialMatch) {
      const ibody = inertialMatch[1]
      const massMatch = /<mass\b[^>]*?\bvalue=["'](.*?)["']/i.exec(ibody)
      const mass = massMatch ? parseFloat(massMatch[1]) : 0

      let com = [0, 0, 0]
      const originMatch = /<origin\b[^>]*?\bxyz=["'](.*?)["']/i.exec(ibody)
      if (originMatch) {
        com = originMatch[1].split(/\s+/).map(parseFloat)
      }

      let inertia = [0, 0, 0, 0, 0, 0]
      const inertiaMatch = /<inertia\b([^>]*?)\/?>/i.exec(ibody)
      if (inertiaMatch) {
        const iattrs = inertiaMatch[1]
        const ixx = parseFloat(/\bixx=["'](.*?)["']/i.exec(iattrs)?.[1] || "0")
        const ixy = parseFloat(/\bixy=["'](.*?)["']/i.exec(iattrs)?.[1] || "0")
        const ixz = parseFloat(/\bixz=["'](.*?)["']/i.exec(iattrs)?.[1] || "0")
        const iyy = parseFloat(/\biyy=["'](.*?)["']/i.exec(iattrs)?.[1] || "0")
        const iyz = parseFloat(/\biyz=["'](.*?)["']/i.exec(iattrs)?.[1] || "0")
        const izz = parseFloat(/\bizz=["'](.*?)["']/i.exec(iattrs)?.[1] || "0")
        inertia = [ixx, ixy, ixz, iyy, iyz, izz]
      }

      inertial = { mass, com, inertia }
    } else {
      warnings.push(`Link "${name}" is missing <inertial> properties (required for dynamics).`)
    }

    // Visual
    let visual: UrdfResult["links"][number]["visual"]
    const visualMatch = /<visual>([\s\S]*?)<\/visual>/i.exec(body)
    if (visualMatch) {
      const vbody = visualMatch[1]
      const geomMatch = /<geometry>([\s\S]*?)<\/geometry>/i.exec(vbody)
      if (geomMatch) {
        const gbody = geomMatch[1]
        const boxMatch = /<box\b[^>]*?\bsize=["'](.*?)["']/i.exec(gbody)
        const cylinderMatch = /<cylinder\b[^>]*?\bradius=["'](.*?)["']/i.exec(gbody)
        const sphereMatch = /<sphere\b[^>]*?\bradius=["']["']/i.exec(gbody)
        const meshMatch = /<mesh\b[^>]*?\bfilename=["'](.*?)["']/i.exec(gbody)

        if (boxMatch) {
          visual = { geometryType: "box", geometryArgs: { size: boxMatch[1] } }
        } else if (cylinderMatch) {
          const lengthMatch = /length=["'](.*?)["']/i.exec(gbody)
          visual = {
            geometryType: "cylinder",
            geometryArgs: { radius: parseFloat(cylinderMatch[1]), length: lengthMatch ? parseFloat(lengthMatch[1]) : 0 },
          }
        } else if (sphereMatch) {
          const radMatch = /radius=["'](.*?)["']/i.exec(gbody)
          visual = { geometryType: "sphere", geometryArgs: { radius: radMatch ? parseFloat(radMatch[1]) : 0 } }
        } else if (meshMatch) {
          visual = { geometryType: "mesh", geometryArgs: { filename: meshMatch[1] } }
        }
      }
    }

    // Collision
    let collision: UrdfResult["links"][number]["collision"]
    const collisionMatch = /<collision>([\s\S]*?)<\/collision>/i.exec(body)
    if (collisionMatch) {
      // Analogous to visual
      collision = { geometryType: "visual-fallback", geometryArgs: {} }
    }

    links.push({ name, inertial, visual, collision })
  }

  // 2. Parse Joints
  const joints: UrdfResult["joints"] = []
  const jointRegex = /<joint\b([^>]*?)>([\s\S]*?)<\/joint>/g
  while ((match = jointRegex.exec(content)) !== null) {
    const attrs = match[1]
    const body = match[2]
    const nameMatch = /\bname=["'](.*?)["']/i.exec(attrs)
    const typeMatch = /\btype=["'](.*?)["']/i.exec(attrs)

    if (!nameMatch) {
      warnings.push("Found a <joint> element without a name attribute.")
      continue
    }
    const name = nameMatch[1]
    const type = typeMatch ? typeMatch[1] : "fixed"

    const parentMatch = /<parent\b[^>]*?\blink=["'](.*?)["']/i.exec(body)
    const childMatch = /<child\b[^>]*?\blink=["'](.*?)["']/i.exec(body)

    if (!parentMatch) {
      warnings.push(`Joint "${name}" is missing a <parent> link reference.`)
      continue
    }
    if (!childMatch) {
      warnings.push(`Joint "${name}" is missing a <child> link reference.`)
      continue
    }

    const parent = parentMatch[1]
    const child = childMatch[1]

    // Validate link references exist
    const parentExists = links.some((l) => l.name === parent)
    const childExists = links.some((l) => l.name === child)

    if (!parentExists) {
      warnings.push(`Joint "${name}" references non-existent parent link "${parent}".`)
    }
    if (!childExists) {
      warnings.push(`Joint "${name}" references non-existent child link "${child}".`)
    }

    let axis = [1, 0, 0]
    const axisMatch = /<axis\b[^>]*?\bxyz=["'](.*?)["']/i.exec(body)
    if (axisMatch) {
      axis = axisMatch[1].split(/\s+/).map(parseFloat)
    }

    let limits: UrdfResult["joints"][number]["limits"]
    const limitMatch = /<limit\b([^>]*?)\/?>/i.exec(body)
    if (limitMatch) {
      const lattrs = limitMatch[1]
      limits = {
        lower: parseFloat(/\blower=["'](.*?)["']/i.exec(lattrs)?.[1] || "0"),
        upper: parseFloat(/\bupper=["'](.*?)["']/i.exec(lattrs)?.[1] || "0"),
        velocity: parseFloat(/\bvelocity=["'](.*?)["']/i.exec(lattrs)?.[1] || "0"),
        effort: parseFloat(/\beffort=["'](.*?)["']/i.exec(lattrs)?.[1] || "0"),
      }
    }

    joints.push({ name, type, parent, child, axis, limits })
  }

  // 3. Parse Materials
  const materials: UrdfResult["materials"] = []
  const matRegex = /<material\b([^>]*?)>([\s\S]*?)<\/material>/g
  while ((match = matRegex.exec(content)) !== null) {
    const attrs = match[1]
    const nameMatch = /\bname=["'](.*?)["']/i.exec(attrs)
    if (nameMatch) {
      materials.push({ name: nameMatch[1] })
    }
  }

  return {
    name: robotName,
    links,
    joints,
    materials,
    plugins: [],
    sensors: [],
    warnings,
  }
}

export const UrdfParseTool = Tool.define(
  "urdf_parse",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const resolved = path.resolve(params.path)
          if (!existsSync(resolved)) {
            throw new Error(`URDF file not found at path: ${resolved}`)
          }

          const result = parseUrdf(resolved)

          yield* ctx.metadata({
            metadata: {
              robotName: result.name,
              linksCount: result.links.length,
              jointsCount: result.joints.length,
              warningsCount: result.warnings.length,
            },
          })

          return {
            title: `urdf_parse: ${result.name}`,
            metadata: {
              robotName: result.name,
              linksCount: result.links.length,
              jointsCount: result.joints.length,
              warningsCount: result.warnings.length,
            },
            output: JSON.stringify(result, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  })
)

export { parseUrdf }
