import "dotenv/config";

import { runAllSignals, runAllTriggers } from "../agents/researchers.js";
import { scoreAccount } from "../agents/accountScorer.js";
import type {
  AccountScore,
  SignalFinding,
  TriggerFinding
} from "../schemas/research.js";
import type { Account } from "../types.js";

const [, , name, domain, linkedinUrl] = process.argv;

if (!name || !domain) {
  console.error(
    'Usage: tsx src/scripts/runResearch.ts "Company Name" company.com [linkedin_url] [--json]\n\n' +
      "Runs all trigger + signal researchers in parallel, then the fit×timing scorer. Does NOT persist.\n" +
      "Pass --json to also dump raw findings + score."
  );
  process.exit(1);
}

const showJson = process.argv.includes("--json");
const account: Account = { name, domain, linkedinUrl };

const t0 = Date.now();
console.error(`[runResearch] researching ${name} (${domain})...`);
// Sequential (triggers, then signals) so peak concurrency stays bounded.
const triggers = await runAllTriggers(account);
const signals = await runAllSignals(account);
console.error(
  `[runResearch] ${triggers.length} triggers + ${signals.length} signals in ${Date.now() - t0}ms`
);

console.error(`[runResearch] scoring...`);
const score = await scoreAccount(account, signals, triggers);
console.error(`[runResearch] done in ${Date.now() - t0}ms\n`);

renderCard(account, triggers, signals, score);

if (showJson) {
  console.log("\n--- raw JSON ---");
  console.log(JSON.stringify({ triggers, signals, score }, null, 2));
}

function renderCard(
  acct: Account,
  trigs: TriggerFinding[],
  sigs: SignalFinding[],
  s: AccountScore
): void {
  const pad = (str: string, n: number) => str.padEnd(n).slice(0, n);
  const rule = "═".repeat(66);
  const out: string[] = [];

  out.push(rule);
  out.push(`  ${acct.name}  (${acct.domain})`);
  out.push(rule);

  out.push(`\nTRIGGERS (timing)`);
  for (const t of trigs) {
    const grade = t.found ? `${t.strength}/${t.timeliness}` : "none";
    out.push(`  ${t.found ? "✓" : "·"} ${pad(t.trigger_id, 26)} ${grade}`);
  }

  out.push(`\nSIGNALS (fit)`);
  for (const sig of sigs) {
    const grade = sig.present ? sig.degree : "none";
    out.push(`  ${sig.present ? "✓" : "·"} ${pad(sig.signal_id, 26)} ${grade}`);
  }

  out.push("\n" + rule);
  out.push(
    `  FIT: ${s.fit_score}/100      TIMING: ${s.timing_score}/100      OVERALL: ${s.overall_score}/100`
  );
  out.push(`  confidence: ${s.confidence}      cap: ${s.cap_applied ?? "none"}`);
  out.push(rule);
  out.push(`  TOP DRIVERS: ${s.top_drivers.join(", ") || "(none)"}`);
  out.push(`  PERSONA:     ${s.recommended_persona}`);
  out.push(`  ANGLE:       ${s.message_angle}`);
  out.push(`\n  SUMMARY:\n  ${s.summary.replace(/\n/g, "\n  ")}`);
  out.push(rule);

  console.log(out.join("\n"));
}
