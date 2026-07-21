import { tool } from "@mimo-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  description: "Generate and save Mermaid.js or PlantUML architecture diagrams.",
  args: {
    syntax: tool.schema.string().describe("The raw Mermaid.js or PlantUML syntax code."),
    fileName: tool.schema.string().describe("The name of the file to save (e.g., architecture.md or flow.mmd).")
  },
  async execute(args, ctx) {
    try {
      const fullPath = path.join(ctx.directory, args.fileName);
      
      let content = args.syntax;
      // If saving as markdown, wrap it so the UI renders it
      if (args.fileName.endsWith(".md")) {
        content = \`# Architecture Diagram\\n\\n\`\`\`mermaid\\n\${args.syntax}\\n\`\`\`\\n\`;
      }
      
      fs.writeFileSync(fullPath, content);
      
      return \`Successfully generated and saved diagram to \${fullPath}. \\nIf this is a markdown file with Mermaid syntax, the UI will natively render it when viewed.\`;
    } catch (error: any) {
      return \`Failed to generate diagram: \${error.message}\`;
    }
  },
});
