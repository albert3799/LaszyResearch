import { Agent, STRONG_MODEL } from "./openaiAgent.js";
import { WebResearchSchema, type WebResearchOutput } from "../schemas/agentOutputs.js";
import type { Account } from "../types.js";

type WebResearchRunner = {
  run(prompt: string): Promise<string>;
};

function parseLooseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start !== -1 && end !== -1 && start < end) {
      return JSON.parse(payload.slice(start, end + 1)) as unknown;
    }
    throw new Error(`Invalid web research JSON: ${payload.slice(0, 300)}`);
  }
}

export const webResearchAgent = new Agent({
  name: "web_research",
  model: STRONG_MODEL,
  system: `You are a B2B research analyst specializing in identifying companies
that need better procurement and spend management solutions.

Given a company name and domain, research:
1. Their stated business priorities (from earnings calls, press releases, executive interviews)
2. Recent strategic initiatives (especially around cost reduction, efficiency, digital transformation)
3. Pain signals (manual processes, fragmented systems, lack of visibility into spend)
4. Any mentions of procurement, sourcing, AP, or vendor management challenges

Be thorough - use multiple search queries to triangulate. Look for:
- "[Company] earnings call transcript"
- "[Company] digital transformation"
- "[Company] procurement strategy"
- "[Company] CFO interview"

IMPORTANT: Your ENTIRE response must be valid JSON with this exact schema:
{
  "business_priorities": ["string - top 3-5 stated priorities"],
  "recent_news": [
    {"headline": "string", "date": "YYYY-MM", "relevance": "string - why this matters for Zip"}
  ],
  "pain_signals": ["string - specific evidence of procurement/spend pain"],
  "strategic_direction": "string - 1-2 sentence summary of where the company is headed",
  "confidence": "high|medium|low"
}

Do not include any text outside the JSON object.
If you can't find meaningful information, return empty arrays and set confidence to "low".`,
  maxTurns: 5,
  builtinTools: [{ type: "web_search" }],
  reasoningEffort: "medium"
});

export function parseWebResearch(payload: unknown): WebResearchOutput {
  const parsed = typeof payload === "string" ? parseLooseJson(payload) : payload;
  return WebResearchSchema.parse(parsed);
}

export async function runWebResearchForAccount(
  account: Account,
  runner: WebResearchRunner = webResearchAgent
): Promise<string> {
  return runner.run(`Research: ${account.name} (${account.domain})`);
}
