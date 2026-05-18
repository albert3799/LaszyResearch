import "dotenv/config";

import { parseWebResearch, runWebResearchForAccount } from "../agents/webResearch.js";
import type { Account } from "../types.js";

const [, , name, domain] = process.argv;

if (!name || !domain) {
  console.error('Usage: npm run agent:web -- "Company Name" company.com');
  process.exit(1);
}

const account: Account = { name, domain };
const raw = await runWebResearchForAccount(account);
const parsed = parseWebResearch(raw);

console.log(JSON.stringify(parsed, null, 2));
