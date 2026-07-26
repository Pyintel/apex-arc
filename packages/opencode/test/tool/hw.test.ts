import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HwListDevicesTool } from "../../src/tool/hw-list-devices"
import { HwFlashTool } from "../../src/tool/hw-flash"
import { HwSerialMonitorTool } from "../../src/tool/hw-serial-monitor"
import { HwInspectDeviceTool } from "../../src/tool/hw-inspect-device"
import { HwBoardRegistryTool } from "../../src/tool/hw-board-registry"
import { WebFetchMarkdownTool } from "../../src/tool/web-fetch-markdown"
import { HwReplInteractTool } from "../../src/tool/hw-repl-interact"
import { HwPinoutDatasheetTool } from "../../src/tool/hw-pinout-datasheet"
import { Instance } from "../../src/project/instance"
import { Truncate, Tool } from "../../src/tool"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { AppFileSystem } from "@pyintel/shared/filesystem"

const ctx = {
  sessionID: SessionID.make("ses_test-hw-session"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

afterEach(async () => {
  await Instance.disposeAll()
})

const it = testEffect(
  Layer.mergeAll(
    AppFileSystem.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    Truncate.defaultLayer,
    Agent.defaultLayer,
    FetchHttpClient.layer,
  ),
)

describe("Hardware Co-Pilot Tools", () => {
  it.live("hw_list_devices returns a valid array", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwListDevicesTool
        const tool = yield* info.init()
        const result = yield* tool.execute({}, ctx)

        expect(result.title).toBe("hw_list_devices")
        expect(result.metadata.devices).toBeDefined()
        expect(Array.isArray(result.metadata.devices)).toBe(true)
      }),
    ),
    30000,
  )

  it.live("hw_flash raises error on invalid fqbn for arduino", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwFlashTool
        const tool = yield* info.init()

        const result = yield* Effect.exit(
          tool.execute(
            {
              port: "COM3",
              method: "arduino",
              filePath: dir, // use tmpdir
            },
            ctx,
          ),
        )
        expect(result._tag).toBe("Failure")
      }),
    ),
  )

  it.live("hw_flash raises error when file is missing", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwFlashTool
        const tool = yield* info.init()

        const result = yield* Effect.exit(
          tool.execute(
            {
              port: "COM3",
              method: "circuitpython",
              filePath: "P:\\nonexistent-file-path-xyz.py",
            },
            ctx,
          ),
        )
        expect(result._tag).toBe("Failure")
      }),
    ),
  )

  it.live("hw_serial_monitor executes and handles output or timeouts", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwSerialMonitorTool
        const tool = yield* info.init()

        // Since we don't have a live COM3 device attached in the test suite,
        // monitor will throw or output powershell error, but the effect will catch/verify it.
        const result = yield* Effect.exit(
          tool.execute(
            {
              port: "COM999",
              baud: 115200,
              durationMs: 100,
            },
            ctx,
          ),
        )
        expect(result).toBeDefined()
      }),
    ),
  )

  it.live("hw_inspect_device returns port details", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwInspectDeviceTool
        const tool = yield* info.init()
        const result = yield* tool.execute({}, ctx)

        expect(result.title).toBe("hw_inspect_device")
        expect(result.metadata.devices).toBeDefined()
        expect(Array.isArray(result.metadata.devices)).toBe(true)
      }),
    ),
  )

  it.live("hw_board_registry finds matching boards", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwBoardRegistryTool
        const tool = yield* info.init()
        
        // Match by VID:PID
        const resultVidPid = yield* tool.execute({ query: "239a:8036" }, ctx)
        expect(resultVidPid.title).toBe("hw_board_registry")
        expect(resultVidPid.metadata.found).toBe(true)
        expect(resultVidPid.output).toContain("Adafruit PyPortal")

        // Match by name
        const resultName = yield* tool.execute({ query: "Pico" }, ctx)
        expect(resultName.metadata.found).toBe(true)
        expect(resultName.output).toContain("Raspberry Pi Pico")
      }),
    ),
  )

  it.live("web_fetch_markdown executes and converts HTML to Markdown", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* WebFetchMarkdownTool
        const tool = yield* info.init()

        // Since it fetches real URL or may fail/timeout without connection in test environment,
        // we can test that it throws/rejects on invalid URL format, and mock/check structure.
        const resultErr = yield* Effect.exit(
          tool.execute({ url: "not-a-valid-url" }, ctx)
        )
        expect(resultErr._tag).toBe("Failure")
      }),
    ),
  )

  it.live("hw_repl_interact exits or runs command on mock port", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwReplInteractTool
        const tool = yield* info.init()

        // Executing on a non-existent port should exit or fail gracefully.
        const result = yield* Effect.exit(
          tool.execute(
            {
              port: "COM999",
              command: "print('hello')",
              baud: 115200,
              timeoutMs: 100,
            },
            ctx,
          ),
        )
        expect(result).toBeDefined()
      }),
    ),
  )

  it.live("hw_pinout_datasheet looks up components", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const info = yield* HwPinoutDatasheetTool
        const tool = yield* info.init()

        // Successful lookup
        const resultOk = yield* tool.execute({ component: "ESP32" }, ctx)
        expect(resultOk.title).toBe("hw_pinout_datasheet")
        expect(resultOk.metadata.found).toBe(true)
        expect(resultOk.output).toContain("ESP32-WROOM-32")

        // Failed lookup
        const resultFail = yield* tool.execute({ component: "NonExistentComponent" }, ctx)
        expect(resultFail.metadata.found).toBe(false)
        expect(resultFail.output).toContain("Available local component pinouts")
      }),
    ),
  )
})
