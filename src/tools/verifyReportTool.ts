import { OpenAITool } from "./openaiTools.js";

export function verifyReportDocument(
  companyName: string,
  sampleText: string
): Record<string, unknown> {
  const normalized = sampleText.toLowerCase();
  const normalizedCompany = companyName.toLowerCase();
  const validDocumentTerms = [
    "annual report",
    "integrated report",
    "interim report",
    "half year",
    "quarterly report",
    "form 10-k"
  ];
  const invalidOnlyTerms = ["sustainability report", "esg report", "modern slavery"];
  const companyTokens = normalizedCompany
    .split(/\s+/)
    .filter((token) => token.length > 2);

  const hasCompany = companyTokens.some((token) => normalized.includes(token));
  const hasValidDocumentTerm = validDocumentTerms.some((term) => normalized.includes(term));
  const looksSustainabilityOnly =
    invalidOnlyTerms.some((term) => normalized.includes(term)) &&
    !["annual report", "integrated report"].some((term) => normalized.includes(term));

  return {
    isLikelyCorrect: hasCompany && hasValidDocumentTerm && !looksSustainabilityOnly,
    hasCompany,
    hasValidDocumentTerm,
    looksSustainabilityOnly,
    reason: hasCompany && hasValidDocumentTerm && !looksSustainabilityOnly
      ? "Sample appears to be a valid company report."
      : "Sample does not confidently match the target company/report criteria."
  };
}

export const verifyReportDocumentTool = new OpenAITool({
  name: "verify_report_document",
  description:
    "Heuristically verify whether a report sample appears to be the right annual/interim report for a company.",
  parameters: {
    type: "object",
    properties: {
      companyName: { type: "string" },
      sampleText: { type: "string" }
    },
    required: ["companyName", "sampleText"],
    additionalProperties: false
  },
  handler: (args) =>
    verifyReportDocument(String(args.companyName ?? ""), String(args.sampleText ?? ""))
});
