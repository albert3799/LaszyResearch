import "dotenv/config";

import { OpenAITool } from "./openaiTools.js";

interface SearchResult {
  title?: string;
  link?: string;
  snippet?: string;
}

interface NormalizedSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

type SearchProviderInfo = {
  provider: "serpapi" | "serper";
  apiKey: string;
};

function normalizeApiKey(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  const lower = trimmed.toLowerCase();

  if (
    !trimmed ||
    lower.includes("your-key") ||
    lower.includes("your_key") ||
    lower === "placeholder"
  ) {
    return "";
  }

  return trimmed;
}

function resolveFirstApiKey(envNames: string[]): string {
  for (const envName of envNames) {
    const apiKey = normalizeApiKey(process.env[envName]);
    if (apiKey) {
      return apiKey;
    }
  }

  return "";
}

function getSearchProviderInfo(): SearchProviderInfo | null {
  const serpApiKey = resolveFirstApiKey(["SERPAPI_API_KEY", "SERP_API_KEY"]);
  if (serpApiKey) {
    return { provider: "serpapi", apiKey: serpApiKey };
  }

  const serperApiKey = resolveFirstApiKey(["SERPER_API_KEY"]);
  if (serperApiKey) {
    return { provider: "serper", apiKey: serperApiKey };
  }

  return null;
}

async function searchWithSerpApi(
  query: string,
  numResults: number,
  apiKey: string
): Promise<SearchResult[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(numResults));
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { organic_results?: SearchResult[] };
  return data.organic_results ?? [];
}

async function searchWithSerper(
  query: string,
  numResults: number,
  apiKey: string
): Promise<SearchResult[]> {
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

  const data = (await response.json()) as { organic?: SearchResult[] };
  return data.organic ?? [];
}

async function executeSearch(
  query: string,
  numResults: number = 5
): Promise<{ query: string; provider: "serpapi" | "serper"; results: NormalizedSearchResult[] }> {
  const providerInfo = getSearchProviderInfo();
  if (!providerInfo) {
    return {
      query,
      provider: "serper",
      results: []
    };
  }

  const rawResults =
    providerInfo.provider === "serpapi"
      ? await searchWithSerpApi(query, numResults, providerInfo.apiKey)
      : await searchWithSerper(query, numResults, providerInfo.apiKey);

  return {
    query,
    provider: providerInfo.provider,
    results: rawResults
      .map((result) => ({
        title: result.title ?? "",
        url: result.link ?? "",
        snippet: result.snippet ?? "",
        source: providerInfo.provider
      }))
      .filter((item) => item.url)
  };
}

export async function searchForReport(
  companyName: string,
  domain: string
): Promise<Record<string, unknown>> {
  const providerInfo = getSearchProviderInfo();
  if (!providerInfo) {
    return {
      error: "SERPAPI_API_KEY or SERPER_API_KEY not set in environment variables",
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
      const response = await executeSearch(query, 3);
      for (const result of response.results) {
        const link = result.url;
        if (!link.toLowerCase().includes(".pdf") || seen.has(link)) {
          continue;
        }
        seen.add(link);
        candidates.push({
          title: result.title,
          url: link,
          snippet: result.snippet,
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

export async function webSearch(
  query: string,
  numResults: number = 5
): Promise<Record<string, unknown>> {
  const providerInfo = getSearchProviderInfo();
  if (!providerInfo) {
    return {
      query,
      provider: "serper",
      error: "SERPAPI_API_KEY or SERPER_API_KEY not set in environment variables",
      results: []
    };
  }

  const result = await executeSearch(query, numResults);
  return result;
}

export const searchForReportTool = new OpenAITool({
  name: "search_for_report",
  description:
    "Search Google via SerpAPI/Serper for annual, interim, or quarterly report PDFs for a company.",
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

export const webSearchTool = new OpenAITool({
  name: "web_search",
  description:
    "Search the web and return top results (title, URL, snippet) for a query.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The query to run." },
      num_results: {
        type: "number",
        minimum: 1,
        maximum: 10,
        description: "Maximum number of results to return."
      }
    },
    required: ["query"],
    additionalProperties: false
  },
  handler: (args) => webSearch(String(args.query ?? ""), Number(args.num_results ?? 5))
});
