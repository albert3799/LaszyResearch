import { describe, expect, it } from "vitest";

import { runReportFinancials } from "../src/agents/financials.js";
import type { Account } from "../src/types.js";

const account: Account = {
  name: "Tesco",
  domain: "tescoplc.com",
  companyNumber: "00445790"
};

describe("report financials facade", () => {
  it("runs finder then analyst and maps output to legacy financial intelligence", async () => {
    const finder = {
      run: async () =>
        JSON.stringify({
          status: "found",
          companyName: "Tesco",
          sourceUrl: "https://example.com/report.pdf",
          documentType: "annual_report",
          reportYear: "2024",
          text: "Annual report text with procurement transformation",
          error: null
        })
    };
    const analyst = {
      run: async () =>
        JSON.stringify({
          companyName: "Tesco",
          reportYear: "2024",
          documentType: "annual_report",
          managementPriorities: ["Improve operating efficiency"],
          transformationInitiatives: ["Automation programme"],
          procurementSignals: ["Supplier consolidation"],
          costPrograms: ["Cost reduction plan"],
          peSignals: [],
          zipRelevantQuotes: ["We are simplifying supplier processes."],
          confidence: 0.82,
          summary: "Clear procurement and efficiency signals."
        })
    };

    const result = JSON.parse(await runReportFinancials(account, { finder, analyst }));

    expect(result.stated_priorities).toEqual(["Improve operating efficiency"]);
    expect(result.procurement_mentions).toEqual(["Supplier consolidation"]);
    expect(result.tech_investment_plans).toEqual(["Automation programme"]);
    expect(result.confidence).toBe(0.82);
    expect(result.source_documents[0]).toContain("https://example.com/report.pdf");
  });

  it("returns empty financials when no report is found", async () => {
    const finder = {
      run: async () =>
        JSON.stringify({
          status: "not_found",
          companyName: "Tesco",
          sourceUrl: null,
          documentType: null,
          reportYear: null,
          text: null,
          error: "No PDF found"
        })
    };
    const analyst = {
      run: async () => {
        throw new Error("Analyst should not run");
      }
    };

    const result = JSON.parse(await runReportFinancials(account, { finder, analyst }));

    expect(result.stated_priorities).toEqual([]);
    expect(result.report_intelligence).toBeNull();
    expect(result.source_documents[0]).toBe("No PDF found");
  });
});
