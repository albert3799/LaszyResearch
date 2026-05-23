import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runScoring } from "../agents/scoring.js";
import { SignalFindingSchema } from "../schemas/agentOutputs.js";
import { z } from "zod";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error(
    "Usage: npm run agent:scoring -- path/to/findings.json\n\n" +
      "The JSON file must contain { company, domain, signal_findings: [...] }."
  );
  process.exit(1);
}

const InputSchema = z.object({
  company: z.string(),
  domain: z.string(),
  signal_findings: z.array(SignalFindingSchema)
});

const raw = readFileSync(resolve(inputPath), "utf8");
const bundle = InputSchema.parse(JSON.parse(raw));

const t0 = Date.now();
const result = await runScoring(
  { name: bundle.company, domain: bundle.domain },
  bundle.signal_findings
);
const elapsed = Date.now() - t0;
console.error(`[runScoringAgent] completed in ${elapsed}ms`);

console.log(JSON.stringify(result, null, 2));
