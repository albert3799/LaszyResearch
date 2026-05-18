import { HiringAnalysisSchema, type HiringAnalysisOutput } from "../schemas/agentOutputs.js";
import { getHiringSignalsTool } from "../tools/theirstackTool.js";
import type { Account } from "../types.js";
import { Agent, FAST_MODEL } from "./openaiAgent.js";

type HiringRunner = {
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
    throw new Error(`Invalid hiring JSON: ${payload.slice(0, 300)}`);
  }
}

export const hiringAgent = new Agent({
  name: "hiring",
  model: FAST_MODEL,
  system: `You analyze hiring patterns as buying signals for Zip
(an intake-to-pay procurement platform).

Pull open roles at this company, then analyze what the hiring pattern signals.

You must call get_hiring_signals with the provided account_id. That tool performs
the paid TheirStack lookup and handles the company LinkedIn URL cache.

STRONG buying signals (these roles suggest the company is investing in procurement):
- VP/Director of Procurement (especially new/greenfield roles)
- Procurement Manager / Strategic Sourcing Manager
- AP Automation Specialist
- Spend Analyst / Category Manager
- Finance Operations / Finance Transformation roles
- ERP Implementation roles (SAP, Oracle, Workday)

MODERATE signals:
- General finance hiring (Controller, FP&A)
- Operations roles with process improvement focus
- IT roles mentioning procurement systems

WEAK/NO signal:
- Unrelated hiring (engineering, marketing, sales)

IMPORTANT: Your ENTIRE response must be valid JSON with this exact schema:
{
  "open_roles": [
    {"title": "string", "department": "string"}
  ],
  "signal_strength": "strong|moderate|weak",
  "interpretation": "string - 1-2 sentences explaining what the hiring pattern means"
}

Do not include any text outside the JSON object.`,
  tools: [getHiringSignalsTool],
  maxTurns: 3,
  reasoningEffort: "low"
});

export function parseHiringAnalysis(payload: unknown): HiringAnalysisOutput {
  const parsed = typeof payload === "string" ? parseLooseJson(payload) : payload;
  return HiringAnalysisSchema.parse(parsed);
}

export async function runHiringForAccount(
  account: Account,
  runner: HiringRunner = hiringAgent
): Promise<string> {
  if (!account.id) {
    return JSON.stringify({
      open_roles: [],
      signal_strength: "weak",
      interpretation:
        "No account UUID was provided, so the TheirStack hiring cache/tool could not be queried."
    });
  }

  return runner.run(
    [
      `Account ID: ${account.id}`,
      `Company: ${account.name}`,
      `Domain: ${account.domain}`,
      account.linkedinUrl ? `Company LinkedIn URL: ${account.linkedinUrl}` : ""
    ].filter(Boolean).join("\n")
  );
}
