import { describe, expect, it, vi } from "vitest";

import { ScoringOutputSchema } from "../src/schemas/agentOutputs.js";

describe("orchestrator integration", () => {
  it("missing required fields throws a clear error", async () => {
    vi.resetModules();
    const orchestrator = await import("../src/orchestrator.js");
    await expect(orchestrator.processAccount({ name: "Acme" })).rejects.toThrow(
      /Account is missing required field/
    );
  });

  it("ScoringOutputSchema accepts a valid scorecard", () => {
    const valid = {
      scorecard: [
        {
          signal_id: "ipo",
          category: "financial",
          found: true,
          grade: "strong",
          timeliness: "fresh",
          contribution: "high",
          evidence_quote: "filed S-1 in Q1 2026",
          source_url: "https://sec.gov/...",
          note: "Dated filing with named bankers — decisive trigger."
        },
        {
          signal_id: "erp_migration",
          category: "transformation",
          found: false,
          grade: "none",
          timeliness: "undated",
          contribution: "none",
          evidence_quote: "",
          source_url: null,
          note: "No evidence of an ERP migration."
        }
      ],
      overall_score: 70,
      confidence: "medium",
      cap_applied: null,
      top_signals: ["ipo"],
      summary:
        "Recent IPO ('filed S-1 in Q1 2026') puts spend controls on the board agenda. No disqualifying caps apply.",
      recommended_persona: "CFO",
      message_angle: "Post-IPO scrutiny demands tighter spend controls."
    };

    const parsed = ScoringOutputSchema.parse(valid);
    expect(parsed.overall_score).toBe(70);
    expect(parsed.scorecard[0].category).toBe("financial");
    expect(parsed.top_signals).toContain("ipo");
  });

  it("ScoringOutputSchema rejects top_signals not present in the scorecard", () => {
    const bad = {
      scorecard: [
        {
          signal_id: "ipo",
          category: "financial",
          found: false,
          grade: "none",
          timeliness: "undated",
          contribution: "none",
          evidence_quote: "",
          source_url: null,
          note: "Nothing found."
        }
      ],
      overall_score: 30,
      confidence: "low",
      cap_applied: null,
      top_signals: ["leadership_change"],
      summary: "No material signals.",
      recommended_persona: "CFO",
      message_angle: "x"
    };

    expect(() => ScoringOutputSchema.parse(bad)).toThrow(
      /not present in scorecard/
    );
  });
});
