import "dotenv/config";

import { mapStakeholdersForAccount } from "../agents/stakeholderMapper.js";
import type { Account } from "../types.js";

const [, , name, domain, linkedinUrl, accountId] = process.argv;

if (!name || !domain) {
  console.error(
    'Usage: npm run agent:stakeholders -- "Company Name" company.com [linkedin_url] [account_id]'
  );
  process.exit(1);
}

const account: Account = { id: accountId, name, domain, linkedinUrl };
const noPersist = process.argv.includes("--no-persist");

console.error(
  `[stakeholders] mapping ${name} (${domain})${noPersist ? " — dry run, will NOT persist" : ""}`
);
const t0 = Date.now();
const result = await mapStakeholdersForAccount(account, { persist: !noPersist });
const elapsed = Date.now() - t0;

console.error(
  `[stakeholders] pulled=${result.pulled_count} matched=${result.matched.length} ` +
    `persisted=${result.persisted.status}${
      result.persisted.inserted != null ? `(${result.persisted.inserted})` : ""
    } in ${elapsed}ms`
);

if (result.persisted.status === "error") {
  console.error(`[stakeholders] persist error: ${result.persisted.message}`);
}

// Markdown table for the human reader.
const matched = result.matched.sort((a, b) => {
  const rankOrder = { high: 0, medium: 1, low: 2 } as const;
  return (
    rankOrder[a.rank] - rankOrder[b.rank] ||
    (b.confidence ?? 0) - (a.confidence ?? 0)
  );
});

if (matched.length === 0) {
  console.log("\nNo Zip-fit stakeholders identified.\n");
} else {
  console.log("\n| Name | Title | Department | Persona | Rank | Confidence | Decision role | LinkedIn | Why relevant |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const c of matched) {
    const row = [
      c.full_name ?? "",
      c.title ?? "",
      c.department ?? "",
      c.sub_persona ? `${c.persona} (${c.sub_persona})` : c.persona ?? "",
      c.rank,
      c.confidence?.toFixed(2) ?? "",
      c.decision_role ?? "",
      c.linkedin_url,
      c.rationale.replace(/\|/g, "\\|").replace(/\n/g, " ")
    ];
    console.log(`| ${row.join(" | ")} |`);
  }
  console.log("");
}

// Full JSON dump (including persona=null rows) for inspection / future evals.
console.log(JSON.stringify(result.classifications, null, 2));
