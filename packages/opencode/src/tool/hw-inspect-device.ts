import z from "zod"
import { Effect } from "effect"
import { execSync } from "child_process"
import * as Tool from "./tool"

const DESCRIPTION = [
  "Inspect a specific serial/COM port (or all connected ports if not specified) to retrieve Vendor ID, Product ID, Manufacturer, Serial Number, and device class.",
  "Provides detailed hardware metadata natively without the need to run raw shell scripts.",
].join("\n")

interface DetailedDeviceInfo {
  port: string
  name: string
  vendorId?: string
  productId?: string
  manufacturer?: string
  serialNumber?: string
  deviceClass?: string
  status?: string
}

function parseWin32Devices(portFilter?: string): DetailedDeviceInfo[] {
  const devices: DetailedDeviceInfo[] = []
  try {
    const psCommand = `Get-PnpDevice -PresentOnly | Where-Object { $_.Class -eq 'Ports' -or $_.FriendlyName -like '*(COM*' } | Select-Object FriendlyName, InstanceId, Manufacturer, Class, Status | ConvertTo-Json -Compress`
    const rawJson = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: "utf8" }).trim()
    if (rawJson) {
      const parsed = JSON.parse(rawJson)
      const entries = Array.isArray(parsed) ? parsed : [parsed]
      for (const entry of entries) {
        const friendlyName = entry.FriendlyName || ""
        const match = /\((COM\d+)\)/i.exec(friendlyName)
        if (match) {
          const portName = match[1]
          if (portFilter && portFilter.toUpperCase() !== portName.toUpperCase()) {
            continue
          }

          let vendorId: string | undefined
          let productId: string | undefined
          let serialNumber: string | undefined

          const instanceId = entry.InstanceId || ""
          if (instanceId) {
            const vidMatch = /VID_([0-9A-Fa-f]{4})/i.exec(instanceId)
            const pidMatch = /PID_([0-9A-Fa-f]{4})/i.exec(instanceId)
            if (vidMatch) vendorId = vidMatch[1].toUpperCase()
            if (pidMatch) productId = pidMatch[1].toUpperCase()

            const parts = instanceId.split("\\")
            if (parts.length > 1) {
              const lastPart = parts[parts.length - 1]
              if (!lastPart.includes("&") && lastPart.length > 5) {
                serialNumber = lastPart
              }
            }
          }

          devices.push({
            port: portName,
            name: friendlyName,
            vendorId,
            productId,
            manufacturer: entry.Manufacturer,
            serialNumber,
            deviceClass: entry.Class,
            status: entry.Status,
          })
        }
      }
    }
  } catch {
    if (portFilter) {
      devices.push({
        port: portFilter,
        name: portFilter,
      })
    }
  }
  return devices
}

function parseMacOSDevices(portFilter?: string): DetailedDeviceInfo[] {
  const devices: DetailedDeviceInfo[] = []
  try {
    const portsRaw = execSync("ls /dev/tty.* /dev/cu.* 2>/dev/null", { encoding: "utf8" })
    const ports = portsRaw.split("\n").map(p => p.trim()).filter(p => p.length > 0)

    for (const port of ports) {
      if (portFilter && portFilter !== port) {
        continue
      }

      const baseName = port.replace("/dev/", "")
      let vendorId: string | undefined
      let productId: string | undefined
      let manufacturer: string | undefined
      let serialNumber: string | undefined

      try {
        const ioregOutput = execSync(`ioreg -r -c IOSerialBSDClient -l`, { encoding: "utf8" })
        const sections = ioregOutput.split("+-o ")
        for (const sec of sections) {
          if (sec.includes(`"IOCalloutDevice" = "${port}"`) || sec.includes(`"IODialinDevice" = "${port}"`) || sec.includes(`"IOCalloutDevice" = "/dev/${baseName}"`)) {
            const vidMatch = /"idVendor" = (\d+)/.exec(sec)
            const pidMatch = /"idProduct" = (\d+)/.exec(sec)
            const mfgMatch = /"USB Vendor Name" = "([^"]+)"/.exec(sec) || /"Manufacturer" = "([^"]+)"/.exec(sec)
            const snMatch = /"USB Serial Number" = "([^"]+)"/.exec(sec) || /"SerialNumber" = "([^"]+)"/.exec(sec)

            if (vidMatch) vendorId = parseInt(vidMatch[1], 10).toString(16).padStart(4, "0").toUpperCase()
            if (pidMatch) productId = parseInt(pidMatch[1], 10).toString(16).padStart(4, "0").toUpperCase()
            if (mfgMatch) manufacturer = mfgMatch[1]
            if (snMatch) serialNumber = snMatch[1]
            break
          }
        }
      } catch {}

      devices.push({
        port,
        name: baseName,
        vendorId,
        productId,
        manufacturer,
        serialNumber,
        deviceClass: "SerialPort",
      })
    }
  } catch {}
  return devices
}

function parseLinuxDevices(portFilter?: string): DetailedDeviceInfo[] {
  const devices: DetailedDeviceInfo[] = []
  try {
    const portsRaw = execSync("ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null", { encoding: "utf8" })
    const ports = portsRaw.split("\n").map(p => p.trim()).filter(p => p.length > 0)

    for (const port of ports) {
      if (portFilter && portFilter !== port) {
        continue
      }

      let vendorId: string | undefined
      let productId: string | undefined
      let manufacturer: string | undefined
      let serialNumber: string | undefined

      try {
        const udevInfo = execSync(`udevadm info --query=property --name=${port}`, { encoding: "utf8" })
        const lines = udevInfo.split("\n")
        for (const line of lines) {
          if (line.startsWith("ID_VENDOR_ID=")) vendorId = line.split("=")[1].toUpperCase()
          if (line.startsWith("ID_MODEL_ID=")) productId = line.split("=")[1].toUpperCase()
          if (line.startsWith("ID_VENDOR=")) manufacturer = line.split("=")[1]
          if (line.startsWith("ID_SERIAL_SHORT=")) serialNumber = line.split("=")[1]
        }
      } catch {}

      devices.push({
        port,
        name: port.replace("/dev/", ""),
        vendorId,
        productId,
        manufacturer,
        serialNumber,
        deviceClass: "SerialPort",
      })
    }
  } catch {}
  return devices
}

export const HwInspectDeviceTool = Tool.define(
  "hw_inspect_device",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        port: z.string().optional().describe("Optional port name to query specifically (e.g. COM7 or /dev/ttyUSB0)"),
      }),
      execute: (params: { port?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          let devices: DetailedDeviceInfo[] = []
          if (process.platform === "win32") {
            devices = parseWin32Devices(params.port)
          } else if (process.platform === "darwin") {
            devices = parseMacOSDevices(params.port)
          } else {
            devices = parseLinuxDevices(params.port)
          }

          return {
            title: "hw_inspect_device",
            metadata: { devices },
            output: devices.length === 0
              ? (params.port ? `Port ${params.port} was not found or could not be inspected.` : "No connected serial/microcontroller devices found.")
              : JSON.stringify(devices, null, 2),
          }
        }),
    }
  })
)
