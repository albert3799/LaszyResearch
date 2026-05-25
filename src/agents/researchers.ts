import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Agent, run } from "@openai/agents";
import yaml from "js-yaml";
import { z } from "zod";

import {
  SignalFindingSchema,
  TriggerFindingSchema,
  type SignalFinding,
  type TriggerFinding
} from "../schemas/research.js";
import { webSearchTool } from "../tools/serperTool.js";
import { fetchPageTool } from "../tools/fetchPageTool.js";
import type { Account } from "../types.js";
import { configureAgentsRuntime, defaultStrongModel } from "./modelClient.js";

// ---------------------------------------------------------------------------
// Config schemas
// ---------------------------------------------------------------------------

const StrengthRubricSchema = z.object({
  strong: z.string(),
  moderate: z.string(),
  weak: z.string(),
  none: z.string()
});
const TimelinessRubricSchema = z.object({
  fresh: z.string(),
  stale: z.string(),
  expired: z.string()
});
const DegreeRubricSchema = z.object({
  high: z.string(),
  medium: z.string(),
  low: z.string(),
  none: z.string()
});

const TriggerDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  category: z.enum(["financial", "transformation", "leadership"]),
  description: z.string(),
  why_it_matters: z.string(),
  research_intent: z.string(),
  seed_queries: z.array(z.string()).default([]),
  tools: z.array(z.enum(["web_search", "fetch_page"])).default(["web_search"]),
  strength_rubric: StrengthRubricSchema,
  timeliness_rubric: TimelinessRubricSchema,
  enabled: z.boolean().default(true)
});
export type TriggerDefinition = z.infer<typeof TriggerDefSchema>;

const SignalDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  description: z.string(),
  why_it_matters: z.string(),
  research_intent: z.string(),
  seed_queries: z.array(z.string()).default([]),
  degree_rubric: DegreeRubricSchema,
  enabled: z.boolean().default(true)
});
export type SignalDefinition = z.infer<typeof SignalDefSchema>;

let cachedTriggers: TriggerDefinition[] | null = null;
let cachedSignals: SignalDefinition[] | null = null;

export function loadTriggers(
  configPath = resolve("config/triggers.yaml")
): TriggerDefinition[] {
  if (cachedTriggers) return cachedTriggers;
  const parsed = yaml.load(readFileSync(configPath, "utf8"));
  const config = z.object({ triggers: z.array(TriggerDefSchema) }).parse(parsed);
  cachedTriggers = config.triggers.filter((t) => t.enabled);
  return cachedTriggers;
}

export function loadSignals(
  configPath = resolve("config/characteristics.yaml")
): SignalDefinition[] {
  if (cachedSignals) return cachedSignals;
  const parsed = yaml.load(readFileSync(configPath, "utf8"));
  const config = z.object({ signals: z.array(SignalDefSchema) }).parse(parsed);
  cachedSignals = config.signals.filter((s) => s.enabled);
  return cachedSignals;
}

export function resetResearchCache(): void {
  cachedTriggers = null;
  cachedSignals = null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function renderRubric(rubric: Record<string, string>): string {
  return Object.entries(rubric)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
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

function accountBlock(account: Account): string {
  return [
    `Company: ${account.name}`,
    `Domain: ${account.domain}`,
    account.linkedinUrl ? `LinkedIn: ${account.linkedinUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function seedBlock(queries: string[], account: Account): string {
  const rendered = renderQueries(queries, account);
  return rendered.length
    ? rendered.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "(no seed queries — improvise from the goal)";
}

interface ResearchOptions {
  model?: string;
  maxTurns?: number;
}

// Bounded-concurrency map — keeps simultaneous Serper/model calls in check so we
// don't trigger rate-limit retries (which burn turns). Preserves input order.
const RESEARCH_CONCURRENCY = 4;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

// ---------------------------------------------------------------------------
// Trigger researcher (events: strength + timeliness)
// ---------------------------------------------------------------------------

function buildTriggerInstructions(def: TriggerDefinition): string {
  return `You are a research analyst hunting for ONE recent TRIGGER — an event in roughly
the last 12-18 months that makes NOW a better time for the target company to buy
Zip (an intake-to-pay platform).

# Trigger you are hunting
Name: ${def.label}
What it is: ${def.description}
Why it matters to Zip: ${def.why_it_matters}

# How to research (keep it tight)
Goal: ${def.research_intent}
Run the seed searches first. Then you may run AT MOST 2 extra targeted searches and
open AT MOST 2 pages with fetch_page. After that you MUST stop and output your
finding from what you have — do not keep searching. Budget ~6 tool calls total.
Use the company's real name as it appears; ignore companies that merely share the
name, and ignore the company's products or the funds it raises for clients — judge
the company itself.

# How to grade
Strength rubric:
${renderRubric(def.strength_rubric)}
Timeliness rubric:
${renderRubric(def.timeliness_rubric)}
  - undated: the event exists but no date is available

ZIP-RELEVANCE TEST: the event only counts if it plausibly puts procurement, spend,
or supplier control on the agenda. If it does not, grade it none and say why —
even if the event clearly happened.

# Output rules
- No evidence -> found=false, evidence=[], strength=none, timeliness=undated, with a
  short summary of what you checked.
- Every evidence item: a VERBATIM quote (<=30 words) + source_url + date if available.
- Do not paraphrase quotes — copy them from the source.
- summary: 1-2 sentences a BDR can read. rationale: name the strength + timeliness tier.`;
}

export function buildTriggerAgent(
  def: TriggerDefinition,
  options: ResearchOptions = {}
): Agent<unknown, typeof TriggerFindingSchema> {
  configureAgentsRuntime();
  const tools = def.tools.map((t) =>
    t === "fetch_page" ? fetchPageTool.toAgentsTool() : webSearchTool.toAgentsTool()
  );
  return new Agent({
    name: `trigger_${def.id}`,
    model: options.model ?? defaultStrongModel(),
    instructions: buildTriggerInstructions(def),
    tools,
    outputType: TriggerFindingSchema,
    modelSettings: { reasoning: { effort: "medium" } }
  });
}

export async function runTrigger(
  def: TriggerDefinition,
  account: Account,
  options: ResearchOptions = {}
): Promise<TriggerFinding> {
  const agent = buildTriggerAgent(def, options);
  const message = `${accountBlock(account)}\n\nResearch the "${def.label}" trigger. Seed searches:\n${seedBlock(def.seed_queries, account)}`;
  const result = await run(agent, message, {
    maxTurns: options.maxTurns ?? (def.tools.includes("fetch_page") ? 16 : 12)
  });
  const finding = result.finalOutput;
  if (!finding) throw new Error(`trigger_${def.id} returned no final output`);
  return { ...finding, trigger_id: def.id };
}

export async function runAllTriggers(
  account: Account,
  triggers: TriggerDefinition[] = loadTriggers()
): Promise<TriggerFinding[]> {
  const results = await mapLimit(triggers, RESEARCH_CONCURRENCY, (t) =>
    runTrigger(t, account)
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      trigger_id: triggers[i].id,
      found: false,
      strength: "none" as const,
      timeliness: "undated" as const,
      evidence: [],
      summary: `Trigger agent errored: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      rationale: "Agent failed to complete; treat as missing data."
    };
  });
}

