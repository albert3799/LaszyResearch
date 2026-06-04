import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Agent, run } from "@openai/agents";
import yaml from "js-yaml";
import { z } from "zod";

import {
  PersonaKeySchema,
  StakeholderDepartmentSchema,
  StakeholderMapResultSchema,
  StakeholderRankSchema,
  type PersonaKey,
  type StakeholderClassification,
  type StakeholderDepartment,
  type StakeholderRank
} from "../schemas/stakeholderOutputs.js";
import {
  pullPeopleByCompany,
  type AmplemarketPerson,
  type PullPeopleByCompanyOutput
} from "../tools/amplemarketTool.js";
import {
  persistStakeholders,
  type StakeholderRow
} from "../tools/supabaseTool.js";
import type { Account } from "../types.js";
import { configureAgentsRuntime, defaultFastModel } from "./modelClient.js";

const PersonaDefinitionSchema = z.object({
  key: PersonaKeySchema,
  department: StakeholderDepartmentSchema,
  rank: StakeholderRankSchema,
  one_liner: z.string(),
  ideal_titles: z.array(z.string()).default([]),
  adjacent_titles: z.array(z.string()).default([]),
  title_red_flags: z.array(z.string()).default([]),
  description_signals: z.object({
    positive: z.array(z.string()).default([]),
    negative: z.array(z.string()).default([])
  }),
  decision_role_hint: z.string()
});

const PersonasConfigSchema = z.object({
  personas: z.array(PersonaDefinitionSchema)
});

export type PersonaDefinition = z.infer<typeof PersonaDefinitionSchema>;

let cachedPersonas: PersonaDefinition[] | null = null;

export function loadPersonas(
  configPath = resolve("config/personas.yaml")
): PersonaDefinition[] {
  if (cachedPersonas) return cachedPersonas;
  const raw = readFileSync(configPath, "utf8");
  const parsed = yaml.load(raw);
  const config = PersonasConfigSchema.parse(parsed);
  cachedPersonas = config.personas;
  return cachedPersonas;
}

export function resetPersonasCache(): void {
  cachedPersonas = null;
}

// Lookup table from persona key → department, so we don't trust the model
// to keep them aligned. Mirrors the YAML.
function personaDepartmentMap(): Record<PersonaKey, StakeholderDepartment> {
  const map = {} as Record<PersonaKey, StakeholderDepartment>;
  for (const p of loadPersonas()) map[p.key] = p.department;
  return map;
}

// --- Prompt builders -------------------------------------------------------

function renderPersonas(personas: PersonaDefinition[]): string {
  // Dump as YAML — the model parses it cleanly and editors can diff prompt
  // changes against config/personas.yaml directly.
  return yaml.dump({ personas }, { lineWidth: 100 });
}

function buildSystemPrompt(personas: PersonaDefinition[]): string {
  return `You are a sales prospecting analyst mapping which people at a target company belong to Zip's buying committee.

Zip sells procurement intake + orchestration. Its buyers span four functions:
Procurement (Operations), Finance (spend control), IT Security (vendor security),
and Legal (commercial contracts). A complete buying committee needs at least one
strong contact in each function — losing any one stalls deals.

# Persona taxonomy
Use ONLY these persona keys. Every classification must cite a persona key from
this list or set persona=null when the person does not fit any persona.

${renderPersonas(personas)}

# How to classify each person
1. Read their title FIRST. If the title is in a persona's title_red_flags, that
   persona is excluded — even if other signals look right. (Example: "FinOps
   Analyst" is excluded from both OPS_PROCUREMENT and FINANCE_SPEND_CONTROL
   because FinOps means cloud cost engineering, not financial operations.)
2. If the title matches a persona's ideal_titles, classify them there with high
   confidence. Set rank="high".
3. If the title is an adjacent_titles match, read the headline / about /
   current_position_description for the persona's positive description_signals.
   Classify only if a positive signal is present. Set rank="medium" by default,
   "high" only if the description shows clear scope ownership.
4. If only description signals match (title is generic), require at least one
   strong positive signal AND no negative signal. Set rank="low".
5. If no persona fits, return persona=null, department=null, decision_role=null,
   rank="low", confidence < 0.3, and a one-line rationale explaining why.

# A person can match multiple personas
If someone owns BOTH (e.g. "VP Finance & Legal Ops") return TWO classification
entries — one per matching persona. Do not collapse multi-fits.

# Rank ceiling per persona
Every persona currently has rank="high" in the taxonomy, but downrank the
INDIVIDUAL classification when the fit is weaker (see steps 3–4 above).

# Output rules
- Output ONE classification entry per (person, persona) pair, plus ONE entry
  per person who fits NO persona (with persona=null). Do not silently drop
  anyone — the caller relies on the full list to evaluate recall.
- Every entry MUST include amplemarket_id and linkedin_url exactly as given.
- rationale is 1–2 sentences tying their title/headline/about to Zip's buying
  committee. No marketing language. No invented facts.
- evidence is an array of verbatim phrases (≤25 words each) copied from the
  person's title, headline, about, or current_position_description. Do NOT
  paraphrase. Empty array allowed only when persona=null.
- decision_role uses the decision_role_hint for the matched persona; pick the
  single best fit from: champion, influencer, budget_holder, gatekeeper,
  end_user.
- confidence is 0–1; calibrate honestly. >0.8 = ideal title match with
  reinforcing description. 0.5–0.8 = adjacent title with positive signal.
  <0.5 = description-only or ambiguous.
`;
}

