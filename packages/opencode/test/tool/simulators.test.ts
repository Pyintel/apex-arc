import { describe, expect, test } from "bun:test"
import { writeFile } from "fs/promises"
import path from "path"
import { Effect, ManagedRuntime, Layer } from "effect"
import { AppFileSystem } from "@pyintel/shared/filesystem"
import { SimToRealCheckTool, WokwiSimulateTool, MujocoStepTool, PybulletStepTool } from "../../src/tool/simulators"
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

describe("simulators tools", () => {
  test("sim_to_real_check detects mass and limit deltas", async () => {
    await using tmp = await tmpdir()

    const urdfFile = path.join(tmp.path, "robot.urdf")
    await writeFile(
      urdfFile,
      `<robot name="my_robot">\n` +
        `  <link name="link1">\n` +
        `    <inertial>\n` +
        `      <mass value="5.0"/>\n` +
        `      <inertia ixx="0.1" ixy="0" ixz="0" iyy="0.1" iyz="0" izz="0.1"/>\n` +
        `    </inertial>\n` +
        `  </link>\n` +
        `  <joint name="joint1" type="revolute">\n` +
        `    <parent link="base_link"/>\n` +
        `    <child link="link1"/>\n` +
        `    <limit lower="-1.0" upper="1.0" velocity="2.0" effort="10.0"/>\n` +
        `  </joint>\n` +
        `</robot>\n`,
      "utf8",
    )

    const manifestFile = path.join(tmp.path, "hardware.yaml")
    await writeFile(
      manifestFile,
      `robot:\n` +
        `  name: my_robot\n` +
        `  links:\n` +
        `    - name: link1\n` +
        `      mass: 4.0\n` +
        `      com: [0, 0, 0]\n` +
        `      inertia: [0.1, 0, 0, 0.1, 0, 0.1]\n` +
        `joints:\n` +
        `  - name: joint1\n` +
        `    type: revolute\n` +
        `    actuator:\n` +
        `      kind: servo\n` +
        `      ratio: 1\n` +
        `      limits:\n` +
        `        pos: [-1.0, 1.0]\n` +
        `        vel: 1.0\n` +
        `        torque: 10.0\n` +
        `safety:\n` +
        `  estop: true\n` +
        `  limits:\n` +
        `    soft:\n` +
        `      pos: [-0.9, 0.9]\n` +
        `      vel: 0.9\n` +
        `  watchdogs: []\n`,
      "utf8",
    )

    const tool = await runtime.runPromise(SimToRealCheckTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.runPromise(
          tool.execute({ urdfPath: urdfFile, hardwareManifestPath: manifestFile }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed.ok).toBe(false)
    expect(parsed.warnings.length).toBeGreaterThan(0)
    // Warning 1: mass delta 5 vs 4 (25% delta)
    expect(parsed.warnings.some((w: string) => w.includes("mass delta"))).toBe(true)
    // Warning 2: velocity limit delta (URDF=2.0, Manifest=1.0)
    expect(parsed.warnings.some((w: string) => w.includes("velocity limit"))).toBe(true)
  })

  test("wokwi_simulate rejects execution if CLI is missing", async () => {
    const tool = await runtime.runPromise(WokwiSimulateTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: process.cwd(),
      fn: async () =>
        Effect.runPromise(
          tool.execute({ diagramJson: "{}", code: "void setup() {} void loop() {}", durationMs: 500 }, ctx),
        ),
    })

    expect(result.output).toContain("not installed")
  })

  test("mujoco_step returns uniform envelope", async () => {
    const tool = await runtime.runPromise(MujocoStepTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: process.cwd(),
      fn: async () =>
        Effect.runPromise(
          tool.execute({ modelXmlPath: "model.xml", durationMs: 100 }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed).toBeDefined()
  })

  test("pybullet_step returns uniform envelope", async () => {
    const tool = await runtime.runPromise(PybulletStepTool.pipe(Effect.flatMap((info) => info.init())))
    const result = await Instance.provide({
      directory: process.cwd(),
      fn: async () =>
        Effect.runPromise(
          tool.execute({ urdfPath: "robot.urdf", durationMs: 100 }, ctx),
        ),
    })

    const parsed = JSON.parse(result.output)
    expect(parsed).toBeDefined()
  })
})
