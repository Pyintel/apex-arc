import { describe, expect, test } from "bun:test"
import { parseOllamaResponse, type VisionResult } from "../../src/vision/provider"
import { VisionProviderSchema } from "../../src/config/vision"

describe("process_image config", () => {
  test("VisionProviderSchema has sensible defaults", () => {
    const config = VisionProviderSchema.parse({})
    expect(config.provider).toBe("none")
    expect(config.base_url).toBe("http://localhost:11434")
    expect(config.model).toBe("llava")
    expect(config.timeout_ms).toBe(30_000)
    expect(config.api_key).toBeUndefined()
  })

  test("VisionProviderSchema accepts ollama provider", () => {
    const config = VisionProviderSchema.parse({
      provider: "ollama",
      base_url: "http://localhost:11434",
      model: "llava-llama3",
    })
    expect(config.provider).toBe("ollama")
    expect(config.model).toBe("llava-llama3")
  })

  test("VisionProviderSchema accepts cloud provider with api_key", () => {
    const config = VisionProviderSchema.parse({
      provider: "cloud",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o",
      api_key: "sk-test-key",
    })
    expect(config.provider).toBe("cloud")
    expect(config.api_key).toBe("sk-test-key")
  })
})

describe("parseOllamaResponse", () => {
  test("parses schematic detection with components", () => {
    const raw = [
      "This is a circuit schematic showing a basic amplifier circuit.",
      "detected: resistor, capacitor, transistor, LED",
      "R1 - 85%",
      "C1 - 92%",
      "Q1 - 78%",
      "LED1 - 95%",
    ].join("\n")

    const result = parseOllamaResponse(raw)

    expect(result.diagram_type).toBe("schematic")
    expect(result.description).toContain("schematic")
    expect(result.detected_objects).toContain("resistor")
    expect(result.detected_objects).toContain("capacitor")
    expect(result.detected_objects).toContain("transistor")
    expect(result.detected_objects).toContain("led")
    expect(result.components.length).toBeGreaterThan(0)

    const r1 = result.components.find((c) => c.label.includes("r1"))
    expect(r1).toBeDefined()
    expect(r1!.confidence).toBeCloseTo(0.85, 2)
  })

  test("parses PCB detection", () => {
    const raw = "This is a PCB with a microcontroller, capacitors, and a crystal oscillator."
    const result = parseOllamaResponse(raw)

    expect(result.diagram_type).toBe("pcb")
    expect(result.detected_objects).toContain("microcontroller")
    expect(result.detected_objects).toContain("capacitor")
    expect(result.detected_objects).toContain("crystal")
  })

  test("parses datasheet pinout", () => {
    const raw = "Datasheet pinout diagram for an ATmega328P microcontroller chip."
    const result = parseOllamaResponse(raw)

    expect(result.diagram_type).toBe("datasheet")
    expect(result.detected_objects).toContain("microcontroller")
  })

  test("parses photo", () => {
    const raw = "A photo of a robotic arm on a workbench. The image shows a motor and servo."
    const result = parseOllamaResponse(raw)

    expect(result.diagram_type).toBe("photo")
    expect(result.detected_objects).toContain("motor")
    expect(result.detected_objects).toContain("servo")
  })

  test("defaults to unknown for ambiguous content", () => {
    const raw = "Some random text that doesn't mention any specific diagram type."
    const result = parseOllamaResponse(raw)

    expect(result.diagram_type).toBe("unknown")
    expect(result.detected_objects).toHaveLength(0)
  })

  test("extracts OCR text from lines", () => {
    const raw = [
      "text: VCC = 3.3V, GND = 0V",
      "Found label: Arduino Uno",
      "A very long line that should be captured as it provides useful context about the image content being analyzed",
    ].join("\n")

    const result = parseOllamaResponse(raw)
    expect(result.ocr_text.length).toBeGreaterThan(0)
  })

  test("parses components with confidence scores", () => {
    const raw = [
      "schematic circuit diagram",
      "resistor - 90%",
      "capacitor - 85.5%",
      "inductor - 72%",
    ].join("\n")

    const result = parseOllamaResponse(raw)
    const resistor = result.components.find((c) => c.label.includes("resistor"))
    expect(resistor).toBeDefined()
    expect(resistor!.confidence).toBeCloseTo(0.9, 2)

    const capacitor = result.components.find((c) => c.label.includes("capacitor"))
    expect(capacitor).toBeDefined()
    expect(capacitor!.confidence).toBeCloseTo(0.855, 2)
  })

  test("empty input returns safe defaults", () => {
    const result = parseOllamaResponse("")
    expect(result.diagram_type).toBe("unknown")
    expect(result.detected_objects).toHaveLength(0)
    expect(result.components).toHaveLength(0)
    expect(result.ocr_text).toBe("")
    expect(result.description).toBe("")
  })

  test("VisionResult type shape matches expected structure", () => {
    const result: VisionResult = {
      ocr_text: "test",
      detected_objects: ["resistor"],
      description: "a test image",
      diagram_type: "schematic",
      components: [{ label: "resistor", confidence: 0.9 }],
    }
    expect(result.ocr_text).toBe("test")
    expect(result.diagram_type).toBe("schematic")
    expect(result.components[0].confidence).toBe(0.9)
  })
})