// ---------------------------------------------------------------------------
// Signal researcher (characteristics: degree, no timeliness)
// ---------------------------------------------------------------------------

function buildSignalInstructions(def: SignalDefinition): string {
  return `You are a research analyst assessing ONE enduring CHARACTERISTIC of the target
company that makes it a better or worse FIT for Zip (an intake-to-pay platform).
You are NOT looking for recent news — you are judging a stable trait of the business.

# Characteristic you are assessing
Name: ${def.label}
What it means: ${def.description}
Why it matters to Zip: ${def.why_it_matters}

# How to research (keep it tight)
Goal: ${def.research_intent}
Run the seed searches first. Then you may run AT MOST 2 extra targeted searches.
After that you MUST stop and output your finding from what you have — do not keep
searching. Budget ~5 searches total. Judge the company itself, not its products or
the funds it raises for clients. Ignore companies that merely share the name.

# How to grade (DEGREE, not recency — characteristics are enduring)
Degree rubric:
${renderRubric(def.degree_rubric)}

ZIP-RELEVANCE TEST: the trait only counts if it plausibly increases the need for
procurement / spend / supplier control. If not, grade it none and say why.

# Output rules
- Doesn't apply -> present=false, degree=none, evidence=[], with a short summary.
- Every evidence item: a VERBATIM quote (<=30 words) + source_url (date optional).
- Do not paraphrase quotes.
- summary: 1-2 sentences a BDR can read. rationale: name the degree tier.`;
}

export function buildSignalAgent(
  def: SignalDefinition,
  options: ResearchOptions = {}
): Agent<unknown, typeof SignalFindingSchema> {
  configureAgentsRuntime();
  return new Agent({
    name: `signal_${def.id}`,
    model: options.model ?? defaultStrongModel(),
    instructions: buildSignalInstructions(def),
    tools: [webSearchTool.toAgentsTool()],
    outputType: SignalFindingSchema,
    modelSettings: { reasoning: { effort: "medium" } }
  });
}

export async function runSignal(
  def: SignalDefinition,
  account: Account,
  options: ResearchOptions = {}
): Promise<SignalFinding> {
  const agent = buildSignalAgent(def, options);
  const message = `${accountBlock(account)}\n\nAssess the "${def.label}" characteristic. Seed searches:\n${seedBlock(def.seed_queries, account)}`;
  const result = await run(agent, message, { maxTurns: options.maxTurns ?? 12 });
  const finding = result.finalOutput;
  if (!finding) throw new Error(`signal_${def.id} returned no final output`);
  return { ...finding, signal_id: def.id };
}

export async function runAllSignals(
  account: Account,
  signals: SignalDefinition[] = loadSignals()
): Promise<SignalFinding[]> {
  const results = await mapLimit(signals, RESEARCH_CONCURRENCY, (s) =>
    runSignal(s, account)
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      signal_id: signals[i].id,
      present: false,
      degree: "none" as const,
      evidence: [],
      summary: `Signal agent errored: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      rationale: "Agent failed to complete; treat as missing data."
    };
  });
}
