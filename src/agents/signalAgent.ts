import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Agent, run } from "@openai/agents";
import yaml from "js-yaml";
import { z } from "zod";

import {
  SignalFindingSchema,
  type SignalFinding
} from "../schemas/agentOutputs.js";
import { webSearchTool as customWebSearchTool } from "../tools/serperTool.js";
import { getHiringSignalsTool as customGetHiringSignalsTool } from "../tools/theirstackTool.js";
import type { Account } from "../types.js";
import {
  configureAgentsRuntime,
  defaultFastModel,
  defaultStrongModel
} from "./modelClient.js";

const SignalDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  buying_reason: z.enum(["drive_savings", "operational_efficiency", "reduce_risk"]),
  trigger_code: z.string(),
  description: z.string(),
  why_it_matters: z.string(),
  search_queries: z.array(z.string()).default([]),
  tool: z.enum(["web_search", "theirstack"]).default("web_search"),
  strength_rubric: z.object({
    strong: z.string(),
    moderate: z.string(),
    weak: z.string(),
    none: z.string()
  }),
  timeliness_rubric: z.object({
    fresh: z.string(),
    stale: z.string(),
    expired: z.string()
  }),
  enabled: z.boolean().default(true)
});

const SignalsConfigSchema = z.object({
  signals: z.array(SignalDefinitionSchema)
});

export type SignalDefinition = z.infer<typeof SignalDefinitionSchema>;

let cachedSignals: SignalDefinition[] | null = null;

export function loadSignals(
  configPath = resolve("config/signals.yaml")
): SignalDefinition[] {
  if (cachedSignals) return cachedSignals;
  const raw = readFileSync(configPath, "utf8");
  const parsed = yaml.load(raw);
  const config = SignalsConfigSchema.parse(parsed);
  cachedSignals = config.signals.filter((s) => s.enabled);
  return cachedSignals;
}

export function resetSignalsCache(): void {
  cachedSignals = null;
}

function renderQueries(queries: string[], account: Account): string[] {
  const year = new Date().getUTCFullYear();
  return queries.map((q) =>
    q
      .replaceAll("{company}", account.name)
      .replaceAll("{domain}", account.domain)
      .replaceAll("{year}", String(year))
  );
}

function buildInstructions(signal: SignalDefinition): string {
  const rubricLines = (rubric: Record<string, string>): string =>
    Object.entries(rubric)
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join("\n");

  return `You are a research analyst hunting for ONE specific buying signal at a company.

# Signal you are researching
Signal id: ${signal.id}
Label: ${signal.label}
Buying reason supported: ${signal.buying_reason}
Description: ${signal.description}
Why it matters to Zip: ${signal.why_it_matters}

# How to search
${
  signal.tool === "theirstack"
    ? "Call the get_hiring_signals tool ONCE with the account info you are given. Do not call any other tool. Do not invent web queries."
    : "Call the web_search tool with the queries you are given, one at a time, in order. Do not invent extra queries. Stop after you have enough evidence."
}

# How to grade the finding
Strength rubric:
${rubricLines(signal.strength_rubric)}

Timeliness rubric:
${rubricLines(signal.timeliness_rubric)}
  - undated: signal exists but no date information is available

# Output rules
- If you find NO evidence of this signal, return found=false, evidence=[], strength="none", timeliness="undated". Still write a short summary and rationale explaining what you looked for.
- If you find evidence, every item in evidence[] MUST have a verbatim quote (<=30 words) and a source_url or document title. Include the date when you can extract one.
- Do not paraphrase quotes. Copy them from the search results.
- summary is 1-2 plain sentences a BDR could read.
- rationale is 1-2 sentences explaining the strength + timeliness call, naming the rubric tier.
- Do not include any signal other than ${signal.id}. If the search results show a different signal, ignore it.`;
}

function buildUserMessage(signal: SignalDefinition, account: Account): string {
  const renderedQueries = renderQueries(signal.search_queries, account);
  const accountBlock = [
    `Company: ${account.name}`,
    `Domain: ${account.domain}`,
    account.linkedinUrl ? `LinkedIn: ${account.linkedinUrl}` : "",
    account.id ? `Account ID: ${account.id}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  if (signal.tool === "theirstack") {
    return `${accountBlock}\n\nResearch the ${signal.label} signal. Call get_hiring_signals with the account info, then grade the result.`;
  }

  const queryBlock =
    renderedQueries.length > 0
      ? renderedQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(no queries provided — improvise minimally and explain in rationale)";

  return `${accountBlock}\n\nResearch the ${signal.label} signal. Run these web_search queries in order:\n${queryBlock}`;
}

interface SignalAgentOptions {
  model?: string;
  maxTurns?: number;
}

export function buildSignalAgent(
  signal: SignalDefinition,
  options: SignalAgentOptions = {}
): Agent<unknown, typeof SignalFindingSchema> {
  configureAgentsRuntime();

  const tools =
    signal.tool === "theirstack"
      ? [customGetHiringSignalsTool.toAgentsTool()]
      : [customWebSearchTool.toAgentsTool()];

  const model =
    options.model ??
    (signal.tool === "theirstack" ? defaultFastModel() : defaultStrongModel());

  return new Agent({
    name: `signal_${signal.id}`,
    model,
    instructions: buildInstructions(signal),
    tools,
    outputType: SignalFindingSchema,
    modelSettings: { reasoning: { effort: "medium" } }
  });
}

export async function runSignalForAccount(
  signal: SignalDefinition,
  account: Account,
  options: SignalAgentOptions = {}
): Promise<SignalFinding> {
  // Skip TheirStack-backed signals when the account has no id/LinkedIn URL
  // — there is nothing to look up.
  if (signal.tool === "theirstack" && !account.id && !account.linkedinUrl) {
    return {
      signal_id: signal.id,
      found: false,
      summary: "Skipped: account has no id or LinkedIn URL for TheirStack lookup.",
      evidence: [],
      strength: "none",
      timeliness: "undated",
      rationale: "No identifier available to query the hiring data source."
    };
  }

  const agent = buildSignalAgent(signal, options);
  const result = await run(agent, buildUserMessage(signal, account), {
    maxTurns: options.maxTurns ?? (signal.tool === "theirstack" ? 3 : 8)
  });

  const finding = result.finalOutput;
  if (!finding) {
    throw new Error(`signal_${signal.id} returned no final output`);
  }
  // Enforce that the agent didn't relabel itself.
  return { ...finding, signal_id: signal.id };
}

export async function runAllSignalsForAccount(
  account: Account,
  signals: SignalDefinition[] = loadSignals()
): Promise<SignalFinding[]> {
  const results = await Promise.allSettled(
    signals.map((s) => runSignalForAccount(s, account))
  );

  return results.map((r, i) => {
    const signal = signals[i];
    if (r.status === "fulfilled") return r.value;
    return {
      signal_id: signal.id,
      found: false,
      summary: `Signal agent errored: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      evidence: [],
      strength: "none" as const,
      timeliness: "undated" as const,
      rationale: "Agent failed to complete; treat as missing data."
    };
  });
}
