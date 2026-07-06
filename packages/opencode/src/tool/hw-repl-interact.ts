import z from "zod"
import { Effect } from "effect"
import { execSync } from "child_process"
import * as Tool from "./tool"

const DESCRIPTION = [
  "Interact with a microcontroller's Python/Serial REPL (such as CircuitPython or MicroPython).",
  "Opens a connection, sends a Python command or expression, and returns the printed output.",
  "Automatically sends an interrupt (Ctrl+C) to wake/clear the REPL before executing the command.",
].join("\n")

function executeReplCommand(port: string, command: string, baud: number, timeoutMs: number): string {
  if (process.platform === "win32") {
    // Escape command quotes for PowerShell
    const escapedCommand = command.replace(/"/g, '`"').replace(/\n/g, '`r`n')
    const psScript = [
      `$port = New-Object System.IO.Ports.SerialPort "${port}", ${baud}, None, 8, one`,
      `$port.ReadTimeout = 1000`,
      `$port.WriteTimeout = 1000`,
      `$port.Open()`,
      `$port.Write([char]3) # Ctrl+C`,
      `Start-Sleep -Milliseconds 200`,
      `$port.Write("\`r\`n")`,
      `Start-Sleep -Milliseconds 200`,
      `$null = $port.ReadExisting() # clear buffer`,
      `$port.Write("${escapedCommand}\`r\`n")`,
      `Start-Sleep -Milliseconds ${timeoutMs}`,
      `$out = $port.ReadExisting()`,
      `Write-Host -NoNewline $out`,
      `$port.Close()`,
    ].join("\n")

    try {
      const output = execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`, {
        encoding: "utf8",
        timeout: timeoutMs + 3000,
      })
      return output
    } catch (err: any) {
      throw new Error(`REPL interaction failed on Windows: ${err.message}`)
    }
  } else {
    // macOS / Linux serial REPL using python3 (pyserial)
    const escapedCommand = command.replace(/'/g, "'\\''")
    const pyCommand = [
      `import serial, time`,
      `try:`,
      `    s = serial.Serial('${port}', ${baud}, timeout=1)`,
      `    s.write(b'\\x03') # Ctrl+C`,
      `    time.sleep(0.2)`,
      `    s.write(b'\\r\\n')`,
      `    time.sleep(0.2)`,
      `    s.read(s.in_waiting) # clear buffer`,
      `    s.write(b'${escapedCommand}\\r\\n')`,
      `    time.sleep(${timeoutMs / 1000})`,
      `    output = s.read(s.in_waiting).decode('utf-8', errors='ignore')`,
      `    print(output, end='')`,
      `    s.close()`,
      `except Exception as e:`,
      `    print(f"Error: {e}")`,
    ].join("; ")

    try {
      const output = execSync(`python3 -c "${pyCommand}"`, {
        encoding: "utf8",
        timeout: timeoutMs + 3000,
      })
      return output
    } catch (err: any) {
      throw new Error(`REPL interaction failed on Linux/macOS: ${err.message}`)
    }
  }
}

export const HwReplInteractTool = Tool.define(
  "hw_repl_interact",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        port: z.string().describe("The serial/COM port of the microcontroller (e.g. COM7 or /dev/ttyUSB0)"),
        command: z.string().describe("The Python command or code to run in the REPL (e.g. 'import os; print(os.uname())')"),
        baud: z.number().int().default(115200).describe("Baud rate for the connection (defaults to 115200)"),
        timeoutMs: z.number().int().default(1000).describe("Time in milliseconds to wait for the command to finish executing (defaults to 1000)"),
      }),
      execute: (params: { port: string; command: string; baud: number; timeoutMs: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const output = yield* Effect.try({
            try: () => executeReplCommand(params.port, params.command, params.baud, params.timeoutMs),
            catch: (error: any) => new Error(error.message || String(error))
          })

          return {
            title: "hw_repl_interact",
            metadata: {},
            output: output || "No response received from the board REPL.",
          }
        }).pipe(Effect.orDie),
    }
  })
)
