import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { OpenAITool } from "./openaiTools.js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    }
    client = createClient(url, key);
  }
  return client;
}

export async function persistToDb(
  accountData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const db = getClient();
    const row = {
      account_id: accountData.id ?? accountData.domain,
      company_name: accountData.company ?? accountData.company_name,
      company_domain: accountData.domain ?? accountData.company_domain,
      score: accountData.score,
      confidence: accountData.confidence,
      rationale: accountData.rationale,
      key_evidence: accountData.key_evidence,
      recommended_persona: accountData.recommended_persona,
      message_angle: accountData.message_angle,
      raw_research: accountData.raw_research,
      status: "completed"
    };

    const { data, error } = await db.from("account_research").upsert(row).select("id");
    if (error) {
      return { status: "error", message: error.message };
    }
    if (data && data.length > 0) {
      return { status: "persisted", id: data[0].id };
    }
    return { status: "error", message: "No data returned from upsert" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export const persistToDbTool = new OpenAITool({
  name: "persist_to_db",
  description: "Persist a scored account research record to Supabase.",
  parameters: {
    type: "object",
    properties: {
      account_data: {
        type: "object",
        description: "The complete scored account research object."
      }
    },
    required: ["account_data"],
    additionalProperties: false
  },
  handler: (args) => persistToDb(args.account_data as Record<string, unknown>)
});
