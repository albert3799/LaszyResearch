import { OpenAITool } from "./openaiTools.js";

const SEC_HEADERS = {
  "User-Agent": "LaszyResearch/1.0 (albert@zip.co)",
  "Accept-Encoding": "gzip, deflate"
};

export async function fetchSecFilings(
  companyName: string,
  ticker?: string
): Promise<Record<string, unknown>> {
  const query = ticker && ticker !== "unknown" ? ticker : companyName;

  try {
    const searchUrl = new URL("https://efts.sec.gov/LATEST/search-index");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("dateRange", "custom");
    searchUrl.searchParams.set("startdt", "2024-01-01");
    searchUrl.searchParams.set("forms", "10-K");

    const searchResponse = await fetch(searchUrl, {
      headers: SEC_HEADERS,
      signal: AbortSignal.timeout(30_000)
    });

    if (!searchResponse.ok) {
      return {
        error: `SEC EDGAR request failed: ${searchResponse.status} ${searchResponse.statusText}`,
        filings: [],
        company: companyName
      };
    }

    const results = (await searchResponse.json()) as {
      hits?: { hits?: Array<{ _source?: Record<string, unknown> }> };
    };
    const hits = results.hits?.hits ?? [];
    if (hits.length === 0) {
      return {
        error: `No 10-K found for ${companyName}. Company may be private.`,
        filings: [],
        company: companyName
      };
    }

    const filingSource = hits[0]._source ?? {};
    const filingUrl = String(filingSource.file_url ?? "");
    if (!filingUrl) {
      return {
        error: "Filing URL not found in search results",
        filings: [],
        company: companyName
      };
    }

    const filingResponse = await fetch(`https://www.sec.gov${filingUrl}`, {
      headers: SEC_HEADERS,
      signal: AbortSignal.timeout(60_000)
    });

    if (!filingResponse.ok) {
      return {
        error: `SEC filing fetch failed: ${filingResponse.status} ${filingResponse.statusText}`,
        filings: [],
        company: companyName
      };
    }

    const content = (await filingResponse.text()).slice(0, 100_000);

    return {
      filing_type: "10-K",
      company: companyName,
      content,
      source_url: `https://www.sec.gov${filingUrl}`,
      filing_date: filingSource.file_date ?? "unknown"
    };
  } catch (error) {
    return {
      error: `SEC EDGAR request failed: ${error instanceof Error ? error.message : String(error)}`,
      filings: [],
      company: companyName
    };
  }
}

export const fetchSecFilingsTool = new OpenAITool({
  name: "fetch_sec_filings",
  description: "Fetch the most recent SEC 10-K filing for a public company.",
  parameters: {
    type: "object",
    properties: {
      company_name: { type: "string" },
      ticker: { type: "string" }
    },
    required: ["company_name"],
    additionalProperties: false
  },
  handler: (args) =>
    fetchSecFilings(
      String(args.company_name ?? ""),
      args.ticker === undefined ? undefined : String(args.ticker)
    )
});
