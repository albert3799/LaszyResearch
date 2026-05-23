import { Agent, run, webSearchTool } from "@openai/agents";
import { z } from "zod";

import { scrapeLinkedInProfileTool } from "../tools/apifyTool.js";
import { configureAgentsRuntime, defaultFastModel } from "./modelClient.js";

export const StakeholderSchema = z.object({
  name: z.string(),
  title: z.string(),
  tenure: z.string(),
  background: z.string()
});

export const LinkedinOutputSchema = z.object({
  stakeholders: z.array(StakeholderSchema)
});

export type LinkedinOutput = z.infer<typeof LinkedinOutputSchema>;

const INSTRUCTIONS = `You find key stakeholders at the target company who would be
decision-makers or influencers for procurement / spend management tooling.

Target titles (in priority order):
- Chief Procurement Officer (CPO)
- VP/Director of Procurement
- VP/Director of Finance Operations
- Chief Financial Officer (CFO)
- VP/Director of Accounts Payable
- Head of Strategic Sourcing
- VP/Director of Operations

Process:
1. Use web_search to find LinkedIn profile URLs matching these titles at the company.
2. Call scrape_linkedin_profile on the top 2-3 most relevant URLs.
3. Extract structured data from each profile.

If you cannot find relevant stakeholders, return stakeholders=[].`;

export function buildLinkedinAgent(): Agent<unknown, typeof LinkedinOutputSchema> {
  configureAgentsRuntime();
  return new Agent({
    name: "linkedin",
    model: defaultFastModel(),
    instructions: INSTRUCTIONS,
    tools: [scrapeLinkedInProfileTool.toAgentsTool(), webSearchTool()],
    outputType: LinkedinOutputSchema,
    modelSettings: { reasoning: { effort: "low" } }
  });
}

export async function runLinkedinForCompany(
  company: string,
  domain: string
): Promise<LinkedinOutput> {
  const agent = buildLinkedinAgent();
  const result = await run(
    agent,
    `Find procurement decision-makers at ${company} (${domain}).`,
    { maxTurns: 5 }
  );
  if (!result.finalOutput) {
    throw new Error("linkedin agent returned no final output");
  }
  return result.finalOutput;
}
