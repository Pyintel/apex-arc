import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export default tool({
  description: "Spin up a Language Server (LSP) for a specific project and query it for symbols, references, or type definitions.",
  args: {
    language: tool.schema.string().enum(["typescript", "python", "go"]).describe("The language of the project."),
    filePath: tool.schema.string().describe("The absolute path to the file you want to query."),
    line: tool.schema.number().describe("The 0-indexed line number."),
    character: tool.schema.number().describe("The 0-indexed character position."),
    queryType: tool.schema.string().enum(["hover", "references", "definition"]).describe("The type of LSP query.")
  },
  async execute(args, ctx) {
    // Note: Implementing a full LSP client inside a synchronous tool execution is highly complex.
    // We will use a lightweight wrapper script (using a CLI LSP client tool like `type-coverage` for TS, or raw tsserver commands)
    // For TypeScript, we can use `tsserver` directly via a Node.js wrapper.

    if (args.language !== "typescript") {
      return "Only 'typescript' is currently implemented for this prototype tool.";
    }

    const scriptPath = path.join(os.tmpdir(), \`ts_lsp_query_\${Date.now()}.mjs\`);
    
    // A tiny script that talks to tsserver using its JSON protocol via stdin/stdout
    const runnerCode = \`
import { spawn } from 'child_process';
import path from 'path';

const tsserverPath = 'npx tsserver'; // Requires typescript to be installed

const child = spawn('npx', ['tsserver'], {
  stdio: ['pipe', 'pipe', 'ignore'],
  shell: process.platform === 'win32'
});

let responseBuffer = '';
let isResolved = false;

child.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // tsserver sends messages wrapped in Content-Length headers
  if (responseBuffer.includes('{"seq":0,"type":"response"')) {
     const lines = responseBuffer.split('\\n');
     for (const line of lines) {
       if (line.startsWith('{')) {
         try {
           const parsed = JSON.parse(line);
           if (parsed.success && !isResolved) {
              console.log(JSON.stringify(parsed.body, null, 2));
              isResolved = true;
              child.kill();
              process.exit(0);
           }
         } catch(e) {}
       }
     }
  }
});

// Send open command
const openCmd = JSON.stringify({
  seq: 0,
  type: "request",
  command: "open",
  arguments: { file: "\${args.filePath.replace(/\\\\/g, '\\\\\\\\')}" }
});
child.stdin.write(openCmd + '\\n');

let targetCommand = "";
if ("\${args.queryType}" === "hover") {
  targetCommand = "quickinfo";
} else if ("\${args.queryType}" === "references") {
  targetCommand = "references";
} else if ("\${args.queryType}" === "definition") {
  targetCommand = "definition";
}

const reqCmd = JSON.stringify({
  seq: 1,
  type: "request",
  command: targetCommand,
  arguments: {
    file: "\${args.filePath.replace(/\\\\/g, '\\\\\\\\')}",
    line: \${args.line + 1}, // tsserver is 1-indexed for lines
    offset: \${args.character + 1}
  }
});

setTimeout(() => {
  child.stdin.write(reqCmd + '\\n');
}, 500); // wait for open to process

setTimeout(() => {
  if (!isResolved) {
    console.log("LSP Timeout.");
    child.kill();
    process.exit(1);
  }
}, 5000);
\`;

    try {
      fs.writeFileSync(scriptPath, runnerCode);
      const result = execSync(\`node "\${scriptPath}"\`, { encoding: 'utf-8', cwd: ctx.directory });
      return result.trim();
    } catch (error: any) {
      return \`LSP Query Failed. Make sure 'typescript' is installed in your project.\\nError: \${error.message}\\nOutput: \${error.stdout?.toString()}\`;
    } finally {
      if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    }
  },
});
