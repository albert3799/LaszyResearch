import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Agent, run } from "@openai/agents";
import yaml from "js-yaml";
import { z } from "zod";

import {
  SignalCategorySchema,
  SignalFindingSchema,
  type SignalFinding
} from "../schemas/agentOutputs.js";
import { webSearchTool as customWebSearchTool } from "../tools/serperTool.js";
import {
  getHiringSignals,
  type HiringJob,
  type HiringSignalsOutput
} from "../tools/theirstackTool.js";
import type { Account } from "../types.js";
import { configureAgentsRuntime, defaultStrongModel } from "./modelClient.js";

const SignalDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  category: SignalCategorySchema,
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

function renderRubric(rubric: Record<string, string>): string {
  return Object.entries(rubric)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
}

function buildInstructions(signal: SignalDefinition): string {
  return `You are a research analyst hunting for ONE specific buying signal at a company.

# Signal you are researching
Signal id: ${signal.id}
Label: ${signal.label}
Buying reason supported: ${signal.buying_reason}
Description: ${signal.description}
Why it matters to Zip: ${signal.why_it_matters}

# What counts
Judge the TARGET COMPANY ITSELF — its own corporate events, leadership, systems, and filings. Do NOT count its products, the investment funds it raises to deploy for clients (AUM / fund vintages), its portfolio companies, or its customers. If a search result is about a different company that merely shares the name, ignore it.

# How to search
Call the web_search tool with the queries you are given, one at a time, in order. Do not invent extra queries. Stop after you have enough evidence.

# How to grade the finding
Strength rubric:
${renderRubric(signal.strength_rubric)}

Timeliness rubric:
${renderRubric(signal.timeliness_rubric)}
  - undated: signal exists but no date information is available

# Output rules
- If you find NO evidence of this signal, return found=false, evidence=[], strength="none", timeliness="undated". Still write a short summary and rationale explaining what you looked for.
- If you find evidence, every item in evidence[] MUST have a verbatim quote (<=30 words) and a source_url or document title. Include the date when you can extract one.
- Do not paraphrase quotes. Copy them from the search results.
- summary is 1-2 plain sentences a BDR could read.
- rationale is 1-2 sentences explaining the strength + timeliness call, naming the rubric tier.
- Do not include any signal other than ${signal.id}. If the search results show a different signal, ignore it.`;
}

