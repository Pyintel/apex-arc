import { describe, expect, test } from "bun:test"
import { writeFile } from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime, Layer } from "effect"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { UrdfParseTool } from "../../src/tool/urdf-parse"
import { SdfParseTool } from "../../src/tool/sdf-parse"
import { UrdfToMeshTool } from "../../src/tool/urdf-to-mesh"
import { MoveitPlanTool } from "../../src/tool/moveit-plan"
import { Ros2Tool } from "../../src/tool/ros2"
import { Truncate } from "../../src/tool"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import * as Tool from "../../src/tool/tool"
import { SessionID, MessageID } from "../../src/session/schema"
import { tmpdir } from "../fixture/fixture"

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    AppFileSystem.defaultLayer,
    Truncate.defaultLayer,
    Agent.defaultLayer,
  ),
)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("robotics tools", () => {
  test("urdf_parse validates valid URDF successfully", async () => {
    await using tmp = await tmpdir()

    const validUrdf = path.join(tmp.path, "valid.urdf")
    await writeFile(
      validUrdf,
      `<robot name="test_robot">\n` +
        `  <link name="base_link">\n` +
        `    <inertial>\n` +
        `      <mass value="1.0"/>\n` +
        `      <inertia ixx="0.1" ixy="0" ixz="0" iyy="0.1" iyz="0" izz="0.1"/>\n` +
        `    </inertial>\n` +
        `  </link>\n` +
        `  <link name="child_link">\n` +
        `    <inertial>\n` +
        `      <mass value="0.5"/>\n` +
        `      <inertia ixx="0.05" ixy="0" ixz="0" iyy="0.05" iyz="0" izz="0.05"/>\n` +
        `    </inertial>\n` +
        `  </link>\n` +
        `  <joint name="joint1" type="revolute">\n` +
        `    <parent link="base_link"/>\n` +
        `    <child link="child_link"/>\n` +
        `  </joint>\n` +
        `</robot>\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(UrdfParseTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ path: validUrdf }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed.name).toBe("test_robot")
    expect(parsed.links).toHaveLength(2)
    expect(parsed.joints).toHaveLength(1)
    expect(parsed.warnings).toHaveLength(0)
  })

  test("urdf_parse flags broken joint reference", async () => {
    await using tmp = await tmpdir()

    const brokenUrdf = path.join(tmp.path, "broken.urdf")
    await writeFile(
      brokenUrdf,
      `<robot name="broken_robot">\n` +
        `  <link name="base_link">\n` +
        `    <inertial>\n` +
        `      <mass value="1.0"/>\n` +
        `      <inertia ixx="0.1" ixy="0" ixz="0" iyy="0.1" iyz="0" izz="0.1"/>\n` +
        `    </inertial>\n` +
        `  </link>\n` +
        `  <joint name="joint1" type="revolute">\n` +
        `    <parent link="base_link"/>\n` +
        `    <child link="missing_link"/>\n` +
        `  </joint>\n` +
        `</robot>\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(UrdfParseTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ path: brokenUrdf }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed.warnings.some((w: string) => w.includes("non-existent child link"))).toBe(true)
  })

  test("urdf_parse flags missing inertia", async () => {
    await using tmp = await tmpdir()

    const missingInertiaUrdf = path.join(tmp.path, "missing_inertia.urdf")
    await writeFile(
      missingInertiaUrdf,
      `<robot name="missing_inertia_robot">\n` +
        `  <link name="base_link">\n` +
        `  </link>\n` +
        `</robot>\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(UrdfParseTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ path: missingInertiaUrdf }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed.warnings.some((w: string) => w.includes("missing <inertial>"))).toBe(true)
  })

  test("sdf_parse parses valid SDF model", async () => {
    await using tmp = await tmpdir()

    const sdfFile = path.join(tmp.path, "model.sdf")
    await writeFile(
      sdfFile,
      `<sdf version="1.6">\n` +
        `  <model name="test_model">\n` +
        `    <link name="link1">\n` +
        `      <inertial>\n` +
        `        <mass>2.0</mass>\n` +
        `      </inertial>\n` +
        `    </link>\n` +
        `    <joint name="joint1" type="revolute">\n` +
        `      <parent>link1</parent>\n` +
        `      <child>link2</child>\n` +
        `    </joint>\n` +
        `  </model>\n` +
        `</sdf>\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(SdfParseTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ path: sdfFile }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed.name).toBe("test_model")
    expect(parsed.models[0].links[0].mass).toBe(2.0)
  })

  test("urdf_to_mesh exports geometries successfully", async () => {
    await using tmp = await tmpdir()

    const urdfFile = path.join(tmp.path, "test.urdf")
    await writeFile(
      urdfFile,
      `<robot name="test_robot">\n` +
        `  <link name="link1">\n` +
        `    <visual>\n` +
        `      <geometry>\n` +
        `        <box size="1 1 1"/>\n` +
        `      </geometry>\n` +
        `    </visual>\n` +
        `  </link>\n` +
        `</robot>\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(UrdfToMeshTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ path: urdfFile, outDir: path.join(tmp.path, "output"), format: "stl" }, ctx),
        ),
    })

    expect(result.metadata.exportedCount).toBe(1)
  })

  test("moveit_plan returns planned trajectory", async () => {
    const tool = await runtime.runPromise(MoveitPlanTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: process.cwd(),
      fn: async () =>
        Effect.runPromise(
          tool.execute({ scene: "scene.yaml", goal: { joint1: 1.0 } }, ctx),
        ),
    })

    expect(result.metadata.planned).toBe(true)
  })

  test("ros2 handles missing installations gracefully", async () => {
    const tool = await runtime.runPromise(Ros2Tool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: process.cwd(),
      fn: async () =>
        Effect.runPromise(
          tool.execute({ action: "topic", args: ["list"] }, ctx),
        ),
    })

    expect(result.output).toContain("not installed")
  })
})
