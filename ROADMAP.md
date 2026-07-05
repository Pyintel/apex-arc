# MiMoCode Feature Roadmap

This document outlines the detailed breakdown, technical specifications, and prioritizations for the 10 dream features to build the ultimate agentic CLI.

## Phase 1: Context Efficiency & Navigation (Highest Priority)

### 1. LSP (Language Server Protocol) Integration Tool
*   **Why:** Drastically improves code traversal precision.
*   **Spec:** A tool that interfaces with background language servers (like tsserver, gopls, pyright, rust-analyzer). It should export commands like `lsp_go_to_definition`, `lsp_find_references`, `lsp_get_hover_type`, and `lsp_get_diagnostics`.

### 2. Local Code Graph & Semantic Vector Index
*   **Why:** Saves context window space by supplying semantic matching rather than raw keyword searches.
*   **Spec:** Run a local background worker/daemon that builds an AST call graph and matches file paths/code snippets to a local vector store (e.g., using lightweight local embeddings).

### 3. Smart "Context Treeshaking"
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

### 16. Serial Port & Board Auto-Discovery (`hw_list_devices`)
*   **Why:** Auto-configures flash/serial channels without user intervention.
*   **Spec:** Interface with the host USB/Serial controller (using `serialport` or system binaries) to auto-detect Vendor/Product IDs and match connected microcontrollers (ESP32, Arduino, Pico).

### 17. Native Compiler & Burner Tool (`hw_flash`)
*   **Why:** Compiles and flashes code to target silicon natively.
*   **Spec:** Direct wrappers for compilation and binary flashing tools (`arduino-cli compile --upload`, `esptool.py`, CircuitPython/MicroPython mass-storage code copy/sync).

### 18. Interactive Serial Monitor & WebREPL (`hw_serial_monitor`)
*   **Why:** Critical for diagnostics, runtime exceptions, and interacting with board-level CLI systems.
*   **Spec:** Establish duplex serial connections at custom bauds (9600, 115200) to stream print statements and capture exceptions. Integrates with MicroPython/CircuitPython REPL to run commands on-the-fly.

### 19. Wokwi Simulator Sandbox (Virtual Verification)
*   **Why:** Acts as a safe verification suite, protecting microcontrollers from flash wear and bad pin configurations.
*   **Spec:** Integration with local headless emulator setups (like Wokwi CLI) to verify pin layouts, logic flows, and hardware bus protocols (I2C, SPI) before writing code to physical chips.

### 20. Multimodal Vision Feedback ("The Camera Hook")
*   **Why:** Direct visual confirmation of physical board state.
*   **Spec:** Pull webcam snaps from the developer's workstation to visually inspect LEDs, screens, or wiring configurations and troubleshoot hardware issues.

