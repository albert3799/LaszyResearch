import { Agent, run } from "@openai/agents";

import { config } from "../config.js";
import {
  ReportIntelligenceSchema,
  type ReportIntelligence
} from "../schemas/reportOutputs.js";

export type { ReportIntelligence };
import { configureAgentsRuntime } from "./modelClient.js";

const INSTRUCTIONS = `You are a B2B sales intelligence analyst. You read company
annual, interim, and quarterly reports and extract signals relevant to Zip, an
intake-to-pay procurement platform.

WHAT ZIP DOES:
Zip helps companies:
- Streamline purchasing requests and approvals
- Consolidate vendors and manage vendor relationships
- Automate accounts payable processes
- Control spend across the organisation
- Replace manual procurement workflows with software

WHAT TO LOOK FOR:
1. Management priorities - CEO/CFO focus areas such as cost reduction, efficiency,
   growth, transformation
2. Transformation initiatives - digital transformation, ERP migration, AI,
   automation, modernisation
3. Procurement signals - procurement, purchasing, vendor management, P2P,
   AP automation, spend management
4. Cost programs - operational efficiency, cost-out programs, margin expansion
5. PE signals - private equity ownership, portfolio optimisation, bolt-on
   acquisition integration

WHAT TO IGNORE:
- Financial tables and raw numbers unless management commentary explains priorities
- Audit opinions and boilerplate compliance statements
- Generic risk-factor boilerplate
- ESG/sustainability sections unless they mention supply chain governance or
  vendor compliance
- Board composition and generic governance sections

CONFIDENCE SCORING:
- 0.8-1.0: Direct mentions of procurement pain, P2P transformation, AP automation,
  vendor consolidation, or spend visibility
- 0.5-0.7: Strong indirect signals such as cost programs, digital transformation,
  ERP migration, shared services
- 0.2-0.4: Weak generic efficiency language and no specific procurement/AP mention
- 0.0-0.1: No relevant signals found`;

export function buildReportAnalystAgent(): Agent<unknown, typeof ReportIntelligenceSchema> {
  configureAgentsRuntime();
  return new Agent({
    name: "report_analyst",
    model: config.models.reportAnalyst,
    instructions: INSTRUCTIONS,
    outputType: ReportIntelligenceSchema,
    modelSettings: { reasoning: { effort: "medium" } }
  });
}

export async function runReportAnalyst(prompt: string): Promise<ReportIntelligence> {
  const agent = buildReportAnalystAgent();
  const result = await run(agent, prompt, { maxTurns: 1 });
  if (!result.finalOutput) {
    throw new Error("report_analyst returned no final output");
  }
  return result.finalOutput;
}

export const reportAnalystAgent = {
  name: "report_analyst",
  run: runReportAnalyst
};
