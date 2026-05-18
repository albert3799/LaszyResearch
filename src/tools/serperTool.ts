import { config } from "../config.js";
import { OpenAITool } from "./openaiTools.js";

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
}

async function searchGoogle(
  query: string,
  numResults: number = 5
): Promise<SerperResult[]> {
  const apiKey = process.env.SERPER_API_KEY ?? config.serperApiKey;
  if (!apiKey) {
    return [];
  }

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey
    },
    body: JSON.stringify({ q: query, num: numResults }),
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { organic?: SerperResult[] };
  return data.organic ?? [];
}

export async function searchForReport(
  companyName: string,
  domain: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.SERPER_API_KEY ?? config.serperApiKey;
  if (!apiKey) {
    return {
      error: "SERPER_API_KEY not set in environment variables",
      candidates: []
    };
  }

  const strategies = [
    `site:${domain} "annual report" 2025 filetype:pdf`,
    `site:${domain} "annual report" 2024 filetype:pdf`,
    `site:${domain} "interim report" OR "half year" 2025 filetype:pdf`,
    `"${companyName}" annual report 2025 filetype:pdf`,
    `"${companyName}" annual report 2024 filetype:pdf`,
    `site:investors.${domain} annual report filetype:pdf`,
    `site:ir.${domain} annual report filetype:pdf`
  ];

  const candidates: Array<{ title: string; url: string; snippet: string; query: string }> = [];
  const seen = new Set<string>();

  try {
    for (const query of strategies) {
      const results = await searchGoogle(query, 3);
      for (const result of results) {
        const link = result.link ?? "";
        if (!link.toLowerCase().includes(".pdf") || seen.has(link)) {
          continue;
        }
        seen.add(link);
        candidates.push({
          title: result.title ?? "",
          url: link,
          snippet: result.snippet ?? "",
          query
        });
      }
      if (candidates.length >= 5) {
        break;
      }
    }

    return { candidates };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      candidates
    };
  }
}

export const searchForReportTool = new OpenAITool({
  name: "search_for_report",
  description:
    "Search Google via Serper for annual, interim, or quarterly report PDFs for a company.",
  parameters: {
    type: "object",
    properties: {
      companyName: { type: "string", description: "The company name." },
      domain: {
        type: "string",
        description: "The company's primary domain, e.g. siemens.com."
      }
    },
    required: ["companyName", "domain"],
    additionalProperties: false
  },
  handler: (args) =>
    searchForReport(String(args.companyName ?? ""), String(args.domain ?? ""))
});
