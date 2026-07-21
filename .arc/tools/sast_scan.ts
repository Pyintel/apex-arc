import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";

export default tool({
  description: "Run Static Application Security Testing (SAST) to find vulnerabilities (requires Semgrep or Trivy installed).",
  args: {
    targetDir: tool.schema.string().describe("Directory to scan (defaults to current project root).").optional(),
    toolName: tool.schema.string().enum(["semgrep", "trivy", "npm-audit"]).describe("The scanning tool to use.")
  },
  async execute(args, ctx) {
    const target = args.targetDir || ctx.directory;

    try {
      if (args.toolName === "npm-audit") {
         const cmd = \`npm audit --json\`;
         try {
           const result = execSync(cmd, { cwd: target, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
           return result;
         } catch (e: any) {
           // npm audit returns non-zero if vulnerabilities are found
           return e.stdout?.toString() || e.message;
         }
      } else if (args.toolName === "semgrep") {
         try {
           // Check if semgrep exists
           execSync("semgrep --version", { stdio: "ignore" });
         } catch (e) {
           return "Semgrep is not installed. Please install it (e.g., 'pip install semgrep' or 'brew install semgrep').";
         }
         
         const cmd = \`semgrep scan --config auto --json "\${target}"\`;
         try {
            const result = execSync(cmd, { cwd: target, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
            // Summarize the JSON so we don't blow up context limits
            const parsed = JSON.parse(result);
            if (!parsed.results || parsed.results.length === 0) return "No vulnerabilities found by Semgrep.";
            
            const summary = parsed.results.map((r: any) => \`- [\${r.extra.severity}] \${r.path}:\${r.start.line} : \${r.extra.message}\`).join("\\n");
            return \`Semgrep found \${parsed.results.length} issues:\\n\\n\${summary}\`;
         } catch(e: any) {
            // Semgrep returns non-zero on findings
            try {
              const parsed = JSON.parse(e.stdout.toString());
              const summary = parsed.results.map((r: any) => \`- [\${r.extra.severity}] \${r.path}:\${r.start.line} : \${r.extra.message}\`).join("\\n");
              return \`Semgrep found \${parsed.results.length} issues:\\n\\n\${summary}\`;
            } catch(jsonErr) {
              return e.stdout?.toString() || e.message;
            }
         }
      } else if (args.toolName === "trivy") {
         // trivy fs .
         return "Trivy integration not fully implemented in this prototype.";
      }
      return "Unsupported scanner tool.";
    } catch (error: any) {
      return \`Security Scan Failed: \${error.message}\`;
    }
  },
});
