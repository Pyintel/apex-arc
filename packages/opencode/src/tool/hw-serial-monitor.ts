import z from "zod"
import { Effect } from "effect"
import { execSync } from "child_process"
import * as Tool from "./tool"

const DESCRIPTION = [
  "Monitor and interact with a microcontroller serial connection.",
  "",
  "Opens a connection to the specified serial/COM port at a given baud rate, optionally writes a command, and captures all serial print output for the specified duration.",
].join("\n")

function monitorSerial(port: string, baud: number, durationMs: number, sendInput?: string): string {
  const durationSec = durationMs / 1000

  if (process.platform === "win32") {
    // Generate a PowerShell script to handle serial operations natively on Windows
    const inputParam = sendInput ? sendInput.replace(/"/g, '`"') : ""
    const psScript = [
      `$port = New-Object System.IO.Ports.SerialPort "${port}", ${baud}, None, 8, one`,
      `$port.ReadTimeout = 500`,
      `$port.WriteTimeout = 500`,
      `$port.Open()`,
      inputParam ? `$port.Write("${inputParam}\`r\`n")` : "",
      `$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()`,
      `while ($stopwatch.ElapsedMilliseconds -lt ${durationMs}) {`,
      `    if ($port.BytesToRead -gt 0) {`,
      `        Write-Host -NoNewline $port.ReadExisting()`,
      `    }`,
      `    Start-Sleep -Milliseconds 50`,
      `}`,
      `$port.Close()`,
    ].filter(Boolean).join("\n")

    try {
      const output = execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`, {
        encoding: "utf8",
        timeout: durationMs + 2000,
      })
      return output
    } catch (err: any) {
      throw new Error(`Serial monitoring failed on Windows: ${err.message}`)
    }
  } else {
    // macOS / Linux serial monitoring using python3 (pyserial)
    const escapedInput = sendInput ? sendInput.replace(/'/g, "'\\''") : ""
    const pyCommand = [
      `import serial, time`,
      `try:`,
      `    s = serial.Serial('${port}', ${baud}, timeout=1)`,
      escapedInput ? `    s.write(b'${escapedInput}\\r\\n')` : ``,
      `    end = time.time() + ${durationSec}`,
      `    while time.time() < end:`,
      `        if s.in_waiting > 0:`,
      `            print(s.read(s.in_waiting).decode('utf-8', errors='ignore'), end='', flush=True)`,
      `        time.sleep(0.05)`,
      `    s.close()`,
      `except Exception as e:`,
      `    print(f"Error: {e}")`,
    ].filter(Boolean).join("; ")

    try {
      const output = execSync(`python3 -c "${pyCommand}"`, {
        encoding: "utf8",
        timeout: durationMs + 2000,
      })
      return output
    } catch (err: any) {
      throw new Error(`Serial monitoring failed on Linux/macOS: ${err.message}`)
    }
  }
}

export const HwSerialMonitorTool = Tool.define(
  "hw_serial_monitor",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        port: z.string().describe("The serial/COM port to connect to (e.g. COM3 or /dev/ttyUSB0)"),
        baud: z.number().int().default(115200).describe("Baud rate for the connection (defaults to 115200)"),
        durationMs: z.number().int().default(5000).describe("Duration to monitor and capture serial output in milliseconds (defaults to 5000)"),
        sendInput: z.string().optional().describe("Optional string to write to the device serial line on startup"),
      }),
      execute: (params: { port: string; baud: number; durationMs: number; sendInput?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const output = yield* Effect.try({
            try: () => monitorSerial(params.port, params.baud, params.durationMs, params.sendInput),
            catch: (error: any) => new Error(error.message || String(error))
          })
          return {
            title: "hw_serial_monitor",
            metadata: {},
            output: output || "No serial output received during the monitoring period.",
          }
        }).pipe(Effect.orDie),
    }
  })
)
