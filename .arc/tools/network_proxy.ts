import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export default tool({
  description: "Capture and inspect network traffic (HTTP/HTTPS) using a lightweight local proxy (via mitmproxy).",
  args: {
    duration: tool.schema.number().describe("Duration to record traffic in seconds."),
    port: tool.schema.number().optional().describe("Port to run the proxy on. Defaults to 8080.")
  },
  async execute(args, ctx) {
    const proxyPort = args.port || 8080;
    const tempDumpPath = path.join(os.tmpdir(), \`mitmdump_\${Date.now()}.txt\`);

    try {
      // Check if mitmdump is installed
      try {
        execSync("mitmdump --version", { stdio: "ignore" });
      } catch (e) {
        return "Error: 'mitmdump' (mitmproxy) is not installed or not in PATH. Please install it (e.g., 'pip install mitmproxy' or 'brew install mitmproxy') to use this tool.";
      }

      // Run mitmdump to capture traffic to a text file for the specified duration
      // Note: In Windows, timeout command doesn't easily send SIGTERM, so we use a node wrapper or just run it via powershell if possible.
      // Since we are in powershell environment (from previous bash commands), we can use Start-Process or similar, but let's use node's child_process.

      const scriptPath = path.join(os.tmpdir(), \`run_mitm_\${Date.now()}.mjs\`);
      const runnerCode = \`
import { spawn } from 'child_process';
import fs from 'fs';

const child = spawn('mitmdump', ['-p', '\${proxyPort}', '-w', '\${tempDumpPath}_raw', '--set', 'flow_detail=3'], {
  stdio: 'ignore',
  detached: true
});

setTimeout(() => {
  try { process.kill(-child.pid); } catch(e) {}
  try { child.kill(); } catch(e) {}
  process.exit(0);
}, \${args.duration * 1000});
\`;
      
      fs.writeFileSync(scriptPath, runnerCode);
      
      // We block while it captures
      execSync(\`node "\${scriptPath}"\`, { encoding: 'utf-8' });

      // mitmdump binary format can't be easily read, so we read the console output if we redirect it, 
      // or we just use tshark/tcpdump. Actually, mitmdump can read the file and output text.
      if (fs.existsSync(\`\${tempDumpPath}_raw\`)) {
         const readCmd = \`mitmdump -nr "\${tempDumpPath}_raw" --set flow_detail=2\`;
         try {
           const result = execSync(readCmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
           return result ? result : "No traffic captured.";
         } catch(e: any) {
           // mitmdump returns non-zero sometimes when reading ends
           return e.stdout?.toString() || "Error reading capture file.";
         }
      } else {
        return "Failed to capture traffic (capture file not created).";
      }

    } catch (error: any) {
      return \`Network Proxy Failed: \${error.message}\`;
    } finally {
      // cleanup
      try { if (fs.existsSync(\`\${tempDumpPath}_raw\`)) fs.unlinkSync(\`\${tempDumpPath}_raw\`); } catch(e){}
    }
  },
});
