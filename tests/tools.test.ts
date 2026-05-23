import { afterEach, describe, expect, it, vi } from "vitest";

import { scrapeLinkedInProfile } from "../src/tools/apifyTool.js";
import { checkUkCompaniesHouse } from "../src/tools/companiesHouseTool.js";
import { searchForReport, webSearch } from "../src/tools/serperTool.js";
import { persistToDb } from "../src/tools/supabaseTool.js";
import { searchTheirStack } from "../src/tools/theirstackTool.js";
import { verifyReportDocument } from "../src/tools/verifyReportTool.js";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe("tool missing configuration handling", () => {
  it("returns an error when TheirStack API key is missing", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "");

    const result = await searchTheirStack("example.com");

    expect(result).toHaveProperty("error");
  });

  it("returns an error when Apify token is missing", async () => {
    vi.stubEnv("APIFY_TOKEN", "");

    const result = await scrapeLinkedInProfile("https://linkedin.com/in/test");

    expect(result).toHaveProperty("error");
  });

  it("returns an error when Supabase config is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");

    const result = await persistToDb({ company: "Test", domain: "test.com" });

    expect(result.status).toBe("error");
  });

  it("returns an error when Serper API key is missing", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "");
    vi.stubEnv("SERP_API_KEY", "");
    vi.stubEnv("SERPER_API_KEY", "");

    const result = await searchForReport("Tesco", "tescoplc.com");

    expect(result).toHaveProperty("error");
    expect(result.candidates).toEqual([]);
  });

  it("returns an error when Companies House API key is missing", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "");

    const result = await checkUkCompaniesHouse("00445790");

    expect(result).toHaveProperty("error");
    expect(result.filings).toEqual([]);
  });
});

describe("Serper web search wiring", () => {
  it("uses Serper when SERPER_API_KEY is configured and SerpAPI is only a placeholder", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "serpapi_your-key-here");
    vi.stubEnv("SERP_API_KEY", "");
    vi.stubEnv("SERPER_API_KEY", "serper_real_key");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        organic: [
          {
            title: "Tesco procurement result",
            link: "https://example.com/tesco",
            snippet: "Procurement transformation snippet"
          }
        ]
      })
    } as unknown as Response);

    const result = await webSearch("Tesco procurement", 2);

    expect(result).toMatchObject({
      query: "Tesco procurement",
      provider: "serper",
      results: [
        {
          title: "Tesco procurement result",
          url: "https://example.com/tesco",
          snippet: "Procurement transformation snippet",
          source: "serper"
        }
      ]
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://google.serper.dev/search");
    expect((options as RequestInit).method).toBe("POST");
    expect(((options as RequestInit).headers as Record<string, string>)["X-API-KEY"]).toBe(
      "serper_real_key"
    );
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      q: "Tesco procurement",
      num: 2
    });
  });
});

describe("report document verification", () => {
  it("accepts a likely annual report sample", () => {
    const result = verifyReportDocument(
      "Tesco",
      "Tesco PLC Annual Report and Financial Statements 2024"
    );

    expect(result.isLikelyCorrect).toBe(true);
  });

  it("rejects sustainability-only report samples", () => {
    const result = verifyReportDocument("Tesco", "Tesco PLC Sustainability Report 2024");

    expect(result.isLikelyCorrect).toBe(false);
    expect(result.looksSustainabilityOnly).toBe(true);
  });
});
