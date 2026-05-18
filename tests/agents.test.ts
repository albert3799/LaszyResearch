import { describe, expect, it } from "vitest";

import {
  parseHiringAnalysis,
  runHiringForAccount
} from "../src/agents/hiring.js";
import {
  parseWebResearch,
  runWebResearchForAccount
} from "../src/agents/webResearch.js";
import type { Account } from "../src/types.js";

const account: Account = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Acme Corp",
  domain: "acme.com"
};

describe("V1 agent helpers", () => {
  it("runs web research with the expected account prompt", async () => {
    const runner = {
      run: async (prompt: string) => {
        expect(prompt).toBe("Research: Acme Corp (acme.com)");
        return JSON.stringify({
          business_priorities: ["Efficiency"],
          recent_news: [],
          pain_signals: [],
          strategic_direction: "Focused on efficiency.",
          confidence: "medium"
        });
      }
    };

    const raw = await runWebResearchForAccount(account, runner);
    expect(parseWebResearch(raw).business_priorities).toEqual(["Efficiency"]);
  });

  it("runs hiring with account ID so the tool can use Supabase cache lookup", async () => {
    const runner = {
      run: async (prompt: string) => {
        expect(prompt).toContain(`Account ID: ${account.id}`);
        return JSON.stringify({
          open_roles: [{ title: "Procurement Manager", department: "Procurement" }],
          signal_strength: "strong",
          interpretation: "Relevant procurement hiring is active."
        });
      }
    };

    const raw = await runHiringForAccount(account, runner);
    expect(parseHiringAnalysis(raw).signal_strength).toBe("strong");
  });

  it("returns weak hiring signal when no account UUID is available", async () => {
    const raw = await runHiringForAccount({
      name: "No UUID Co",
      domain: "nouuid.example"
    });

    expect(parseHiringAnalysis(raw)).toMatchObject({
      open_roles: [],
      signal_strength: "weak"
    });
  });
});
