import { persistToDbTool } from "../tools/supabaseTool.js";
import { Agent, FAST_MODEL } from "./openaiAgent.js";

export const outputAgent = new Agent({
  name: "output",
  model: FAST_MODEL,
  system: `You take scored account research data and persist it to the database.

You will receive a JSON object with the complete research output for one account,
including: company name, domain, score, confidence, rationale, key evidence,
recommended persona, message angle, and raw research data.

Your job:
1. Parse the input to extract the required fields
2. Call persist_to_db with the complete account data
3. Confirm the write was successful

Do not modify the data - persist it exactly as received.
If the write fails, report the error clearly.`,
  tools: [persistToDbTool],
  maxTurns: 2,
  jsonMode: false,
  reasoningEffort: "low",
  forceToolName: "persist_to_db"
});
