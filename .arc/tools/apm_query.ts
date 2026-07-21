import { tool } from "@mimo-ai/plugin";

export default tool({
  description: "Query Application Performance Monitoring (APM) systems like Prometheus or Elasticsearch.",
  args: {
    system: tool.schema.string().enum(["prometheus", "elasticsearch"]).describe("The APM system to query."),
    endpoint: tool.schema.string().describe("The base HTTP URL of the APM API (e.g., http://localhost:9090)."),
    query: tool.schema.string().describe("The PromQL query or ElasticSearch JSON query string.")
  },
  async execute(args, ctx) {
    try {
      if (args.system === "prometheus") {
        // Prometheus API: /api/v1/query?query=...
        const url = new URL("/api/v1/query", args.endpoint);
        url.searchParams.append("query", args.query);
        
        const res = await fetch(url.toString());
        if (!res.ok) {
          return \`Prometheus returned HTTP \${res.status}: \${await res.text()}\`;
        }
        const data = await res.json();
        return JSON.stringify(data.data?.result || data, null, 2).slice(0, 50000);
      } 
      
      if (args.system === "elasticsearch") {
        // Elasticsearch search API
        const url = new URL("/_search", args.endpoint);
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: args.query
        });
        if (!res.ok) {
          return \`Elasticsearch returned HTTP \${res.status}: \${await res.text()}\`;
        }
        const data = await res.json();
        // Return hits summary
        return JSON.stringify(data.hits?.hits || data, null, 2).slice(0, 50000);
      }

      return "Unsupported APM system.";
    } catch (error: any) {
      return \`APM Query failed: \${error.message}\`;
    }
  },
});
