import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { Log } from "@/util"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "tdd-loop-tool" })

const Parameters = z.object({
  testCommand: z.string().describe("The test execution command to run (e.g. 'bun test test/my-file.test.ts')"),
  sourceFiles: z.array(z.string()).describe("The source files being tested (we watch these or report on them)"),
  maxIterations: z.number().default(3).describe("Maximum loop iterations to attempt fixes"),
})

export interface TddLoopFailureReport {
  passed: boolean
  iterationsRun: number
  lastOutput: string
  failures: {
    file: string
    line?: number
    col?: number
    message: string
    assertion?: {
      expected: string
      actual: string
    }
  }[]
}

function parseTestFailures(output: string): TddLoopFailureReport["failures"] {
  const failures: TddLoopFailureReport["failures"] = []

  // Attempt to parse standard bun test and jest test output formats
  // Matches "error: expect(received).toBe(expected)" or similar assertion failures
  const lines = output.split("\n")
  let currentFile = ""
  let currentLine: number | undefined
  let currentCol: number | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // File/line location match: e.g. "at <anonymous> (P:\Projects\apex-arc\packages\opencode\test\tool\shell-run.test.ts:103:38)"
    const locMatch = /at\s+.*\((.*?):(\d+):(\d+)\)/.exec(line)
    if (locMatch) {
      currentFile = locMatch[1]
      currentLine = Number(locMatch[2])
      currentCol = Number(locMatch[3])
    }

    const expectMatch = /error:\s+expect\(received\)\.(toBe|toContain|toEqual)\(expected\)/i.exec(line)
    if (expectMatch) {
      let expected = ""
      let actual = ""
      if (lines[i + 2]?.includes("Expected:")) expected = lines[i + 2].split("Expected:")[1].trim()
      if (lines[i + 3]?.includes("Received:")) actual = lines[i + 3].split("Received:")[1].trim()

      failures.push({
        file: currentFile,
        line: currentLine,
        col: currentCol,
        message: line.trim(),
        assertion: expected || actual ? { expected, actual } : undefined,
      })
    }
  }

  // Fallback if regex match doesn't find details: parse general "fail" or error messages
  if (failures.length === 0) {
    const errorLines = lines.filter((l) => l.includes("error:") || l.includes("fail") || l.includes("FAIL"))
    for (const el of errorLines.slice(0, 5)) {
      failures.push({
        file: "",
        message: el.trim(),
      })
    }
  }

  return failures
}

export const TddLoopTool = Tool.define(
  "tdd_loop",
  Effect.gen(function* () {
    return {
      description: "A test-driven development loop that runs tests, parses failures, and returns structured reports.",
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const worktree = Instance.directory

          let iterationsRun = 0
          let passed = false
          let lastOutput = ""

          while (iterationsRun < params.maxIterations && !passed) {
            iterationsRun++

            log.info("tdd_loop running iteration", { iteration: iterationsRun, command: params.testCommand })

            const res = spawnSync(params.testCommand, {
              shell: true,
              cwd: worktree,
              encoding: "utf8",
              timeout: 45_000,
            })

            lastOutput = (res.stdout || "") + "\n" + (res.stderr || "")
            passed = res.status === 0

            if (passed) break
          }

          const failures = passed ? [] : parseTestFailures(lastOutput)

          const report: TddLoopFailureReport = {
            passed,
            iterationsRun,
            lastOutput,
            failures,
          }

          yield* ctx.metadata({
            metadata: { passed, iterationsRun, failuresCount: failures.length },
          })

          const summary = [
            `TDD Loop: ${passed ? "PASSED" : "FAILED"} after ${iterationsRun} iteration(s)`,
            `Failures detected: ${failures.length}`,
            "",
            JSON.stringify(report, null, 2),
          ]

          return {
            title: `tdd_loop: ${params.testCommand.slice(0, 50)}`,
            metadata: { passed, iterationsRun, failuresCount: failures.length },
            output: summary.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  })
)