function accountBlock(account: Account): string {
  return [
    `Company: ${account.name}`,
    `Domain: ${account.domain}`,
    account.linkedinUrl ? `LinkedIn: ${account.linkedinUrl}` : "",
    account.id ? `Account ID: ${account.id}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserMessage(signal: SignalDefinition, account: Account): string {
  const renderedQueries = renderQueries(signal.search_queries, account);
  const queryBlock =
    renderedQueries.length > 0
      ? renderedQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "(no queries provided — improvise minimally and explain in rationale)";

  return `${accountBlock(account)}\n\nResearch the ${signal.label} signal. Run these web_search queries in order:\n${queryBlock}`;
}

interface SignalAgentOptions {
  model?: string;
  maxTurns?: number;
}

// Web-search signals: an agent that runs the configured queries via the
// web_search tool, then grades what it finds.
export function buildSignalAgent(
  signal: SignalDefinition,
  options: SignalAgentOptions = {}
): Agent<unknown, typeof SignalFindingSchema> {
  configureAgentsRuntime();

  return new Agent({
    name: `signal_${signal.id}`,
    model: options.model ?? defaultStrongModel(),
    instructions: buildInstructions(signal),
    tools: [customWebSearchTool.toAgentsTool()],
    outputType: SignalFindingSchema,
    modelSettings: { reasoning: { effort: "medium" } }
  });
}

// ---------------------------------------------------------------------------
// TheirStack (hiring) signals.
//
// Unlike web signals, these do NOT use a tool-calling agent. We call the
// TheirStack tool directly (deterministic), then hand the verbatim job
// postings to a single model read that grades the signal. No tool loop.
// ---------------------------------------------------------------------------

function buildHiringReadInstructions(signal: SignalDefinition): string {
  return `You are a research analyst grading ONE buying signal — "${signal.label}" — for a company.

You are given the company's actual recent job postings (titles + full descriptions),
already pulled from a hiring-data API. You have NO tools — do not attempt to search.
Read the postings and grade the signal from them alone.

# Signal you are grading
Signal id: ${signal.id}
Buying reason supported: ${signal.buying_reason}
Description: ${signal.description}
Why it matters to Zip: ${signal.why_it_matters}

# How to grade the finding
Strength rubric:
${renderRubric(signal.strength_rubric)}

Timeliness rubric:
${renderRubric(signal.timeliness_rubric)}
  - undated: a posting exists but carries no usable date

# Output rules
- If there are NO postings, return found=false, evidence=[], strength="none", timeliness="undated", and a short summary saying no relevant roles are open.
- For each posting that supports the signal, add an evidence item whose quote is a VERBATIM phrase (<=30 words) copied from the job title or description, with source_url set to the posting URL and the date set to the posted date when present.
- Do not paraphrase quotes. Copy them exactly from the posting text.
- Judge strength on whether postings name a specific initiative, vendor, dollar target, or executive sponsor (strong) versus generic transformation language (moderate) versus only junior/operational roles (weak).
- summary is 1-2 plain sentences a BDR could read.
- rationale is 1-2 sentences explaining the strength + timeliness call, naming the rubric tier.`;
}

function formatPosting(job: HiringJob, index: number): string {
  const meta = [
    job.posted_date ? `Posted: ${job.posted_date}` : "",
    job.location ? `Location: ${job.location}` : "",
    job.seniority ? `Seniority: ${job.seniority}` : ""
  ]
    .filter(Boolean)
    .join("  |  ");

  return [
    `[${index + 1}] ${job.title}`,
    meta,
    job.technology_slugs.length ? `Tech: ${job.technology_slugs.join(", ")}` : "",
    job.url ? `URL: ${job.url}` : "",
    "Description:",
    job.description ?? "(no description provided)"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHiringReadMessage(
  signal: SignalDefinition,
  account: Account,
  hiring: HiringSignalsOutput
): string {
  const header = [
    accountBlock(account),
    "",
    `Source: theirstack (${hiring.source}, fetched ${hiring.fetched_at}${hiring.is_stale ? ", STALE" : ""})`,
    `Postings found: ${hiring.jobs_count}`
  ].join("\n");

  if (hiring.jobs.length === 0) {
    return `${header}\n\nNo relevant job postings were found. Grade the ${signal.label} signal as found=false.`;
  }

  const postings = hiring.jobs.map(formatPosting).join("\n\n");
  return `${header}\n\nGrade the ${signal.label} signal from these postings:\n\n${postings}`;
}

function buildHiringReadAgent(
  signal: SignalDefinition,
  options: SignalAgentOptions = {}
): Agent<unknown, typeof SignalFindingSchema> {
  configureAgentsRuntime();

  return new Agent({
    name: `signal_${signal.id}`,
    model: options.model ?? defaultStrongModel(),
    instructions: buildHiringReadInstructions(signal),
    tools: [],
    outputType: SignalFindingSchema,
    modelSettings: { reasoning: { effort: "medium" } }
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFoundFinding(signal: SignalDefinition, reason: string): SignalFinding {
  return {
    signal_id: signal.id,
    found: false,
    summary: reason,
    evidence: [],
    strength: "none",
    timeliness: "undated",
    rationale: "No hiring data available; treat as a real 'no', not missing data."
  };
}

export async function runDirectHiringSignal(
  signal: SignalDefinition,
  account: Account,
  options: SignalAgentOptions = {}
): Promise<SignalFinding> {
  if (!account.id && !account.linkedinUrl) {
    return notFoundFinding(
      signal,
      "Skipped: account has no id or LinkedIn URL for the hiring lookup."
    );
  }

  const hiring = await getHiringSignals({
    account_id: account.id && UUID_RE.test(account.id) ? account.id : undefined,
    company_linkedin_url: account.linkedinUrl
  });

  // HiringToolError carries a `type`; the success shape does not.
  if ("type" in hiring) {
    return notFoundFinding(
      signal,
      `Hiring lookup failed (${hiring.type}): ${hiring.message}`
    );
  }

  const agent = buildHiringReadAgent(signal, options);
  const result = await run(agent, buildHiringReadMessage(signal, account, hiring), {
    maxTurns: options.maxTurns ?? 1
  });

  const finding = result.finalOutput;
  if (!finding) {
    throw new Error(`signal_${signal.id} returned no final output`);
  }
  return { ...finding, signal_id: signal.id };
}

export async function runSignalForAccount(
  signal: SignalDefinition,
  account: Account,
  options: SignalAgentOptions = {}
): Promise<SignalFinding> {
  // TheirStack signals pull job postings directly and grade them in one model
  // read — no tool-calling loop. See runDirectHiringSignal.
  if (signal.tool === "theirstack") {
    return runDirectHiringSignal(signal, account, options);
  }

  const agent = buildSignalAgent(signal, options);
  const result = await run(agent, buildUserMessage(signal, account), {
    maxTurns: options.maxTurns ?? 8
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
