import { config } from "../config.js";
import { OpenAITool } from "./openaiTools.js";

function toDocumentContentUrl(metadataUrl: string | undefined): string | null {
  if (!metadataUrl) {
    return null;
  }

  const absoluteUrl = metadataUrl.startsWith("http")
    ? metadataUrl
    : `https://document-api.company-information.service.gov.uk${metadataUrl}`;

  return absoluteUrl.endsWith("/content")
    ? absoluteUrl
    : `${absoluteUrl.replace(/\/$/, "")}/content`;
}

export async function checkUkCompaniesHouse(
  companyNumber: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY ?? config.companiesHouseApiKey;
  if (!apiKey) {
    return {
      error: "COMPANIES_HOUSE_API_KEY not set in environment variables",
      filings: []
    };
  }

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const url = new URL(
    `https://api.company-information.service.gov.uk/company/${companyNumber}/filing-history`
  );
  url.searchParams.set("category", "accounts");
  url.searchParams.set("items_per_page", "5");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      return {
        error: `Companies House API error: ${response.status} ${response.statusText}`,
        filings: []
      };
    }

    const data = (await response.json()) as {
      items?: Array<{
        date?: string;
        description?: string;
        transaction_id?: string;
        links?: { document_metadata?: string };
      }>;
    };

    const filings = (data.items ?? []).map((item) => ({
      date: item.date ?? "",
      description: item.description ?? "Annual accounts",
      documentUrl:
        toDocumentContentUrl(item.links?.document_metadata) ??
        `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}/filing-history/${item.transaction_id}/document`
    }));

    return { filings };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      filings: []
    };
  }
}

export const checkUkCompaniesHouseTool = new OpenAITool({
  name: "check_uk_companies_house",
  description:
    "Check UK Companies House for annual accounts filings. Requires a company registration number.",
  parameters: {
    type: "object",
    properties: {
      companyNumber: {
        type: "string",
        description: "UK Companies House registration number, e.g. 00445790."
      }
    },
    required: ["companyNumber"],
    additionalProperties: false
  },
  handler: (args) => checkUkCompaniesHouse(String(args.companyNumber ?? ""))
});
