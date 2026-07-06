# MiMoCode Feature Roadmap

This document outlines the detailed breakdown, technical specifications, and prioritizations for the 10 dream features to build the ultimate agentic CLI.

## Phase 1: Context Efficiency & Navigation (Highest Priority)

### 1. LSP (Language Server Protocol) Integration Tool {DONE}
*   **Why:** Drastically improves code traversal precision.
*   **Spec:** A tool that interfaces with background language servers (like tsserver, gopls, pyright, rust-analyzer). It should export commands like `lsp_go_to_definition`, `lsp_find_references`, `lsp_get_hover_type`, and `lsp_get_diagnostics`.

### 2. Local Code Graph & Semantic Vector Index {DONE}
*   **Why:** Saves context window space by supplying semantic matching rather than raw keyword searches.
*   **Spec:** Run a local background worker/daemon that builds an AST call graph and matches file paths/code snippets to a local vector store (e.g., using lightweight local embeddings).

### 3. Smart "Context Treeshaking" {DONE}
*   **Why:** Prevents token overflow when analyzing files we don't need to write to.
*   **Spec:** A filter in the file-reading tool that parses code files and strips out function/method implementation bodies, leaving only imports, class names, function signatures, and exports (a "skeleton" outline).

## Phase 2: Safe Execution & Modification

### 4. AST-Based (Abstract Syntax Tree) Safe Editor
*   **Why:** Avoids line-matching failures when files are modified or auto-formatted.
*   **Spec:** A modification tool that parses files (via Babel/Tree-sitter) and applies structural changes directly on the node tree (e.g., `ast_add_import`, `ast_rename_variable`, `ast_replace_function`).

### 5. Isolated Sandbox & Test Execution Environment (TDD Loop)
*   **Why:** Isolates workspace changes until tests pass.
*   **Spec:** Spin up microVMs (like Firecracker) or WebAssembly containers where code runs and tests execute securely before any code changes are written to the host user's disk.

### 6. Interactive Shell Stream Interceptor
*   **Why:** Allows interaction with long-running scripts and interactive terminal prompts (like package manager init commands).
*   **Spec:** Build duplex stream pipelines that capture stdout/stderr in real-time, can parse for prompt conditions, and write back into stdin dynamically.

## Phase 3: Visual & UX Integration

### 7. Headless Browser Visual Feedback Loop
*   **Why:** Essential for building frontend interfaces.
*   **Spec:** Integrate a lightweight Puppeteer or Playwright instance. If a local web server is detected, the agent should open it, navigate/test components, take screenshots, and process them via multimodal models.

### 8. Direct IDE State Synchronization (VS Code/Cursor Sync)
*   **Why:** Seamless UX between IDE and CLI.
*   **Spec:** A local IPC/WebSocket bridge plugin that synchronizes editor state (currently open tabs, cursor position, active selections) with the CLI context.

## Phase 4: Adaptability & Consensus

### 9. Multi-Agent Consensus / Adversarial Planning
*   **Why:** Avoids logical dead-ends.
*   **Spec:** A pipeline pattern where multiple agents plan, challenge (adversarially analyze), and refine the architecture before implementation begins.

### 10. Local Preference Learning & Custom Code Style Linters
*   **Why:** Aligns code conventions automatically.
*   **Spec:** A vector-based local profile registry that tracks user instructions/corrections (e.g., "always use standard import order") and injects them as custom system directives.

---

## Phase 5: Advanced JARVIS Engineering Capabilities

### 11. Live Debugger & Runtime State Attachment
*   **Why:** Eliminates guesswork debugging by allowing runtime inspection.
*   **Spec:** Ability to attach to a running process (Node, Python, Go, etc.) via inspector protocols, set dynamic breakpoints, inspect the live call stack, query variable states in memory, and hot-patch code in memory.

### 12. Linter & Compiler Loop Stream (Auto-Fixer)
*   **Why:** Keeps codebase clean and fixes warnings before they compile.
*   **Spec:** Event-driven background process connected to tools like `eslint`, `tsc`, or `rustc`. Streams compiler warnings in real-time and prepares auto-fix patches.

### 13. Autonomous Performance & Load Profiler
*   **Why:** Catches performance regression and hot-spots before deployment.
*   **Spec:** Run performance benchmarks, flame graphs, and load tests (like `k6` or `clinic.js`) on new endpoints or modified functions and flag latency issues.

### 14. Self-Healing Test Suite & Flaky Test Detector
*   **Why:** Assures high quality test suites and eliminates flaky test runs.
*   **Spec:** Run tests repeatedly under different environment parameters/seeds to isolate race conditions and dynamically generate proposed fixes for tests or modules.

### 15. Visual DOM Inspector & Design-Token Aligner
*   **Why:** Verifies visual interface logic against strict design systems.
*   **Spec:** Parse DOM trees, computed styles, and compare them against styling guidelines (Tailwind configs/tokens) to highlight responsive design bugs and layout bugs.

---

## Phase 6: Hardware Co-Pilot & Physical Computing

### 16. Serial Port & Board Auto-Discovery (`hw_list_devices`) {DONE}
*   **Why:** Auto-configures flash/serial channels without user intervention.
*   **Spec:** Interface with the host USB/Serial controller (using `serialport` or system binaries) to auto-detect Vendor/Product IDs and match connected microcontrollers (ESP32, Arduino, Pico).

### 17. Native Compiler & Burner Tool (`hw_flash`) {DONE}
*   **Why:** Compiles and flashes code to target silicon natively.
*   **Spec:** Direct wrappers for compilation and binary flashing tools (`arduino-cli compile --upload`, `esptool.py`, CircuitPython/MicroPython mass-storage code copy/sync).

