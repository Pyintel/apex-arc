# Arc Module Track

This document defines the planned and published modules for the Pyintel Arc ecosystem. Each module is an independently published NPM package under `@pyintel/arc-module-*` and is discoverable via the Arc module registry.

---

## Module Discovery

Arc discovers modules dynamically by:
1. Searching the NPM registry for `scope:pyintel keywords:pyintel-arc-module`
2. Checking GitHub Packages at `npm.pkg.github.com` for `@pyintel` scoped packages
3. Loading any user-added custom modules from `custom_registry.json`
4. Detecting locally installed modules from the Arc data directory

There are **no hardcoded modules** in Arc core. All modules are discovered at runtime.

---

## Published Modules

### ✅ `@pyintel/arc-module-google-workspace`
**Package**: `@pyintel/arc-module-google-workspace`
**Repo**: Pyintel/open-google-workspace
**Status**: Published v1.0.5

**What it does:**
- Multi-user OAuth 2.0 login & token management (auth_login, auth_logout, auth_list_accounts)
- Gmail automation: send, search, read, label, and archive emails
- Google Drive: upload, download, list, search, and share files
- Google Docs: create, read, update documents
- Google Sheets: read/write ranges, append rows, batch update
- Google Calendar: create, list, update, delete events
- Routes OAuth callback through https://auth.pyintel.cc/oauth/callback

---

## Planned Modules

### 🔲 `@pyintel/arc-module-board-registry`
**Repo**: Pyintel/open-board-registry
**Status**: Planned

**What it does:**
- Vector-searchable database of 1,700+ microcontroller dev boards
- Pinout lookup for any board (ESP32, Raspberry Pi Pico, Arduino, STM32, etc.)
- Filter boards by MCU, RAM, Flash, connectivity, and framework support
- Returns structured JSON specs for use in hardware design workflows

### 🔲 `@pyintel/arc-module-hardware-toolchain`
**Repo**: Pyintel/open-hardware-toolchain
**Status**: Planned

**What it does:**
- Auto-detect connected USB/Serial devices (ESP32, Pico, Arduino, etc.)
- Flash firmware to microcontrollers using esptool, avrdude, picotool
- Open interactive MicroPython REPL sessions
- Monitor serial output (UART) from connected devices

### 🔲 `@pyintel/arc-module-document-media-suite`
**Repo**: Pyintel/open-document-media-suite
**Status**: Planned

**What it does:**
- PDF operations: merge, split, rotate, extract pages, compress
- Word/PowerPoint/Excel reader: extract text and structured content
- Audio/video format conversion (MP4, MP3, WAV, WEBM, etc.)
- OCR extraction from scanned PDFs and images

### 🔲 `@pyintel/arc-module-robotics-simulators`
**Repo**: Pyintel/open-robotics-simulators
**Status**: Planned

**What it does:**
- ROS 2 node/topic/service graph inspection
- URDF/SDF robot model kinematics parsing and joint analysis
- MuJoCo and PyBullet simulation environment control
- Robot state visualization and trajectory playback

### 🔲 `@pyintel/arc-module-science-bioinformatics`
**Repo**: Pyintel/open-science-bioinformatics
**Status**: Planned

**What it does:**
- PubMed literature search and abstract fetching
- PubChem and ChEMBL drug/compound database queries
- UniProt protein metadata, function annotations, and sequences
- AlphaFold structure confidence (pLDDT) analysis
- PDB 3D structure search and download
- gnomAD variant allele frequency queries

### 🔲 `@pyintel/arc-module-design-system`
**Repo**: Pyintel/open-design-system
**Status**: Planned

**What it does:**
- Generate glassmorphism and dark-mode UI mockups from text descriptions
- Design token engine: export color palettes, spacing, typography tokens
- HTML/CSS component generator for common UI patterns
- Visual asset generation (icons, backgrounds, patterns)

---

## Module Lifecycle

Planned -> In Development -> Published (GitHub Packages + NPM) -> Installed in Arc

### Publishing a New Module

Every Arc module must:
1. Have a package.json with name `@pyintel/arc-module-<name>`
2. Include keywords `["pyintel-arc-module", "arc-module"]`
3. Include an ARC/config.json manifest
4. Have .github/workflows/publish.yml publishing to both NPM and GitHub Packages on version tags
5. Export tools via a tools/ directory following the Arc tool schema
