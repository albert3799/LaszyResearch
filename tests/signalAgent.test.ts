import { describe, expect, it } from "vitest";

import { loadSignals, resetSignalsCache } from "../src/agents/signalAgent.js";

describe("signal config loader", () => {
  it("loads all enabled signals from config/signals.yaml with required fields", () => {
    resetSignalsCache();
    const signals = loadSignals();
    expect(signals.length).toBeGreaterThanOrEqual(8);

    const ids = signals.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "earnings_pressure",
        "erp_migration",
        "hiring",
        "ipo",
        "leadership_change",
        "m_and_a_integration",
        "pe_vc_acquisition",
        "regulatory_deadline"
      ].sort()
    );

    for (const signal of signals) {
      expect(signal.label.length).toBeGreaterThan(0);
      expect(signal.description.length).toBeGreaterThan(0);
      expect(signal.why_it_matters.length).toBeGreaterThan(0);
      expect(signal.strength_rubric.strong.length).toBeGreaterThan(0);
      expect(signal.timeliness_rubric.fresh.length).toBeGreaterThan(0);

      if (signal.tool === "web_search") {
        expect(signal.search_queries.length).toBeGreaterThan(0);
      }
    }
  });

  it("templates {company} / {domain} in search queries (no leaked placeholders)", () => {
    resetSignalsCache();
    const signals = loadSignals();
    for (const signal of signals) {
      for (const query of signal.search_queries) {
        // After rendering with an account, no placeholder should remain.
        const rendered = query
          .replaceAll("{company}", "Acme")
          .replaceAll("{domain}", "acme.com")
          .replaceAll("{year}", "2026");
        expect(rendered).not.toMatch(/\{[a-z_]+\}/);
      }
    }
  });
});
