import type { Account, JsonObject } from "../types.js";
import {
  runReportAnalyst as defaultRunAnalyst,
  type ReportIntelligence
} from "./reportAnalyst.js";
import { runReportFinder as defaultRunFinder } from "./reportFinder.js";
import type { FinderResult } from "../schemas/reportOutputs.js";

interface FinancialsDeps {
  runFinder?: (prompt: string) => Promise<FinderResult>;
  runAnalyst?: (prompt: string) => Promise<ReportIntelligence>;
}

function emptyFinancials(reason: string, sourceUrl?: string | null): JsonObject {
  return {
    stated_priorities: [],
    procurement_mentions: [],
    pain_language: [],
    tech_investment_plans: [],
    revenue: "unknown",
    employee_count: "unknown",
    source_documents: [sourceUrl ? `${reason}: ${sourceUrl}` : reason],
    report_intelligence: null
  };
}

export async function runReportFinancials(
  account: Account,
  deps: FinancialsDeps = {}
): Promise<JsonObject> {
  const runFinder = deps.runFinder ?? defaultRunFinder;
  const runAnalyst = deps.runAnalyst ?? defaultRunAnalyst;

  const finderInput = [
    `Company: ${account.name}`,
    `Domain: ${account.domain}`,
    account.ticker ? `Ticker: ${account.ticker}` : "",
    account.companyNumber ? `UK Companies House Number: ${account.companyNumber}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const finderOutput = await runFinder(finderInput);

  if (finderOutput.status !== "found") {
    return emptyFinancials(
      finderOutput.error ?? `Report finder returned status: ${finderOutput.status}`,
      finderOutput.sourceUrl
    );
  }

  if (!finderOutput.text) {
    return emptyFinancials(
      "Report finder returned found but no extracted text",
      finderOutput.sourceUrl
    );
  }

  const analystInput = [
    `Company: ${account.name}`,
    `Document type: ${finderOutput.documentType ?? "unknown"}`,
    `Report year: ${finderOutput.reportYear ?? "unknown"}`,
    `Source URL: ${finderOutput.sourceUrl ?? "unknown"}`,
    "",
    "REPORT TEXT:",
    finderOutput.text
  ].join("\n");

  const intelligence = await runAnalyst(analystInput);
  const sourceDocument = [
    finderOutput.documentType ?? intelligence.documentType,
    finderOutput.reportYear ?? intelligence.reportYear,
    finderOutput.sourceUrl ?? ""
  ]
    .filter(Boolean)
    .join(" - ");

  return {
    stated_priorities: intelligence.managementPriorities,
    procurement_mentions: intelligence.procurementSignals,
    pain_language: [
      ...intelligence.costPrograms,
      ...intelligence.peSignals,
      ...intelligence.zipRelevantQuotes
    ],
    tech_investment_plans: intelligence.transformationInitiatives,
    revenue: "unknown",
    employee_count: "unknown",
    source_documents: [sourceDocument],
    report_intelligence: intelligence,
    confidence: intelligence.confidence,
    strategic_summary: intelligence.summary
  };
}

export const financialsAgent = {
  name: "financials",
  runForAccount: runReportFinancials
};
