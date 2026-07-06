import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"

const DESCRIPTION = [
  "Fetch component pinouts or links to PDF datasheets for specific chips, sensors, or development boards.",
  "Provides immediate access to pin diagrams, operating voltages, and electrical tolerances to assist with wiring.",
].join("\n")

interface ComponentSpec {
  name: string
  aliases: string[]
  description: string
  voltage: string
  pinout: string
  datasheetUrl: string
}

const COMPONENT_DATABASE: ComponentSpec[] = [
  {
    name: "DHT11 / DHT22 (Temperature & Humidity Sensor)",
    aliases: ["DHT11", "DHT22", "DHT-11", "DHT-22", "AM2302"],
    description: "Basic, low-cost digital temperature and humidity sensor.",
    voltage: "3V to 5.5V",
    pinout: [
      "Pin 1: VCC (Power 3-5V)",
      "Pin 2: DATA (Data out/in, requires a pull-up resistor of ~5-10k to VCC)",
      "Pin 3: NC (Not Connected / Null)",
      "Pin 4: GND (Ground)",
    ].join("\n"),
    datasheetUrl: "https://www.mouser.com/datasheet/2/758/DHT11-technical-manual-temp-humidity-sensor-1184851.pdf",
  },
  {
    name: "SSD1306 (OLED Display 128x64 / 128x32 I2C)",
    aliases: ["SSD1306", "OLED", "SSD1306 OLED", "I2C OLED"],
    description: "Single-chip CMOS OLED/PLED driver with controller for organic light-emitting diode dot-matrix graphic display system.",
    voltage: "3.3V to 5V",
    pinout: [
      "GND: Ground",
      "VCC: Power supply (typically 3.3V)",
      "SCL: I2C Clock Line",
      "SDA: I2C Data Line",
    ].join("\n"),
    datasheetUrl: "https://www.adafruit.com/datasheets/SSD1306.pdf",
  },
  {
    name: "MCP3008 (8-Channel 10-Bit ADC SPI)",
    aliases: ["MCP3008", "ADC", "MCP3008 ADC"],
    description: "Successive approximation 10-bit Analog-to-Digital Converter (ADC) with an on-board serial interface (SPI).",
    voltage: "2.7V to 5.5V",
    pinout: [
      "Left Side (Pins 1-8):",
      "  CH0 to CH7: Analog Input Channels 0 through 7",
      "Right Side (Pins 9-16, bottom to top):",
      "  Pin 9:  DGND (Digital Ground)",
      "  Pin 10: CS/SHDN (Chip Select/Shutdown - active low)",
      "  Pin 11: DIN (Serial Data Input from MCU / MOSI)",
      "  Pin 12: DOUT (Serial Data Output to MCU / MISO)",
      "  Pin 13: CLK (Serial Clock / SCK)",
      "  Pin 14: AGND (Analog Ground)",
      "  Pin 15: VREF (Reference Voltage Input)",
      "  Pin 16: VDD (Power Supply)",
    ].join("\n"),
    datasheetUrl: "https://ww1.microchip.com/downloads/en/DeviceDoc/MCU_ADC_MCP3008_DS21295D.pdf",
  },
  {
    name: "HC-SR04 (Ultrasonic Distance Sensor)",
    aliases: ["HC-SR04", "HCSR04", "ULTRASONIC"],
    description: "Ultrasonic ranging module provides 2cm - 400cm non-contact measurement function.",
    voltage: "5V (Note: Echo pin outputs 5V, use resistor divider for 3.3V MCUs)",
    pinout: [
      "VCC: +5V Power",
      "Trig: Trigger Input (send 10us high pulse to trigger measurement)",
      "Echo: Echo Output (duration of high pulse corresponds to distance)",
      "GND: Ground",
    ].join("\n"),
    datasheetUrl: "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf",
  },
  {
    name: "TMP36 (Analog Temperature Sensor)",
    aliases: ["TMP36", "TMP35", "TMP37", "TMP-36"],
    description: "Low voltage, precision centigrade temperature sensor. Outputs a voltage linearly proportional to Celsius temperature (10 mV/°C, 500 mV offset).",
    voltage: "2.7V to 5.5V",
    pinout: [
      "Flat side facing you (Pins 1-3 from left to right):",
      "  Pin 1: VCC (Power supply)",
      "  Pin 2: VOUT (Analog voltage output)",
      "  Pin 3: GND (Ground)",
    ].join("\n"),
    datasheetUrl: "https://www.analog.com/media/en/technical-documentation/data-sheets/TMP35_36_37.pdf",
  },
  {
    name: "ESP32-WROOM-32 (Wi-Fi/BT MCU Module)",
    aliases: ["ESP32", "ESP32-WROOM", "ESP32-WROOM-32D", "ESP32-WROOM-32E"],
    description: "Powerful, generic Wi-Fi+BT+BLE MCU module that targets a wide variety of applications.",
    voltage: "3.0V to 3.6V (typically 3.3V)",
    pinout: [
      "Key Pinout Reference:",
      "  3V3, GND: Power & Ground",
      "  EN (CHIP_PU): Reset button input (active high, has pull-up)",
      "  I/O Pins (GPIOs 0-39): Note that GPIOs 34-39 are Input-Only pins and do not have internal pull-ups.",
      "  TXD0 / RXD0: UART Programming/Serial Debug interface pins.",
      "  GPIO21 (SDA) / GPIO22 (SCL): Default hardware I2C pins.",
      "  GPIO18 (SCK) / GPIO19 (MISO) / GPIO23 (MOSI) / GPIO5 (CS): Default hardware SPI pins.",
    ].join("\n"),
    datasheetUrl: "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf",
  },
];

export const HwPinoutDatasheetTool = Tool.define(
  "hw_pinout_datasheet",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: z.object({
        component: z.string().describe("The name of the component, chip, or sensor to lookup (e.g. 'DHT11', 'MCP3008')"),
      }),
      execute: (params: { component: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const compQuery = params.component.trim().toUpperCase()

          // Find exact or substring match in aliases
          const results = COMPONENT_DATABASE.filter(
            (c) =>
              c.name.toUpperCase().includes(compQuery) ||
              c.aliases.some((alias) => alias.toUpperCase() === compQuery || alias.toUpperCase().includes(compQuery))
          )

          if (results.length === 0) {
            // Provide a list of available components
            const list = COMPONENT_DATABASE.map((p) => p.name).join(", ")
            return {
              title: "hw_pinout_datasheet",
              metadata: { found: false, query: params.component, count: 0 },
              output: `No matching component or datasheet found in the local registry for "${params.component}".\nAvailable local component pinouts: ${list}`,
            }
          }

          // Format results
          const formatted = results
            .map((res) => {
              return [
                `Component: ${res.name}`,
                `Description: ${res.description}`,
                `Operating Voltage: ${res.voltage}`,
                `Pin Configuration:`,
                `${res.pinout}`,
                `Datasheet PDF: ${res.datasheetUrl}`,
              ].join("\n")
            })
            .join("\n\n---\n\n")

          return {
            title: "hw_pinout_datasheet",
            metadata: { found: true, query: params.component, count: results.length },
            output: formatted,
          }
        }),
    }
  })
)
