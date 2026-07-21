import { tool } from "@mimo-ai/plugin";

export default tool({
  description: "Lightweight API fuzzer to bombard an endpoint with mutated payloads to find edge cases and 500 errors.",
  args: {
    url: tool.schema.string().describe("The endpoint to fuzz (e.g., http://localhost:3000/api/login)."),
    method: tool.schema.string().enum(["POST", "PUT", "GET", "PATCH"]).describe("HTTP Method."),
    basePayload: tool.schema.string().describe("A valid JSON string payload to use as a baseline template."),
    fuzzKey: tool.schema.string().describe("The JSON key in the payload to mutate.")
  },
  async execute(args, ctx) {
    let baseJson: any;
    try {
      baseJson = JSON.parse(args.basePayload);
    } catch (e) {
      return "basePayload must be valid JSON.";
    }

    const payloads = [
      "", 
      "null", 
      "' OR 1=1 --", 
      "<script>alert(1)</script>", 
      "A".repeat(10000), 
      "\\u0000", 
      "😈", 
      "../../../../etc/passwd",
      -1, 
      9999999999999999, 
      []
    ];

    const results = [];
    let failureCount = 0;

    for (const mutation of payloads) {
      const payload = { ...baseJson, [args.fuzzKey]: mutation };
      
      try {
        const start = Date.now();
        const res = await fetch(args.url, {
          method: args.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const duration = Date.now() - start;
        
        let responseBody = "";
        try { responseBody = await res.text(); } catch(e) {}

        results.push({
          mutation_type: typeof mutation === "string" ? mutation.substring(0, 20) + "..." : mutation,
          status: res.status,
          latency_ms: duration,
          error_preview: res.status >= 400 ? responseBody.substring(0, 100) : "OK"
        });

        if (res.status >= 500) failureCount++;
      } catch (err: any) {
        failureCount++;
        results.push({ mutation_type: "Network Error", error: err.message });
      }
    }

    const summary = \`Fuzzing Complete. Tested \${payloads.length} mutations. \\nServer crashed/returned 500s: \${failureCount} times.\\n\\nDetails:\\n\` + JSON.stringify(results, null, 2);
    return summary;
  },
});
