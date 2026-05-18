import "dotenv/config";

import { FAST_MODEL, STRONG_MODEL } from "./agents/openaiAgent.js";

export const config = {
  models: {
    reportFinder: process.env.REPORT_FINDER_MODEL ?? "gpt-5.4-nano",
    reportAnalyst: process.env.REPORT_ANALYST_MODEL ?? "gpt-5.4",
    fast: FAST_MODEL,
    strong: STRONG_MODEL
  },
  serperApiKey: process.env.SERPER_API_KEY ?? "",
  companiesHouseApiKey: process.env.COMPANIES_HOUSE_API_KEY ?? "",
  limits: {
    maxPdfPages: 80,
    maxTextChars: 120_000,
    verificationSampleChars: 5_000
  }
} as const;
