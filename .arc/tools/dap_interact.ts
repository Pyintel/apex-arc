import { tool } from "@mimo-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

export default tool({
  description: "Attach a Debug Adapter Protocol (DAP) like session to a Node.js process to freeze execution, evaluate variables, and return state.",
  args: {
    scriptPath: tool.schema.string().describe("The Node.js script to debug."),
    breakLine: tool.schema.number().describe("The line number to break on."),
    evaluateExpr: tool.schema.string().describe("The JS expression to evaluate when the breakpoint is hit (e.g., 'JSON.stringify(myVar)').")
  },
  async execute(args, ctx) {
    const tempRunner = path.join(os.tmpdir(), \`dap_runner_\${Date.now()}.mjs\`);
    
    // We write a wrapper that runs the target script via the Node inspector protocol locally
    const runnerCode = \`
import inspector from 'inspector';
import { Session } from 'inspector';
import fs from 'fs';
import path from 'path';

const session = new Session();
session.connect();

session.post('Debugger.enable', {}, (err) => {
  if (err) { console.error("DAP Error:", err); process.exit(1); }
  
  // Set breakpoint by url regex (matches the script file name loosely)
  const scriptName = path.basename("\${args.scriptPath.replace(/\\\\/g, '\\\\\\\\')}");
  session.post('Debugger.setBreakpointByUrl', {
    urlRegex: '.*' + scriptName.replace(/\\./g, '\\\\.') + '.*',
    lineNumber: \${args.breakLine - 1} // Inspector lines are 0-indexed
  }, (err, res) => {
    if (err) { console.error("Breakpoint setup failed:", err); process.exit(1); }
    
    // Once breakpoint is set, we require the file to run it
    process.nextTick(() => {
       try {
         import("file://\${args.scriptPath.replace(/\\\\/g, '/')}");
       } catch(e) {
         console.error("Failed to load target script:", e);
       }
    });
  });
});

session.on('Debugger.paused', (message) => {
  const callFrameId = message.params.callFrames[0].callFrameId;
  
  session.post('Debugger.evaluateOnCallFrame', {
    callFrameId: callFrameId,
    expression: "\${args.evaluateExpr}",
    returnByValue: true
  }, (err, result) => {
    if (err || result.exceptionDetails) {
       console.log("Evaluation Error:", err || result.exceptionDetails.exception.description);
    } else {
       console.log("Evaluation Result:", JSON.stringify(result.result.value, null, 2));
    }
    
    // Resume and exit
    session.post('Debugger.resume', () => {
      process.exit(0);
    });
  });
});

setTimeout(() => {
  console.log("DAP Timeout: Breakpoint was never hit.");
  process.exit(1);
}, 5000);
\`;

    try {
      fs.writeFileSync(tempRunner, runnerCode);
      const result = execSync(\`node "\${tempRunner}"\`, { encoding: "utf-8", cwd: ctx.directory });
      return result.trim();
    } catch (error: any) {
      return \`Debugger Failed: \${error.message}\\nOutput: \${error.stdout?.toString()}\\nError Output: \${error.stderr?.toString()}\`;
    } finally {
      if (fs.existsSync(tempRunner)) fs.unlinkSync(tempRunner);
    }
  },
});
