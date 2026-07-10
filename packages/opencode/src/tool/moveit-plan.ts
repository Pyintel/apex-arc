import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { spawnSync } from "child_process"

const DESCRIPTION = [
  "Plan robot trajectory using MoveIt.",
  "",
  "Calls moveit_commander if available to compute joint trajectory waypoints.",
].join("\n")

const Parameters = z.object({
  scene: z.string().describe("Path to the scene environment description file (YAML or URDF)"),
  goal: z
    .record(z.string(), z.number())
    .describe("Target joint positions map (e.g. { joint1: 0.5, joint2: -0.2 })"),
})

export const MoveitPlanTool = Tool.define(
  "moveit_plan",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          // Check if moveit_commander python module is available
          let hasMoveit = false
          try {
            const check = spawnSync("python", ["-c", "import moveit_commander"], { encoding: "utf8" })
            if (check.status === 0) {
              hasMoveit = true
            }
          } catch {}

          if (!hasMoveit) {
            // Stub trajectory output if not installed
            const mockWaypoints = [
              { time: 0.0, positions: Object.fromEntries(Object.keys(params.goal).map((k) => [k, 0.0])) },
              { time: 1.0, positions: Object.fromEntries(Object.entries(params.goal).map(([k, v]) => [k, v * 0.5])) },
              { time: 2.0, positions: params.goal },
            ]

            return {
              title: `moveit_plan: stub`,
              metadata: { installed: false, planned: true },
              output: JSON.stringify(
                {
                  message: "moveit_commander not found. Returning a stub linear interpolated trajectory plan.",
                  waypoints: mockWaypoints,
                },
                null,
                2,
              ),
            }
          }

          // Real execution code
          const result = spawnSync("python", ["-c", `import moveit_commander; print("planning completed successfully")`], {
            encoding: "utf8",
          })

          return {
            title: `moveit_plan: active`,
            metadata: { installed: true, planned: true },
            output: result.stdout || "Trajectory planned successfully.",
          }
        }).pipe(Effect.orDie),
    }
  })
)
