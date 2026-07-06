import z from "zod"
import { Effect } from "effect"
import { execSync } from "child_process"
import * as Tool from "./tool"

const DESCRIPTION = [
  "List all connected microcontroller and serial port devices.",
  "",
  "Performs auto-discovery of ports (COM on Windows, /dev/tty on Linux/macOS) and extracts metadata like Vendor ID (VID) and Product ID (PID) where possible.",
].join("\n")

interface DeviceInfo {
  port: string
  name: string
  description?: string
  vendorId?: string
  productId?: string
}

function discoverDevices(): DeviceInfo[] {
  const devices: DeviceInfo[] = []

  if (process.platform === "win32") {
    try {
      // Query serial ports using PowerShell Get-CimInstance Win32_SerialPort
      const psCommand = `Get-CimInstance Win32_SerialPort | Select-Object DeviceID, Name, Description, PNPDeviceID | ConvertTo-Json -Compress`
      const rawJson = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: "utf8" }).trim()
      
      if (rawJson) {
        const parsed = JSON.parse(rawJson)
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        for (const entry of entries) {
          if (!entry.DeviceID) continue
          
          let vendorId: string | undefined
          let productId: string | undefined
          if (entry.PNPDeviceID) {
            const vidMatch = /VID_([0-9A-Fa-f]{4})/i.exec(entry.PNPDeviceID)
            const pidMatch = /PID_([0-9A-Fa-f]{4})/i.exec(entry.PNPDeviceID)
            if (vidMatch) vendorId = vidMatch[1]
            if (pidMatch) productId = pidMatch[1]
          }

          devices.push({
            port: entry.DeviceID,
            name: entry.Name || entry.DeviceID,
            description: entry.Description,
            vendorId,
            productId,
          })
        }
      }
    } catch {
      // Fallback: try PNP entities matching Ports class
      try {
        const psCommand = `Get-PnpDevice -PresentOnly | Where-Object { $_.Class -eq 'Ports' } | Select-Object FriendlyName, InstanceId | ConvertTo-Json -Compress`
        const rawJson = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: "utf8" }).trim()
        if (rawJson) {
          const parsed = JSON.parse(rawJson)
          const entries = Array.isArray(parsed) ? parsed : [parsed]
          for (const entry of entries) {
            const match = /\((COM\d+)\)/i.exec(entry.FriendlyName || "")
            if (match) {
              let vendorId: string | undefined
              let productId: string | undefined
              if (entry.InstanceId) {
                const vidMatch = /VID_([0-9A-Fa-f]{4})/i.exec(entry.InstanceId)
                const pidMatch = /PID_([0-9A-Fa-f]{4})/i.exec(entry.InstanceId)
                if (vidMatch) vendorId = vidMatch[1]
                if (pidMatch) productId = pidMatch[1]
              }
              devices.push({
                port: match[1],
                name: entry.FriendlyName,
                vendorId,
                productId,
              })
            }
          }
        }
      } catch {
        // Ultimate Windows fallback: try listing basic COM ports via registry querying or raw mode
      }
    }
  } else {
    // macOS / Linux listing
    try {
      const portsRaw = execSync("ls /dev/tty* /dev/cu* 2>/dev/null", { encoding: "utf8" })
      const lines = portsRaw.split("\n")
      for (const line of lines) {
        const port = line.trim()
        if (
          port.includes("usbserial") ||
          port.includes("usbmodem") ||
          port.includes("ttyUSB") ||
          port.includes("ttyACM") ||
          port.includes("cu.usb")
        ) {
          devices.push({
            port,
            name: port,
          })
        }
      }
    } catch {
      // Ignore directory listing failures
    }
  }

  return devices
}

export const HwListDevicesTool = Tool.define(
  "hw_list_devices",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({}),
      execute: (params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const devices = discoverDevices()
          return {
            title: "hw_list_devices",
            metadata: { devices },
            output: devices.length === 0
              ? "No connected serial/microcontroller devices found."
              : JSON.stringify(devices, null, 2),
          }
        }),
    }
  })
)
