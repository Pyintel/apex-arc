import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { spawnSync } from "child_process"

const DESCRIPTION = [
  "ROS 2 CLI Wrapper.",
  "",
  "Wraps the ros2 CLI tools (ros2 topic, ros2 node, ros2 launch, ros2 bag).",
  "If ROS 2 is not installed on PATH, returns a clean error.",
].join("\n")

const Parameters = z.object({
  action: z.enum(["topic", "node", "launch", "bag", "run", "service", "param", "msg", "srv"]).describe("ROS 2 subcommand to run"),
  args: z.array(z.string()).describe("Arguments to pass to the ROS 2 command"),
})

type Ros2Metadata = {
  installed?: boolean
  exitCode: number | null
  argsCount?: number
}

export const Ros2Tool = Tool.define(
  "ros2",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          // Check if ros2 CLI is on PATH
          let hasRos2 = false
          try {
            const res = spawnSync("ros2", ["--help"], { encoding: "utf8" })
            if (res.status === 0 || res.status === 1) {
              hasRos2 = true
            }
          } catch {}

          if (!hasRos2) {
            const metadata: Ros2Metadata = { installed: false, exitCode: null }
            return {
              title: `ros2: ${params.action}`,
              metadata,
              output: `Error: ROS 2 CLI is not installed or not found on PATH.`,
            }
          }

          const fullArgs = [params.action, ...params.args]
          const res = spawnSync("ros2", fullArgs, {
            encoding: "utf8",
            shell: true,
            timeout: 30_000,
          })

          const metadata: Ros2Metadata = {
            exitCode: res.status,
            argsCount: params.args.length,
          }

          yield* ctx.metadata({
            metadata,
          })

          const parts = [
            `ROS 2 Exit Code: ${res.status}`,
            "",
            "=== STDOUT ===",
            res.stdout || "(empty)",
            "",
            "=== STDERR ===",
            res.stderr || "(empty)",
          ]

          return {
            title: `ros2: ${params.action} ${params.args.join(" ")}`,
            metadata,
            output: parts.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  })
)
