import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";

export default tool({
  description: "Decompile or disassemble binary files (ELF, PE, Mach-O, WASM) into human-readable pseudocode or assembly.",
  args: {
    filePath: tool.schema.string().describe("Absolute path to the binary file."),
    mode: tool.schema.string().enum(["disassemble", "strings", "wasm"]).describe("The mode: disassemble (uses objdump), strings (extracts text), wasm (uses wasm2wat).")
  },
  async execute(args, ctx) {
    try {
      if (args.mode === "strings") {
        const cmd = \`strings "\${args.filePath}" | head -n 500\`;
        return execSync(cmd, { encoding: "utf-8" });
      } 
      
      if (args.mode === "wasm") {
        try {
          execSync("wasm2wat --version", { stdio: "ignore" });
        } catch (e) {
          return "wasm2wat is not installed. Please install WABT (WebAssembly Binary Toolkit).";
        }
        const cmd = \`wasm2wat "\${args.filePath}"\`;
        return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      }
      
      if (args.mode === "disassemble") {
        try {
          // macOS/Linux generally have objdump. Windows might have it via MinGW/Git Bash.
          execSync("objdump --version", { stdio: "ignore" });
        } catch (e) {
          return "objdump is not installed or not in PATH.";
        }
        // Disassemble and truncate to prevent massive outputs blowing up context limits
        const cmd = \`objdump -d "\${args.filePath}" | head -n 1000\`;
        return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      }

      return "Invalid mode.";
    } catch (error: any) {
      return \`Binary analysis failed: \${error.message}\\n\${error.stderr?.toString()}\`;
    }
  },
});
