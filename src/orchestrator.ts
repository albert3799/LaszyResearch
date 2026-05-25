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
    score: scoring.overall_score,
    confidence: scoring.confidence,
    rationale: scoring.summary,
    recommended_persona: scoring.recommended_persona,
    message_angle: scoring.message_angle,
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
    scorecard: scoring.scorecard,
    top_signals: scoring.top_signals,
    cap_applied: scoring.cap_applied,
    raw_research: JSON.stringify({ findings, scoring })
  });

  return result;
}
