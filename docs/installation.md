# Apex Arc Installation Guide

This guide covers clean installs for Windows, macOS, and Linux. The recommended path for all platforms is the npm package:

```bash
npm install -g @pyintel/arc@latest
```

The global package installs two equivalent commands:

```bash
arc
apex-arc
```

## Requirements

Install a current Node.js release before installing Apex Arc. Node includes npm, which is used to install the CLI wrapper and the matching native binary package for your platform.

Recommended baseline:

- Node.js 20 or newer
- npm 10 or newer
- A terminal with network access to `https://registry.npmjs.org`

Check your environment:

```bash
node --version
npm --version
```

## Windows

Use PowerShell or Windows Terminal.

1. Install Node.js from the official installer or with winget:

```powershell
winget install OpenJS.NodeJS.LTS
```

2. Restart your terminal so `node` and `npm` are on `PATH`.

3. Install Apex Arc:

```powershell
npm install -g @pyintel/arc@latest
```

4. Verify the installed version:

```powershell
arc --version
```

5. Start the TUI:

```powershell
arc
```

Expected package version for this release:

```text
0.2.21
```

### Windows Troubleshooting

If running `npm` or `arc` produces a PowerShell security error like:
> `npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.`

Allow script execution for your user account by running this command in PowerShell:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Select `Y` when prompted. Alternatively, run commands from **Command Prompt (`cmd.exe`)** where `.cmd` shims run without PowerShell script execution restrictions.

If `arc` is not recognized, npm's global bin directory is not on `PATH`. Check it with:

```powershell
npm prefix -g
```

The command shim is usually installed under:

```text
%APPDATA%\npm
```

Add that directory to your user `PATH`, then open a new terminal.

If a previous install crashes on startup, reinstall the latest package:

```powershell
npm uninstall -g @pyintel/arc
npm cache verify
npm install -g @pyintel/arc@latest
arc --version
arc
```

If npm reports permission errors, run the terminal normally first. Only use an elevated Administrator terminal if your Node installation was set up for machine-wide global packages.

## macOS

Use Terminal, iTerm2, or another shell.

1. Install Node.js. Homebrew is the simplest path:

```bash
brew install node
```

2. Install Apex Arc:

```bash
npm install -g @pyintel/arc@latest
```

3. Verify the install:

```bash
arc --version
```

4. Start the TUI:

```bash
arc
```

If the `arc` command is not found, inspect npm's global bin path:

```bash
npm prefix -g
```

For Homebrew Node on Apple Silicon, global binaries are commonly under:

```text
/opt/homebrew/bin
```

For Intel Macs, they are commonly under:

```text
/usr/local/bin
```

Make sure the matching directory is on `PATH`.

## Linux

Use your distribution package manager, NodeSource packages, `nvm`, or another trusted Node.js installer.

Ubuntu and Debian example using NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Fedora example:

```bash
sudo dnf install nodejs npm
```

Arch example:

```bash
sudo pacman -S nodejs npm
```

Install Apex Arc:

```bash
npm install -g @pyintel/arc@latest
```

Verify and run:

```bash
arc --version
arc
```

If npm global installs require `sudo`, consider using `nvm` or configuring an npm user prefix instead of installing global packages as root.

## Local Project Install

For testing without a global install:

```bash
npm install @pyintel/arc@latest
npx arc --version
npx arc
```

This installs Apex Arc into the current project's `node_modules` and does not add `arc` to your shell `PATH`.

## Upgrade

Upgrade to the newest published package:

```bash
npm install -g @pyintel/arc@latest
```

Confirm the resolved version:

```bash
arc --version
npm view @pyintel/arc version
```

## Uninstall

Remove the global package:

```bash
npm uninstall -g @pyintel/arc
```

Confirm the command was removed:

```bash
arc --version
```

The final command should fail with a command-not-found style message after uninstall.

## What npm Installs

The `@pyintel/arc` package is a small JavaScript wrapper. During install, npm also installs one platform-specific optional dependency, such as:

- `@pyintel/apex-arc-windows-x64`
- `@pyintel/apex-arc-darwin-arm64`
- `@pyintel/apex-arc-linux-x64`

The wrapper chooses the correct native binary when you run `arc` or `apex-arc`.

## Verification Checklist

Use this checklist for new machines and VMs:

```bash
node --version
npm --version
npm view @pyintel/arc version
npm install -g @pyintel/arc@latest
arc --version
arc --help
arc
```

For Windows validation of the current startup fix, `arc --version` should print:

```text
0.2.21
```

Then bare `arc` should open the terminal UI instead of crashing during startup.
