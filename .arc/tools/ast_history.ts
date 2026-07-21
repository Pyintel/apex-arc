import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";
import * as path from "path";

export default tool({
  description: "Track the deep git history of a specific function or keyword across time to find when and why it was introduced.",
  args: {
    filePath: tool.schema.string().describe("Path to the file to investigate."),
    searchString: tool.schema.string().describe("The function name, variable name, or specific string to trace."),
    mode: tool.schema.string().enum(["history", "blame"]).describe("history: search commit history for string additions/deletions. blame: show who last modified each line.")
  },
  async execute(args, ctx) {
    try {
      if (args.mode === "blame") {
        const cmd = \`git blame "\${args.filePath}"\`;
        return execSync(cmd, { cwd: ctx.directory, encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 });
      }

      if (args.mode === "history") {
        // -S looks for commits that change the number of occurrences of a string
        // -p shows the patch
        const cmd = \`git log -S "\${args.searchString}" -p "\${args.filePath}" | head -n 2000\`;
        const result = execSync(cmd, { cwd: ctx.directory, encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 });
        if (!result.trim()) {
           return "No history found for this string in this file.";
        }
        return result;
      }
      
      return "Invalid mode.";
    } catch (error: any) {
      return \`Git trace failed: \${error.message}\\n\${error.stderr?.toString()}\`;
    }
  },
});
