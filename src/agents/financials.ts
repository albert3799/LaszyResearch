import type { Account, JsonObject } from "../types.js";
import {
  parseReportIntelligence,
  reportAnalystAgent
} from "./reportAnalyst.js";
import { parseFinderResult, reportFinderAgent } from "./reportFinder.js";

type FinancialsRunner = {
  run(prompt: string): Promise<string>;
};

interface FinancialsDeps {
  finder?: FinancialsRunner;
  analyst?: FinancialsRunner;
}

function parseLooseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start !== -1 && end !== -1 && start < end) {
      return JSON.parse(payload.slice(start, end + 1)) as unknown;
    }
    throw new Error(`Invalid JSON payload: ${payload.slice(0, 300)}`);
  }
}

function emptyFinancials(
  account: Account,
  reason: string,
  sourceUrl?: string | null
): JsonObject {
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
): Promise<string> {
  const finder = deps.finder ?? reportFinderAgent;
  const analyst = deps.analyst ?? reportAnalystAgent;

  const finderInput = [
    `Company: ${account.name}`,
    `Domain: ${account.domain}`,
    account.ticker ? `Ticker: ${account.ticker}` : "",
    account.companyNumber ? `UK Companies House Number: ${account.companyNumber}` : ""
  ].filter(Boolean).join("\n");

  const finderRaw = await finder.run(finderInput);
  const finderOutput = parseFinderResult(parseLooseJson(finderRaw));

  if (finderOutput.status !== "found") {
    return JSON.stringify(
      emptyFinancials(
        account,
        finderOutput.error ?? `Report finder returned status: ${finderOutput.status}`,
        finderOutput.sourceUrl
      )
    );
  }

  if (!finderOutput.text) {
    return JSON.stringify(
      emptyFinancials(account, "Report finder returned found but no extracted text", finderOutput.sourceUrl)
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

  const analystRaw = await analyst.run(analystInput);
  const intelligence = parseReportIntelligence(parseLooseJson(analystRaw));
  const sourceDocument = [
    finderOutput.documentType ?? intelligence.documentType,
    finderOutput.reportYear ?? intelligence.reportYear,
    finderOutput.sourceUrl ?? ""
  ].filter(Boolean).join(" - ");

  return JSON.stringify({
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
  });
}

export const financialsAgent = {
  name: "financials",
  runForAccount: runReportFinancials,
  run: async (prompt: string): Promise<string> => {
    const match = prompt.match(/Analyze filings:\s*(.*?)\s*\(ticker:\s*(.*?)\)/i);
    const name = match?.[1]?.trim() || "unknown";
    const ticker = match?.[2]?.trim();
    return runReportFinancials({
      name,
      domain: "unknown",
      ticker: ticker && ticker !== "unknown" ? ticker : undefined
    });
  }
};
