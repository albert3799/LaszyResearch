import "dotenv/config";

import { financialsAgent } from "./agents/financials.js";
import { hiringAgent } from "./agents/hiring.js";
import { linkedinAgent } from "./agents/linkedin.js";
import { outputAgent } from "./agents/output.js";
import { scoringAgent } from "./agents/scoring.js";
import { webResearchAgent } from "./agents/webResearch.js";
import type { Account, JsonObject, ScoredAccount, ScoreData } from "./types.js";

export function parseAgentJson(agentName: string, payload: unknown): unknown {
  if (typeof payload !== "string") {
    return payload;
  }

  try {
    return JSON.parse(payload) as unknown;
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start !== -1 && end !== -1 && start < end) {
      try {
        return JSON.parse(payload.slice(start, end + 1)) as unknown;
      } catch {
        // Fall through to the clearer error below.
      }
    }

    const preview = payload.replace(/\n/g, " ").slice(0, 300);
    throw new Error(`${agentName} returned invalid JSON: ${preview}`);
  }
}

export function parseAgentObject(agentName: string, payload: unknown): JsonObject {
  const parsed = parseAgentJson(agentName, payload);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const type = Array.isArray(parsed) ? "array" : typeof parsed;
    throw new Error(`${agentName} returned ${type}, expected object`);
  }
  return parsed as JsonObject;
}

function validateAccount(account: Partial<Account>): asserts account is Account {
  const missing = ["name", "domain"].filter((field) => {
    const value = account[field as keyof Account];
    return typeof value !== "string" || value.length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Account is missing required field(s): ${missing.join(", ")}`);
  }
}

export function parseScoreData(payload: unknown): ScoreData {
  const data = parseAgentObject("scoring", payload);
  const score = Number(data.score);
  if (!Number.isFinite(score) || score < 1 || score > 10) {
    throw new Error(`scoring returned invalid score: ${String(data.score)}`);
  }

  if (!["high", "medium", "low"].includes(String(data.confidence))) {
    throw new Error(`scoring returned invalid confidence: ${String(data.confidence)}`);
  }

  return {
    score,
    confidence: data.confidence as ScoreData["confidence"],
    rationale: String(data.rationale ?? ""),
    key_evidence: Array.isArray(data.key_evidence)
      ? data.key_evidence.map(String)
      : [],
    recommended_persona: String(data.recommended_persona ?? ""),
    message_angle: String(data.message_angle ?? "")
  };
}

export async function processAccount(account: Partial<Account>): Promise<ScoredAccount> {
  validateAccount(account);

  const [web, linkedin, hiring, financials] = await Promise.all([
    webResearchAgent.run(`Research: ${account.name} (${account.domain})`),
    linkedinAgent.run(
      `Find finance/procurement leaders at ${account.name} (${account.domain})`
    ),
    hiringAgent.run(`Pull hiring signals for ${account.domain}`),
    financialsAgent.run(
      `Analyze filings: ${account.name} (ticker: ${account.ticker ?? "unknown"})`
    )
  ]);

  const researchBundle = JSON.stringify({
    company: account.name,
    domain: account.domain,
    web_research: parseAgentObject("web_research", web),
    linkedin_profiles: parseAgentObject("linkedin", linkedin),
    hiring_signals: parseAgentObject("hiring", hiring),
    financial_intelligence: parseAgentObject("financials", financials)
  });

  const scoreResult = await scoringAgent.run(`Score this account:\n${researchBundle}`);
  const scoreData = parseScoreData(scoreResult);

  const output: ScoredAccount = {
    id: account.id ?? account.domain,
    company: account.name,
    domain: account.domain,
    ...scoreData,
    raw_research: researchBundle
  };

  await outputAgent.run(`Persist this account: ${JSON.stringify(output)}`);

  return output;
}
