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

  it("ScoringOutputSchema accepts signal-prefixed evidence sources", () => {
    const valid = {
      evidence_assessment: [
        {
          id: "e1",
          source: "signal.ipo",
          claim: "IPO filed last quarter",
          source_quote: "filed S-1 in Q1 2026",
          trigger_matched: "ipo_recent",
          specificity: "specific",
          recency: "fresh",
          weight: "strong",
          comment: "Dated filing with named bankers."
        }
      ],
      caps_applied: [
        {
          code: "C1",
          name: "RECENT_S2P_IMPLEMENTATION",
          applied: false,
          supporting_evidence_id: null,
          supporting_quote: null,
          ceiling: 40
        },
        {
          code: "C2",
          name: "ACTIVE_FINANCIAL_DISTRESS",
          applied: false,
          supporting_evidence_id: null,
          supporting_quote: null,
          ceiling: 25
        }
      ],
      criteria_scores: {
        drive_savings: {
          supporting_evidence_ids: ["e1"],
          reasoning: "Newly public, board scrutiny on cost.",
          verbatim_quote: "filed S-1 in Q1 2026",
          score: 70
        },
        operational_efficiency: {
          supporting_evidence_ids: [],
          reasoning: "No specific efficiency signal.",
          verbatim_quote: "",
          score: 40
        },
        reduce_risk: {
          supporting_evidence_ids: [],
          reasoning: "No specific compliance trigger.",
          verbatim_quote: "",
          score: 30
        }
      },
      conclusion: {
        reasoning:
          "[e1] shows a recent IPO with quoted filing date. Public-market scrutiny lifts drive_savings. No caps apply.",
        triggers_detected: ["ipo_recent"],
        lowest_cap_ceiling: null,
        overall_score: 70,
        confidence: "medium",
        recommended_persona: "CFO",
        message_angle: "Post-IPO scrutiny demands tighter spend controls."
      }
    };

    const parsed = ScoringOutputSchema.parse(valid);
    expect(parsed.conclusion.overall_score).toBe(70);
    expect(parsed.evidence_assessment[0].source).toBe("signal.ipo");
  });

  it("ScoringOutputSchema rejects non-signal source prefixes", () => {
    const bad = {
      evidence_assessment: [
        {
          id: "e1",
          source: "web_research.ownership",
          claim: "x",
          source_quote: "y",
          trigger_matched: null,
          specificity: "vague",
          recency: "undated",
          weight: "weak",
          comment: "z"
        }
      ],
      caps_applied: [
        {
          code: "C1",
          name: "RECENT_S2P_IMPLEMENTATION",
          applied: false,
          supporting_evidence_id: null,
          supporting_quote: null,
          ceiling: 40
        },
        {
          code: "C2",
          name: "ACTIVE_FINANCIAL_DISTRESS",
          applied: false,
          supporting_evidence_id: null,
          supporting_quote: null,
          ceiling: 25
        }
      ],
      criteria_scores: {
        drive_savings: {
          supporting_evidence_ids: [],
          reasoning: "x",
          verbatim_quote: "",
          score: 30
        },
        operational_efficiency: {
          supporting_evidence_ids: [],
          reasoning: "x",
          verbatim_quote: "",
          score: 30
        },
        reduce_risk: {
          supporting_evidence_ids: [],
          reasoning: "x",
          verbatim_quote: "",
          score: 30
        }
      },
      conclusion: {
        reasoning: "x",
        triggers_detected: [],
        lowest_cap_ceiling: null,
        overall_score: 30,
        confidence: "low",
        recommended_persona: "CFO",
        message_angle: "x"
      }
    };

    expect(() => ScoringOutputSchema.parse(bad)).toThrow(
      /source must be of the form signal/
    );
  });
});
