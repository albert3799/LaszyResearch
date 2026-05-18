import { afterEach, describe, expect, it, vi } from "vitest";

import { scrapeLinkedInProfile } from "../src/tools/apifyTool.js";
import { checkUkCompaniesHouse } from "../src/tools/companiesHouseTool.js";
import { searchForReport } from "../src/tools/serperTool.js";
import { persistToDb } from "../src/tools/supabaseTool.js";
import { searchTheirStack } from "../src/tools/theirstackTool.js";
import { verifyReportDocument } from "../src/tools/verifyReportTool.js";

const originalEnv = { ...process.env };

afterEach(() => {
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
