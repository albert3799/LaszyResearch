import "dotenv/config";

import { loadSignals, runSignalForAccount } from "../agents/signalAgent.js";
import type { Account } from "../types.js";

const [, , signalId, name, domain, linkedinUrl, accountId] = process.argv;

if (!signalId || !name || !domain) {
  console.error(
    'Usage: npm run agent:signal -- <signal_id> "Company Name" company.com [linkedin_url] [account_id]\n\n' +
      "Available signal ids:"
  );
  for (const s of loadSignals()) {
    console.error(`  - ${s.id}  (${s.label})`);
  }
  process.exit(1);
}

const signal = loadSignals().find((s) => s.id === signalId);
if (!signal) {
  console.error(`Unknown signal id: ${signalId}`);
  process.exit(1);
}

const account: Account = { id: accountId, name, domain, linkedinUrl };

console.error(`[runSignal] signal=${signal.id} model-tier=${signal.tool}`);
const t0 = Date.now();
const finding = await runSignalForAccount(signal, account);
const elapsed = Date.now() - t0;
console.error(`[runSignal] completed in ${elapsed}ms`);

console.log(JSON.stringify(finding, null, 2));
