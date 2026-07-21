import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

export default tool({
  description: "Inspect Cloud Infrastructure states (currently supports basic Terraform state inspection).",
  args: {
    targetDir: tool.schema.string().describe("Directory containing the terraform state file or kubernetes configs.").optional(),
    command: tool.schema.string().enum(["tf-state-list", "tf-state-show"]).describe("The operation to perform."),
    resourceAddress: tool.schema.string().optional().describe("The resource address for tf-state-show (e.g., aws_instance.web)")
  },
  async execute(args, ctx) {
    const target = args.targetDir || ctx.directory;

    try {
      if (args.command.startsWith("tf-")) {
        try {
          execSync("terraform version", { stdio: "ignore" });
        } catch(e) {
          return "Terraform CLI is not installed or not in PATH.";
        }
      }

      if (args.command === "tf-state-list") {
        const cmd = \`terraform state list\`;
        const result = execSync(cmd, { cwd: target, encoding: 'utf-8' });
        return result || "No resources found in state.";
      } else if (args.command === "tf-state-show") {
        if (!args.resourceAddress) return "Error: resourceAddress is required for tf-state-show.";
        const cmd = \`terraform state show "\${args.resourceAddress}"\`;
        const result = execSync(cmd, { cwd: target, encoding: 'utf-8' });
        return result || "Resource not found.";
      }
      
      return "Unsupported infrastructure command.";
    } catch (error: any) {
      return \`Infra State Query Failed: \${error.message}\\nOutput: \${error.stderr?.toString() || error.stdout?.toString()}\`;
    }
  },
});
