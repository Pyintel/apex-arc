import z from "zod"
import { Effect } from "effect"
import { execSync } from "child_process"
import * as path from "path"
import * as fs from "fs"
import * as Tool from "./tool"

const DESCRIPTION = [
  "Compile and flash code/binary to a target microcontroller.",
  "",
  "Supports:",
  "- 'circuitpython': Synchronizes code files to the local mounted CircuitPython board drive (e.g. CIRCUITPY).",
  "- 'arduino': Runs compilation and upload using local `arduino-cli` installation.",
  "- 'esp32': Flashes built binaries using `esptool.py` to ESP32 family chips.",
].join("\n")

function flashCircuitPython(filePath: string): string {
  // Find mounted volume named "CIRCUITPY" or similar
  let mountPath: string | undefined

  if (process.platform === "win32") {
    try {
      // Find drive letter with label "CIRCUITPY"
      const psCommand = `Get-Volume | Where-Object { $_.FileSystemLabel -like '*CIRCUITPY*' } | Select-Object -ExpandProperty DriveLetter`
      const letter = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: "utf8" }).trim()
      if (letter) {
        mountPath = `${letter}:\\`
      }
    } catch {}
  } else {
    // macOS / Linux mounted paths
    const candidates = [
      "/Volumes/CIRCUITPY",
      "/media/CIRCUITPY",
      "/mnt/CIRCUITPY",
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        mountPath = c
        break
      }
    }
  }

  if (!mountPath || !fs.existsSync(mountPath)) {
    throw new Error("Could not locate a mounted CircuitPython device (volume 'CIRCUITPY' not found).")
  }

  // Copy code.py / main.py or folder contents
  const stat = fs.statSync(filePath)
  if (stat.isDirectory()) {
    // Copy files recursively
    const files = fs.readdirSync(filePath)
    for (const file of files) {
      const src = path.join(filePath, file)
      const dest = path.join(mountPath, file)
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest)
      }
    }
  } else {
    // Copy single file as code.py on the drive
    const dest = path.join(mountPath, "code.py")
    fs.copyFileSync(filePath, dest)
  }

  return `Successfully copied files to CircuitPython device mounted at: ${mountPath}`
}

function flashArduino(sketchPath: string, port: string, fqbn?: string): string {
  if (!fqbn) {
    throw new Error("FQBN (Fully Qualified Board Name) is required for Arduino compilation.")
  }

  // Build compile and upload command
  const command = `arduino-cli compile --upload -b ${fqbn} -p ${port} "${sketchPath}"`
  try {
    const output = execSync(command, { encoding: "utf8", stdio: "pipe" })
    return `Arduino flashing successful:\n${output}`
  } catch (err: any) {
    throw new Error(`Arduino flashing failed: ${err.stdout || err.message}`)
  }
}

function flashEsp32(binaryPath: string, port: string, baud?: number): string {
  const baudRate = baud || 115200
  const command = `esptool.py --chip auto --port ${port} --baud ${baudRate} write_flash 0x10000 "${binaryPath}"`
  try {
    const output = execSync(command, { encoding: "utf8", stdio: "pipe" })
    return `ESP32 flashing successful:\n${output}`
  } catch (err: any) {
    throw new Error(`ESP32 flashing failed: ${err.stdout || err.message}`)
  }
}

export const HwFlashTool = Tool.define(
  "hw_flash",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        port: z.string().describe("The serial/COM port of the target board"),
        method: z.enum(["circuitpython", "arduino", "esp32"]).describe("Flashing method to use"),
        filePath: z.string().describe("The absolute path to the file or directory containing the code/sketch/binary"),
        fqbn: z.string().optional().describe("FQBN (Fully Qualified Board Name) - required for Arduino method (e.g. esp32:esp32:esp32 or arduino:avr:uno)"),
        baud: z.number().int().optional().describe("Baud rate for flashing (defaults to 115200, used by 'esp32' method)"),
      }),
      execute: (params: { port: string; method: "circuitpython" | "arduino" | "esp32"; filePath: string; fqbn?: string; baud?: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          // Resolve relative file paths to absolute if needed
          let absPath = params.filePath
          if (!path.isAbsolute(absPath)) {
            absPath = path.resolve(absPath)
          }

          if (!fs.existsSync(absPath)) {
            return yield* Effect.fail(new Error(`File/directory not found at path: ${absPath}`))
          }

          const output = yield* Effect.try({
            try: () => {
              switch (params.method) {
                case "circuitpython":
                  return flashCircuitPython(absPath)
                case "arduino":
                  return flashArduino(absPath, params.port, params.fqbn)
                case "esp32":
                  return flashEsp32(absPath, params.port, params.baud)
              }
            },
            catch: (error: any) => new Error(error.message || String(error))
          })

          return {
            title: "hw_flash",
            metadata: {},
            output,
          }
        }).pipe(Effect.orDie),
    }
  })
)