// --- Input shaping ---------------------------------------------------------

interface PersonRecord {
  amplemarket_id: string;
  name: string;
  title: string;
  headline: string;
  about: string;
  current_position_description: string;
  linkedin_url: string;
}

function trim(value: string | null | undefined, max: number): string {
  if (!value) return "";
  const t = value.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function toRecord(person: AmplemarketPerson): PersonRecord {
  return {
    amplemarket_id: person.id,
    name: person.name ?? "",
    title: person.title ?? "",
    headline: trim(person.headline, 250),
    about: trim(person.about, 500),
    current_position_description: trim(person.current_position_description, 250),
    linkedin_url: person.linkedin_url
  };
}

function buildUserMessage(account: Account, records: PersonRecord[]): string {
  const header = [
    `Company: ${account.name}`,
    `Domain: ${account.domain}`,
    account.linkedinUrl ? `LinkedIn: ${account.linkedinUrl}` : "",
    `People to classify: ${records.length}`
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}

Classify every person below against the Zip persona taxonomy. Return one entry per (person, persona) match plus one entry per person who matches no persona.

People (JSON):
${JSON.stringify(records, null, 2)}`;
}

// --- Agent + orchestration -------------------------------------------------

export interface StakeholderMapperOptions {
  model?: string;
  maxTurns?: number;
  persist?: boolean;
  // Pass through when the caller already has the Amplemarket UUID for accounts.
  accountUuid?: string | null;
  // Records per LLM call. Lower if you hit 408 timeouts on the Azure endpoint.
  batchSize?: number;
}

export interface StakeholderMapperResult {
  account: Account;
  company_snapshot: PullPeopleByCompanyOutput["company"];
  pulled_count: number;
  classifications: StakeholderClassification[];
  matched: StakeholderClassification[];
  persisted: { status: "persisted" | "skipped" | "error"; inserted?: number; message?: string };
}

function buildAgent(personas: PersonaDefinition[], model: string) {
  configureAgentsRuntime();
  return new Agent({
    name: "stakeholder_mapper",
    model,
    instructions: buildSystemPrompt(personas),
    tools: [],
    outputType: StakeholderMapResultSchema,
    // Classification, not deep reasoning. Higher effort risks Azure's per-request
    // timeout on large batches without measurable accuracy gain.
    modelSettings: { reasoning: { effort: "low" } }
  });
}

// Azure rejects synchronous Responses calls with 408 when the model takes too
// long. Chunking caps wall-clock per request and lets us parallelize.
const DEFAULT_BATCH_SIZE = 30;

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Drop rows the LLM hallucinated (people not in the input set) and normalize
// department + rank against the persona definitions.
function reconcile(
  classifications: StakeholderClassification[],
  records: PersonRecord[]
): StakeholderClassification[] {
  const validIds = new Set(records.map((r) => r.amplemarket_id));
  const deptMap = personaDepartmentMap();
  return classifications
    .filter((c) => validIds.has(c.amplemarket_id))
    .map((c) => {
      if (!c.persona) return c;
      // Force department to match what the YAML says for this persona.
      return { ...c, department: deptMap[c.persona] };
    });
}

function toStakeholderRow(
  c: StakeholderClassification,
  account: Account,
  accountUuid: string | null | undefined,
  companyName: string | null | undefined,
  model: string
): StakeholderRow | null {
  if (!c.persona || !c.department) return null;
  return {
    account_id: account.id ?? account.domain,
    account_uuid: accountUuid ?? null,
    company_name: companyName ?? account.name,
    company_domain: account.domain,
    amplemarket_id: c.amplemarket_id,
    full_name: c.full_name,
    title: c.title,
    linkedin_url: c.linkedin_url,
    persona: c.persona,
    sub_persona: c.sub_persona,
    department: c.department,
    rank: c.rank,
    decision_role: c.decision_role,
    confidence: c.confidence,
    rationale: c.rationale,
    evidence: c.evidence,
    raw_input: { title: c.title, evidence: c.evidence },
    model
  };
}

export async function mapStakeholdersForAccount(
  account: Account,
  options: StakeholderMapperOptions = {}
): Promise<StakeholderMapperResult> {
  if (!account.domain && !account.linkedinUrl) {
    throw new Error("mapStakeholdersForAccount: account.domain or account.linkedinUrl required");
  }

  // Stage 1: pull every person Amplemarket has indexed in our 4 departments.
  const pulled = await pullPeopleByCompany({
    domain: account.domain,
    linkedin_url: account.linkedinUrl
  });

  if ("type" in pulled) {
    throw new Error(`Amplemarket pull failed (${pulled.type}): ${pulled.message}`);
  }

  if (pulled.people.length === 0) {
    return {
      account,
      company_snapshot: pulled.company,
      pulled_count: 0,
      classifications: [],
      matched: [],
      persisted: { status: "skipped", message: "no people returned by Amplemarket" }
    };
  }

  const records = pulled.people.map(toRecord);
  const personas = loadPersonas();
  const model = options.model ?? defaultFastModel();
  const agent = buildAgent(personas, model);

  // Stage 2: batched LLM classification. Each batch is one Responses call;
  // we run them in parallel so wall-clock ≈ slowest single batch.
  const batches = chunk(records, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const settled = await Promise.allSettled(
    batches.map((batch) =>
      run(agent, buildUserMessage(account, batch), {
        maxTurns: options.maxTurns ?? 1
      })
    )
  );

  const merged: StakeholderClassification[] = [];
  const batchErrors: string[] = [];
  settled.forEach((res, i) => {
    if (res.status === "rejected") {
      batchErrors.push(
        `batch ${i + 1}/${batches.length}: ${
          res.reason instanceof Error ? res.reason.message : String(res.reason)
        }`
      );
      return;
    }
    const finalOutput = res.value.finalOutput;
    if (!finalOutput) {
      batchErrors.push(`batch ${i + 1}/${batches.length}: no final output`);
      return;
    }
    merged.push(...finalOutput.classifications);
  });

  if (merged.length === 0 && batchErrors.length > 0) {
    throw new Error(
      `stakeholder_mapper: all batches failed — ${batchErrors.join("; ")}`
    );
  }
  if (batchErrors.length > 0) {
    console.error(`[stakeholder_mapper] partial failure: ${batchErrors.join("; ")}`);
  }

  const classifications = reconcile(merged, records);
  const matched = classifications.filter((c) => c.persona !== null);

  // Stage 3: persist matched rows.
  let persisted: StakeholderMapperResult["persisted"] = { status: "skipped" };
  if (options.persist !== false) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      persisted = { status: "skipped", message: "Supabase env not configured" };
    } else {
      const rows = matched
        .map((c) =>
          toStakeholderRow(
            c,
            account,
            options.accountUuid,
            pulled.company?.name ?? null,
            model
          )
        )
        .filter((r): r is StakeholderRow => r !== null);
      const outcome = await persistStakeholders(rows);
      persisted = outcome;
    }
  }

  return {
    account,
    company_snapshot: pulled.company,
    pulled_count: pulled.people.length,
    classifications,
    matched,
    persisted
  };
}