### 18. Interactive Serial Monitor & WebREPL (`hw_serial_monitor`) {DONE}
*   **Why:** Critical for diagnostics, runtime exceptions, and interacting with board-level CLI systems.
*   **Spec:** Establish duplex serial connections at custom bauds (9600, 115200) to stream print statements and capture exceptions. Integrates with MicroPython/CircuitPython REPL to run commands on-the-fly.

### 19. Wokwi Simulator Sandbox (Virtual Verification)
*   **Why:** Acts as a safe verification suite, protecting microcontrollers from flash wear and bad pin configurations.
*   **Spec:** Integration with local headless emulator setups (like Wokwi CLI) to verify pin layouts, logic flows, and hardware bus protocols (I2C, SPI) before writing code to physical chips.

### 20. Multimodal Vision Feedback ("The Camera Hook")
*   **Why:** Direct visual confirmation of physical board state.
*   **Spec:** Pull webcam snaps from the developer's workstation to visually inspect LEDs, screens, or wiring configurations and troubleshoot hardware issues.

### 21. Microcontroller/Board Metadata & Reference Database
*   **Why:** Allows the agent to query pinouts, specs, capabilities, and configurations for specific microcontrollers dynamically without wasting context window or guessing.
*   **Spec:** Build a local database containing information on all supported boards (e.g., ESP32, Arduino Uno, Adafruit Circuit Playground, Raspberry Pi Pico). Introduce a tool `hw_get_board_info` that allows querying specific board metadata, pins, and flash protocols directly from this database.

### 22. In-TUI Split-Window Live Serial Monitor Panel
*   **Why:** Allows the developer to see the live output from their board in a split panel inside the terminal user interface side-by-side with the chat.
*   **Spec:** Extend the TUI routes layout to support split panels using `@opentui/solid`. Integrate a persistent background stream listener that hooks into `hw_serial_monitor` and dynamically writes updates to a SolidJS state store so that incoming serial logs render in real-time in the split panel.

---

## Phase 7: Context-Optimized Hardware Discovery & Interaction Tools

Watching the agent wrestle with raw PowerShell `Get-CimInstance` commands just to verify a board's identity was painful. It got stuck in a loop of syntax errors, and relying on it to parse massive, unformatted HTML dumps from Adafruit's storefront to figure out if a board has a screen is a massive drain on your context window and execution time.

To make your CLI the definitive agentic tool for electronics development, you need to abstract the hardware interactions and optimize how the AI gathers documentation. Here are the specific tools you should add to the ecosystem to fix the bottlenecks seen in this session.

### 23. `hw_inspect_device` (Native USB/Serial Wrapper)

**The Problem:** The AI attempted to run raw PowerShell scripts to get PnP device info, hallucinated incorrect syntax (`\.Caption`), and wasted dozens of seconds and tokens failing to get basic port metadata.
**The Solution:** Build a tool that wraps a robust library (like Node.js `usb` or `serialport` packages) to natively query the host OS.

* **Input:** Optional port name (e.g., `COM7`).
* **Output:** Clean JSON containing Vendor ID, Product ID, Manufacturer, Serial Number, and standard device class. The AI should never need to write its own bash/PowerShell scripts just to check what is plugged into the computer.

### 24. `hw_board_registry` (Structured Hardware Database)

**The Problem:** The AI had to `webfetch` the Adafruit product page and read through thousands of lines of raw HTML, CSS, and SEO tags just to figure out the board's features and whether it had a screen.
**The Solution:** Create a tool that queries a structured database (like the PlatformIO Board Registry API or a custom JSON manifest of popular dev boards).

* **Input:** VID/PID (e.g., `239A:8036`) or board name.
* **Output:** A concise JSON object mapping the board's exact capabilities: MCU architecture, RAM/Flash limits, pinouts (I2C, SPI, UART), operating voltage, and integrated peripherals (screens, NeoPixels, sensors). This prevents hardware misidentifications (like the AI insisting on the Circuit Playground when you meant the PyPortal).

### 25. `web_fetch_markdown` (Clean Documentation Scraper)

**The Problem:** The standard `webfetch` tool dumped an enormous, token-heavy payload of raw HTML. This confuses the LLM and pushes important hardware specs out of the context window.
**The Solution:** Replace or supplement your web fetcher with a tool that converts web pages to clean Markdown before feeding them to the AI. Strip out all navigation, scripts, and styling so the agent only reads the actual text, guides, and FAQ answers.

### 26. `hw_repl_interact` (Serial Console Controller)

**The Problem:** Your AI has `hw_serial_monitor` and `hw_flash`, but interacting with CircuitPython/MicroPython boards like the PyPortal requires active REPL interaction, not just passive monitoring.
**The Solution:** A tool that allows the AI to open a serial connection, send Python commands directly to the board's REPL, and read the output.

* **Use Case:** The AI could instantly query `import os; os.uname()` directly on the board to figure out *exactly* what hardware is plugged in, bypassing the host OS's generic USB names entirely.

### 27. `hw_pinout_datasheet` (Component Lookup)

**The Problem:** When circuiting, developers need immediate access to pin diagrams and electrical tolerances.
**The Solution:** A tool specifically designed to fetch component pinouts or link to PDF datasheets for specific chips, sensors, or dev boards. If the AI is going to write code or tell you how to wire something, it needs a direct line to the electrical specs, not a generic web search.




