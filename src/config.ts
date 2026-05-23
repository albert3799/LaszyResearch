import "dotenv/config";

import { defaultFastModel, defaultStrongModel } from "./agents/modelClient.js";

export const config = {
  models: {
    reportFinder: process.env.REPORT_FINDER_MODEL ?? defaultFastModel(),
    reportAnalyst: process.env.REPORT_ANALYST_MODEL ?? defaultStrongModel(),
    fast: defaultFastModel(),
    strong: defaultStrongModel()
  },
  companiesHouseApiKey: process.env.COMPANIES_HOUSE_API_KEY ?? "",
  limits: {
    maxPdfPages: 80,
    maxTextChars: 120_000,
    verificationSampleChars: 5_000
  }
} as const;
