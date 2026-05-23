import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { processAccount } from "./orchestrator.js";
import type { Account, ScoredAccount } from "./types.js";

async function loadAccounts(): Promise<Array<Partial<Account>>> {
  const accountsPath = resolve("accounts.json");
  try {
    const raw = await readFile(accountsPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("accounts.json must contain an array of accounts");
    }
    return parsed as Array<Partial<Account>>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("ERROR: accounts.json not found. Create it with your account list.");
      console.error(
        'Format: [{"name": "Acme Corp", "domain": "acmecorp.com", "ticker": "ACME"}]'
      );
      process.exitCode = 1;
      return [];
    }
    throw error;
  }
}

export async function main(): Promise<void> {
  const accounts = await loadAccounts();
  if (accounts.length === 0 && process.exitCode) {
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  LaszyResearch Pipeline - Processing ${accounts.length} accounts`);
  console.log(`${"=".repeat(60)}\n`);

  const results: ScoredAccount[] = [];
  const failures: Array<{ account: string; error: string }> = [];

  for (const [index, account] of accounts.entries()) {
    const accountLabel = account.name ?? account.domain ?? `row ${index + 1}`;
    const domainLabel = account.domain ?? "unknown domain";
    console.log(
      `[${index + 1}/${accounts.length}] Processing: ${accountLabel} (${domainLabel})`
    );

    try {
      const result = await processAccount(account);
      console.log(`  -> Score: ${result.score}/100 (${result.confidence})`);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  -> FAILED: ${message}`);
      failures.push({ account: accountLabel, error: message });
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  COMPLETE: ${results.length} scored, ${failures.length} failed`);
  if (results.length > 0) {
    const avgScore =
      results.reduce((total, result) => total + result.score, 0) / results.length;
    console.log(`  Average score: ${avgScore.toFixed(1)}/100`);
    console.log("  Top accounts:");
    for (const result of [...results].sort((a, b) => b.score - a.score).slice(0, 5)) {
      console.log(`    - ${result.company} - ${result.score}/100`);
    }
  }
  console.log(`${"=".repeat(60)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
