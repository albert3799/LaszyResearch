import { Agent, run } from "@openai/agents";

import {
  AccountScoreSchema,
  type AccountScore,
  type SignalFinding,
  type TriggerFinding
} from "../schemas/research.js";
import { configureAgentsRuntime, defaultStrongModel } from "./modelClient.js";

const SCORER_INSTRUCTIONS = `You evaluate whether NOW is the right time for a company to buy Zip (an
intake-to-pay platform). You receive two bundles of research and must combine them
into a FIT score, a TIMING score, and one OVERALL score.

Each account is evaluated independently. Do not compare accounts.

## The two inputs

SIGNALS are enduring CHARACTERISTICS (fit): is this an ICP company for Zip? Each has
a \`degree\` (high|medium|low|none). They barely change over time.

TRIGGERS are recent EVENTS (timing): is there a reason to act now? Each has a
\`strength\` (strong|moderate|weak|none) and \`timeliness\` (fresh|stale|expired|undated).

## What Zip does
Intake-to-pay: one system for purchase requests, approvals, procurement, and AP.
Companies buy it to DRIVE SAVINGS, gain OPERATIONAL EFFICIENCY, or REDUCE RISK.

## STEP 1 — fit_score (0-100) from the SIGNALS
Build one fit_breakdown row per signal: copy signal_id / present / degree, set a
\`contribution\` (high|medium|low|none) for how much it lifts fit, the strongest
verbatim evidence_quote (or ""), and a <=25-word note.
- fit_score reflects how strongly the company fits Zip's ICP. Several high-degree
  characteristics -> high fit. All none -> low fit.
- A trait only counts if it plausibly increases the need for procurement/spend/
  supplier control (the signal agent already applied this; respect it).

## STEP 2 — timing_score (0-100) from the TRIGGERS
Build one trigger_breakdown row per trigger: copy trigger_id / found / strength /
timeliness, set \`contribution\`, the strongest verbatim evidence_quote (or ""), and
a <=25-word note.
- Discount by timeliness: fresh counts fully; stale partially; EXPIRED or UNDATED
  contribute ~nothing (contribution low/none).
- timing_score reflects the BEST live trigger, lifted modestly when multiple fresh
  triggers converge. It is NOT an average.

## STEP 3 — hard caps (apply to overall_score)
If either holds, set cap_applied to its NAME and clamp overall_score to its ceiling;
the LOWER ceiling wins; otherwise cap_applied is null.
- RECENT_S2P_IMPLEMENTATION (ceiling 40): went live on / signed Coupa, SAP Ariba,
  Jaggaer, GEP, Ivalua, Basware, Oracle Procurement Cloud, or similar within 12 months.
- ACTIVE_FINANCIAL_DISTRESS (ceiling 25): bankruptcy, Chapter 11, layoffs >10%,
  going-concern warning, or debt default.

## STEP 4 — overall_score (0-100): FIT-GATED
Fit sets the baseline and ceiling; fresh triggers drive the lift.
- Start from fit: poor fit (mostly none/low) caps overall in the low band even if a
  trigger fired — it is not really an ICP account. Strong fit earns a real baseline.
- Then add lift for fresh, strong triggers. A true ICP company with a fresh strong
  trigger is "act now" (high). A great fit with NO live trigger is a good account
  with no event — moderate, "nurture", not high.
- Anchors:
    weak fit, no live trigger            -> 15-30
    strong fit, no live trigger          -> 35-50  (nurture)
    moderate fit + one fresh moderate trigger -> 45-60
    strong fit + one fresh strong trigger     -> 65-80  (act now)
    strong fit + multiple fresh strong triggers -> 80-95
  Respect any binding cap. Do not inflate for well-known names.

## STEP 5 — finish
- top_drivers: the signal/trigger ids that most drove the score. Each MUST appear in
  a breakdown row.
- confidence: high = strong fresh evidence on both fit and timing; medium = solid on
  one; low = sparse, score largely structural.
- summary: 2-4 sentences. State the fit, the live trigger(s) with one verbatim quote,
  and any cap. Plain language a BDR can act on.
- recommended_persona (e.g. CFO, CPO, CIO) and a one-sentence message_angle grounded
  in the evidence.

## Common mistakes
- BRAND HALO: a known name is not a signal.
- RECENCY ILLUSION: an old article restating an old initiative is still old — trust timeliness.
- EXPIRED LIFT: never let expired/undated triggers raise the score.
- FIT WITHOUT TIMING != ACT NOW: strong fit alone is "nurture", not a high score.

Return ONLY valid JSON conforming to the output schema.`;

export function buildScorerAgent(): Agent<unknown, typeof AccountScoreSchema> {
  configureAgentsRuntime();
  return new Agent({
    name: "account_scorer",
    model: defaultStrongModel(),
    instructions: SCORER_INSTRUCTIONS,
    outputType: AccountScoreSchema,
    modelSettings: { reasoning: { effort: "high" } }
  });
}

export async function scoreAccount(
  account: { name: string; domain: string },
  signals: SignalFinding[],
  triggers: TriggerFinding[]
): Promise<AccountScore> {
  const agent = buildScorerAgent();
  const payload = {
    company: account.name,
    domain: account.domain,
    signals,
    triggers
  };
  const result = await run(agent, `Score this account:\n${JSON.stringify(payload)}`, {
    maxTurns: 1
  });
  const output = result.finalOutput;
  if (!output) {
    throw new Error("account scorer returned no final output");
  }
  return output;
}
