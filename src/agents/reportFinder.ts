import { config } from "../config.js";
import { FinderResultSchema, type FinderResult } from "../schemas/reportOutputs.js";
import { checkUkCompaniesHouseTool } from "../tools/companiesHouseTool.js";
import { downloadAndExtractPdf, getDocumentSampleTool } from "../tools/reportPdfTool.js";
import { searchForReportTool } from "../tools/serperTool.js";
import { verifyReportDocumentTool } from "../tools/verifyReportTool.js";
import { Agent } from "./openaiAgent.js";

const reportFinderPlannerAgent = new Agent({
  name: "report_finder_planner",
  model: config.models.reportFinder,
  system: `You are a document retrieval agent. Your job is to find and verify the latest annual, interim, or quarterly report for a given EMEA company.

STRATEGY:
1. Call search_for_report with the company name and domain.
2. From the returned PDF URLs, call get_document_sample on the strongest candidates.
3. Use verify_report_document and your own reading of the sample to confirm it is an annual, integrated, interim, half-year, or quarterly report for the correct company.
4. If the first PDF is a sustainability-only report, ESG-only report, investor presentation, or brochure, try the next candidate.
5. If no PDFs are found via search and a UK Companies House number is provided, call check_uk_companies_house and try any returned document URL.
6. When a correct document is verified, return the source URL and document metadata. The runtime will perform full PDF extraction after your URL is selected.
7. If all strategies are exhausted, return status "not_found".

VERIFICATION CRITERIA:
- Must be an annual report, integrated report, interim report, half-year results, quarterly report, or 10-K.
- Must be for the correct company, not a similarly named competitor.
- Must be from 2023 or later when possible.
- Sustainability/ESG-only reports are not valid unless they also contain annual management commentary.

IMPORTANT: Your ENTIRE response must be valid JSON with this exact schema:
{
  "status": "found|not_found|wrong_document",
  "companyName": "string",
  "sourceUrl": "string|null",
  "documentType": "annual_report|interim_report|quarterly_report|null",
  "reportYear": "string|null",
  "text": "string|null",
  "error": "string|null"
}

When you find the correct document, set status to "found", include the sourceUrl, documentType, and reportYear, and set "text" to null.
Do not include text outside the JSON object.`,
  tools: [
    searchForReportTool,
    getDocumentSampleTool,
    verifyReportDocumentTool,
    checkUkCompaniesHouseTool
  ],
  maxTurns: 7,
  reasoningEffort: "low"
});

function parseModelJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start !== -1 && end !== -1 && start < end) {
      return JSON.parse(payload.slice(start, end + 1)) as unknown;
    }
    throw new Error(`Invalid report finder JSON: ${payload.slice(0, 300)}`);
  }
}

export function parseFinderResult(payload: unknown): FinderResult {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  return FinderResultSchema.parse(parsed);
}

export const reportFinderAgent = {
  name: "report_finder",
  run: async (prompt: string): Promise<string> => {
    const plannerRaw = await reportFinderPlannerAgent.run(prompt);
    const planned = parseFinderResult(parseModelJson(plannerRaw));

    if (planned.status !== "found" || !planned.sourceUrl || planned.text) {
      return JSON.stringify(planned);
    }

    const extracted = await downloadAndExtractPdf(planned.sourceUrl);
    if (typeof extracted.text === "string" && extracted.text.length > 0) {
      return JSON.stringify({
        ...planned,
        text: extracted.text,
        error: null
      });
    }

    return JSON.stringify({
      ...planned,
      status: "wrong_document",
      text: null,
      error: String(extracted.error ?? "Unable to extract text from selected report")
    });
  }
};
