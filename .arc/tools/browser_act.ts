import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export default tool({
  description: "Automate a headless browser (using Playwright) to navigate, interact, and extract data from web pages.",
  args: {
    script: tool.schema.string().describe("A JavaScript script body to execute in the browser context. It runs within an async function where 'page' (Playwright Page object) and 'browser' are available. Return the result you want. Example: await page.goto('https://example.com'); return await page.title();"),
    installPlaywright: tool.schema.boolean().optional().describe("Set to true if Playwright needs to be installed first.")
  },
  async execute(args, ctx) {
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, `browser_act_${Date.now()}.mjs`);
    const packageJsonPath = path.join(tempDir, 'package.json');
    
    // Ensure we have a package.json in the temp dir so npx works smoothly
    if (!fs.existsSync(packageJsonPath)) {
      fs.writeFileSync(packageJsonPath, JSON.stringify({ name: "temp-browser-act", type: "module" }));
    }

    const runnerCode = `
import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    const result = await (async () => {
      ${args.script}
    })();
    
    console.log(JSON.stringify({ success: true, data: result }));
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error.message, stack: error.stack }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
`;

    try {
      fs.writeFileSync(scriptPath, runnerCode);
      
      let installCmd = "";
      if (args.installPlaywright) {
        installCmd = `cd "${tempDir}" && npm install playwright && npx playwright install chromium && `;
      }

      // We run the script using node with npx to resolve playwright
      const result = execSync(`${installCmd}cd "${tempDir}" && npx -y playwright@latest test --version > /dev/null 2>&1 || npm install playwright && node "${scriptPath}"`, {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      try {
        const parsed = JSON.parse(result.trim());
        if (parsed.success) {
          return JSON.stringify(parsed.data, null, 2);
        } else {
          return \`Browser Error: \${parsed.error}\`;
        }
      } catch (e) {
        // If it didn't return valid JSON, just return the raw output
        return result.trim();
      }
    } catch (error: any) {
      return \`Execution Failed: \${error.message}\\nOutput: \${error.stdout?.toString()}\\nError Output: \${error.stderr?.toString()}\`;
    } finally {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    }
  },
});
