import { Agent, run } from "@openai/agents";

import { config } from "../config.js";
import { FinderResultSchema, type FinderResult } from "../schemas/reportOutputs.js";
import { checkUkCompaniesHouseTool } from "../tools/companiesHouseTool.js";
import {
  downloadAndExtractPdf,
  getDocumentSampleTool
} from "../tools/reportPdfTool.js";
import { searchForReportTool } from "../tools/serperTool.js";
import { verifyReportDocumentTool } from "../tools/verifyReportTool.js";
import { configureAgentsRuntime } from "./modelClient.js";

const INSTRUCTIONS = `You are a document retrieval agent. Find and verify the latest
annual, interim, or quarterly report for a given EMEA company.

STRATEGY:
1. Call search_for_report with the company name and domain.
2. From the returned PDF URLs, call get_document_sample on the strongest candidates.
3. Use verify_report_document and your own reading of the sample to confirm it is an
   annual, integrated, interim, half-year, or quarterly report for the correct company.
4. If the first PDF is a sustainability-only report, ESG-only report, investor
   presentation, or brochure, try the next candidate.
5. If no PDFs are found via search and a UK Companies House number is provided, call
   check_uk_companies_house and try any returned document URL.
6. When a correct document is verified, return the source URL and document metadata.
   The runtime will perform full PDF extraction after your URL is selected — leave
   text as null in your response.
7. If all strategies are exhausted, return status "not_found".

VERIFICATION CRITERIA:
- Must be an annual report, integrated report, interim report, half-year results,
  quarterly report, or 10-K.
- Must be for the correct company, not a similarly named competitor.
- Must be from 2023 or later when possible.
- Sustainability/ESG-only reports are not valid unless they also contain annual
  management commentary.`;

function buildFinderPlannerAgent(): Agent<unknown, typeof FinderResultSchema> {
  configureAgentsRuntime();
  return new Agent({
    name: "report_finder_planner",
    model: config.models.reportFinder,
    instructions: INSTRUCTIONS,
    tools: [
      searchForReportTool.toAgentsTool(),
      getDocumentSampleTool.toAgentsTool(),
      verifyReportDocumentTool.toAgentsTool(),
      checkUkCompaniesHouseTool.toAgentsTool()
    ],
    outputType: FinderResultSchema,
    modelSettings: { reasoning: { effort: "low" } }
  });
}

export async function runReportFinder(prompt: string): Promise<FinderResult> {
  const planner = buildFinderPlannerAgent();
  const plannerResult = await run(planner, prompt, { maxTurns: 7 });
  const planned = plannerResult.finalOutput;
  if (!planned) {
    throw new Error("report_finder planner returned no final output");
  }

  if (planned.status !== "found" || !planned.sourceUrl || planned.text) {
    return planned;
  }

  const extracted = await downloadAndExtractPdf(planned.sourceUrl);
  if (typeof extracted.text === "string" && extracted.text.length > 0) {
    return { ...planned, text: extracted.text, error: null };
  }

  return {
    ...planned,
    status: "wrong_document",
    text: null,
    error: String(extracted.error ?? "Unable to extract text from selected report")
  };
}

export const reportFinderAgent = {
  name: "report_finder",
  run: runReportFinder
};
