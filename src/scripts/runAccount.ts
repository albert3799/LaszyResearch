import "dotenv/config";

import { runAllSignalsForAccount } from "../agents/signalAgent.js";
import { runScoring } from "../agents/scoring.js";
import type { SignalFinding, ScoringOutput } from "../schemas/agentOutputs.js";
import type { Account } from "../types.js";

const [, , name, domain, linkedinUrl, accountId] = process.argv;

if (!name || !domain) {
  console.error(
    'Usage: tsx src/scripts/runAccount.ts "Company Name" company.com [linkedin_url] [account_id] [--json]\n\n' +
      "Runs all enabled signal agents in parallel, then the scorer. Does NOT persist.\n" +
      "Pass --json to also dump the raw findings + scoring JSON."
  );
  process.exit(1);
}

const showJson = process.argv.includes("--json");
const account: Account = { id: accountId, name, domain, linkedinUrl };

const t0 = Date.now();
console.error(`[runAccount] running signals for ${name} (${domain})...`);
const findings = await runAllSignalsForAccount(account);
console.error(`[runAccount] ${findings.length} findings in ${Date.now() - t0}ms`);

console.error(`[runAccount] scoring...`);
const scoring = await runScoring(account, findings);
console.error(`[runAccount] done in ${Date.now() - t0}ms\n`);

renderCard(account, findings, scoring);

if (showJson) {
  console.log("\n--- raw JSON ---");
  console.log(JSON.stringify({ findings, scoring }, null, 2));
}

function renderCard(acct: Account, finds: SignalFinding[], s: ScoringOutput): void {
  const pad = (str: string, n: number) => str.padEnd(n).slice(0, n);
  const rule = "═".repeat(64);

  const lines: string[] = [];
  lines.push(rule);
  lines.push(`  ${acct.name}  (${acct.domain})`);
  lines.push(rule);

  lines.push("\nSIGNALS");
  for (const row of s.scorecard) {
    const mark = row.found ? "✓" : "·";
    const grade = row.found ? `${row.grade}/${row.timeliness}` : "none";
    lines.push(
      `  ${mark} ${pad(row.signal_id, 20)} ${pad(grade, 18)} ${pad("[" + row.category + "]", 17)} ${row.contribution}`
    );
  }

  if (s.category_breakdown?.length) {
    lines.push("\nCATEGORY ROLL-UP");
    for (const c of s.category_breakdown) {
      lines.push(
        `  ${pad(c.category, 16)} ${pad(c.rolled_grade, 10)} ${pad(c.contribution, 8)} [${c.signals_found.join(", ")}]`
      );
    }
  }

  lines.push("\n" + rule);
  lines.push(
    `  SCORE: ${s.overall_score}/100      confidence: ${s.confidence}      cap: ${s.cap_applied ?? "none"}`
  );
  lines.push(rule);
  lines.push(`  TOP SIGNALS: ${s.top_signals.join(", ") || "(none)"}`);
  lines.push(`  PERSONA:     ${s.recommended_persona}`);
  lines.push(`  ANGLE:       ${s.message_angle}`);
  lines.push(`\n  SUMMARY:\n  ${s.summary.replace(/\n/g, "\n  ")}`);
  lines.push(rule);

  console.log(lines.join("\n"));
}
