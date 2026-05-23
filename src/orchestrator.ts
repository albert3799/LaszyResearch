import "dotenv/config";

import { runAllSignalsForAccount } from "./agents/signalAgent.js";
import { runScoring } from "./agents/scoring.js";
import { persistToDb } from "./tools/supabaseTool.js";
import type { Account, ScoredAccount } from "./types.js";

function validateAccount(account: Partial<Account>): asserts account is Account {
  const missing = ["name", "domain"].filter((field) => {
    const value = account[field as keyof Account];
    return typeof value !== "string" || value.length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Account is missing required field(s): ${missing.join(", ")}`);
  }
}

export async function processAccount(
  account: Partial<Account>
): Promise<ScoredAccount> {
  validateAccount(account);

  const findings = await runAllSignalsForAccount(account);
  const scoring = await runScoring(account, findings);

  const result: ScoredAccount = {
    id: account.id ?? account.domain,
    company: account.name,
    domain: account.domain,
    score: scoring.conclusion.overall_score,
    confidence: scoring.conclusion.confidence,
    rationale: scoring.conclusion.reasoning,
    recommended_persona: scoring.conclusion.recommended_persona,
    message_angle: scoring.conclusion.message_angle,
    signal_findings: findings,
    scoring
  };

  await persistToDb({
    id: result.id,
    company: result.company,
    domain: result.domain,
    score: result.score,
    confidence: result.confidence,
    rationale: result.rationale,
    recommended_persona: result.recommended_persona,
    message_angle: result.message_angle,
    criteria_scores: scoring.criteria_scores,
    evidence_for: scoring.evidence_assessment
      .filter((e) => e.weight === "strong" || e.weight === "moderate")
      .map((e) => `[${e.id}] ${e.source}: "${e.source_quote}"`),
    evidence_against: scoring.caps_applied
      .filter((c) => c.applied)
      .map((c) => `${c.code} ${c.name}: ${c.supporting_quote ?? ""}`),
    key_evidence: scoring.conclusion.triggers_detected,
    raw_research: JSON.stringify({ findings, scoring })
  });

  return result;
}
