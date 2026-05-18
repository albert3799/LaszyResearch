import "dotenv/config";

import { parseHiringAnalysis, runHiringForAccount } from "./agents/hiring.js";
import { outputAgent } from "./agents/output.js";
import { scoringAgent } from "./agents/scoring.js";
import { parseWebResearch, runWebResearchForAccount } from "./agents/webResearch.js";
import type { Account, JsonObject, ScoredAccount, ScoreData } from "./types.js";

const EMPTY_LINKEDIN_PROFILES = {
  stakeholders: [],
  status: "not_enabled_v1"
};

const EMPTY_FINANCIAL_INTELLIGENCE = {
  stated_priorities: [],
  procurement_mentions: [],
  pain_language: [],
  tech_investment_plans: [],
  revenue: "unknown",
  employee_count: "unknown",
  source_documents: ["financials_not_enabled_v1"],
  report_intelligence: null
};

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

  const [web, hiring] = await Promise.all([
    runWebResearchForAccount(account),
    runHiringForAccount(account)
  ]);

  const researchBundle = JSON.stringify({
    company: account.name,
    domain: account.domain,
    version: "v1_web_hiring",
    web_research: parseWebResearch(web),
    linkedin_profiles: EMPTY_LINKEDIN_PROFILES,
    hiring_signals: parseHiringAnalysis(hiring),
    financial_intelligence: EMPTY_FINANCIAL_INTELLIGENCE
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
