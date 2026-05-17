import { afterEach, describe, expect, it, vi } from "vitest";

import { scrapeLinkedInProfile } from "../src/tools/apifyTool.js";
import { persistToDb } from "../src/tools/supabaseTool.js";
import { searchTheirStack } from "../src/tools/theirstackTool.js";

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
});
