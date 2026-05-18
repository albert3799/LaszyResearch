import "dotenv/config";

import { parseHiringAnalysis, runHiringForAccount } from "../agents/hiring.js";
import type { Account } from "../types.js";

const [, , id, name, domain, linkedinUrl] = process.argv;

if (!id || !name || !domain) {
  console.error(
    'Usage: npm run agent:hiring -- account-uuid "Company Name" company.com "https://www.linkedin.com/company/company/"'
  );
  process.exit(1);
}

const account: Account = { id, name, domain, linkedinUrl };
const raw = await runHiringForAccount(account);
const parsed = parseHiringAnalysis(raw);

console.log(JSON.stringify(parsed, null, 2));
