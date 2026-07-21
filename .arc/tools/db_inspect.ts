import { tool } from "@mimo-ai/plugin";
import { execSync } from "child_process";

export default tool({
  description: "Inspect the schema and run read-only queries against a database (PostgreSQL, MySQL, SQLite).",
  args: {
    connectionString: tool.schema.string().describe("The database connection string (e.g., postgresql://user:pass@localhost:5432/dbname, mysql://user:pass@localhost:3306/dbname, sqlite://./my.db)"),
    query: tool.schema.string().describe("The SQL query to execute. ONLY SELECT OR SCHEMA QUERIES ALLOWED."),
    type: tool.schema.string().enum(["postgresql", "mysql", "sqlite"]).describe("The type of database.")
  },
  async execute(args, ctx) {
    const isWriteQuery = /\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE)\\b/i.test(args.query);
    if (isWriteQuery) {
       return "Security Error: Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly forbidden in this tool. Use read-only queries.";
    }

    try {
      if (args.type === "postgresql") {
        // Requires psql to be installed
        const cmd = \`psql "\${args.connectionString}" -c "\${args.query}" -H\`; // -H for HTML output, or just standard text. Let's use JSON if possible or standard text.
        // Actually, let's use standard text formatting but make it readable
        const cmdText = \`psql "\${args.connectionString}" -c "\${args.query}" -P pager=off\`;
        const result = execSync(cmdText, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return result;
      } else if (args.type === "mysql") {
        // requires mysql client
         const cmd = \`mysql -e "\${args.query}" "\${args.connectionString}" --table\`;
         const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
         return result;
      } else if (args.type === "sqlite") {
        // remove sqlite:// prefix if present
        const dbPath = args.connectionString.replace(/^sqlite:\\/\\//, '');
        const cmd = \`sqlite3 "\${dbPath}" -header -column "\${args.query}"\`;
        const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return result;
      }
      return "Unsupported database type.";
    } catch (error: any) {
      return \`Database Query Failed: \${error.message}\\n\\nStderr:\\n\${error.stderr?.toString()}\`;
    }
  },
});
