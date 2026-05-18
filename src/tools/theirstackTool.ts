import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { OpenAITool } from "./openaiTools.js";

type JsonRecord = Record<string, unknown>;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;

const HIRING_TITLE_TERMS = [
  "accounts payable",
  "accounts payable manager",
  "ap automation lead",
  "category manager",
  "contract manager",
  "contracts manager",
  "finance systems manager",
  "finance transformation",
  "it procurement",
  "procure-to-pay",
  "procure to pay",
  "procurement",
  "procurement transformation",
  "purchasing",
  "source-to-pay",
  "source to pay",
  "strategic sourcing",
  "supplier management",
  "supplier risk",
  "third party risk",
  "third-party risk",
  "vendor due diligence",
  "vendor governance",
  "vendor management",
  "vendor onboarding",
  "vendor risk",
  "vendor security"
] as const;

const HIRING_TITLE_PATTERNS = [
  "\\bERP\\b",
  "\\bSOX\\b",
  "\\bTPRM\\b",
  "\\bP2P\\b",
  "\\bS2P\\b"
] as const;

const EXCLUDED_TITLE_TERMS = [
  "commercial finance",
  "treasury",
  "treasurer",
  "tax",
  "revenue operations",
  "revenue ops"
] as const;

const EXCLUDED_TITLE_PATTERNS = [
  "\\bcommercial finance\\b",
  "\\btreasury\\b",
  "\\btreasurer\\b",
  "\\btax\\b",
  "\\brevenue operations\\b",
  "\\brevenue ops\\b"
] as const;

interface AccountRow {
  id: string;
  company_name: string;
  website: string | null;
  linkedin_url: string | null;
}

export interface HiringJob {
  title: string;
  posted_date: string | null;
  location: string | null;
  seniority: string | null;
  technology_slugs: string[];
  url: string | null;
  description: string | null;
  description_snippet: string | null;
}

export interface HiringCacheRow {
  company_linkedin_url: string;
  domain: string | null;
  jobs: HiringJob[];
  raw_jobs: JsonRecord[];
  response_metadata: JsonRecord;
  company_object: JsonRecord | null;
  raw_response: JsonRecord;
  jobs_count: number;
  fetched_at: string;
  refresh_count: number;
}

export interface HiringSignalsOutput {
  account_id: string;
  account_name: string;
  company_linkedin_url: string;
  domain: string | null;
  jobs_count: number;
  jobs: HiringJob[];
  fetched_at: string;
  cache_hit: boolean;
  is_stale: boolean;
  source: "cache" | "theirstack";
}

export interface HiringToolError {
  type: "invalid_input" | "not_found" | "auth" | "transient";
  message: string;
  account_id?: string;
  retry_after?: number;
}

export type HiringSignalsResult = HiringSignalsOutput | HiringToolError;

export interface HiringSignalsDb {
  getAccount(accountId: string): Promise<{ account: AccountRow | null; error?: string }>;
  getCache(companyLinkedInUrl: string): Promise<{ cache: HiringCacheRow | null; error?: string }>;
  upsertCache(row: {
    company_linkedin_url: string;
    domain: string | null;
    jobs: HiringJob[];
    raw_jobs: JsonRecord[];
    response_metadata: JsonRecord;
    company_object: JsonRecord | null;
    raw_response: JsonRecord;
    jobs_count: number;
    fetched_at: string;
    refresh_count: number;
    last_error: string | null;
    last_error_at: string | null;
  }): Promise<{ error?: string }>;
}

interface HiringSignalsDeps {
  db?: HiringSignalsDb;
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface TheirStackJob {
  id?: string | number | null;
  job_title?: string | null;
  title?: string | null;
  date_posted?: string | null;
  posted_date?: string | null;
  location?: unknown;
  seniority?: string | null;
  technology_slugs?: unknown;
  final_url?: string | null;
  url?: string | null;
  source_url?: string | null;
  description?: string | null;
}

class SupabaseHiringSignalsDb implements HiringSignalsDb {
  constructor(private readonly client: SupabaseClient) {}

  async getAccount(accountId: string): Promise<{ account: AccountRow | null; error?: string }> {
    const { data, error } = await this.client
      .from("accounts")
      .select("id, company_name, website, linkedin_url")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      return { account: null, error: error.message };
    }

    return { account: data as AccountRow | null };
  }

  async getCache(companyLinkedInUrl: string): Promise<{ cache: HiringCacheRow | null; error?: string }> {
    const { data, error } = await this.client
      .from("company_hiring_signals")
      .select(
        "company_linkedin_url, domain, jobs, raw_jobs, response_metadata, company_object, raw_response, jobs_count, fetched_at, refresh_count"
      )
      .eq("company_linkedin_url", companyLinkedInUrl)
      .maybeSingle();

    if (error) {
      return { cache: null, error: error.message };
    }
    if (!data) {
      return { cache: null };
    }

    const row = data as {
      company_linkedin_url: string;
      domain: string | null;
      jobs?: unknown;
      raw_jobs?: unknown;
      response_metadata?: unknown;
      company_object?: unknown;
      raw_response?: unknown;
      jobs_count?: number;
      fetched_at?: string;
      refresh_count?: number;
    };

    const jobs = Array.isArray(row.jobs) ? row.jobs.map(normalizeCachedJob) : [];
    return {
      cache: {
        company_linkedin_url: row.company_linkedin_url,
        domain: row.domain,
        jobs,
        raw_jobs: normalizeJsonArray(row.raw_jobs),
        response_metadata: normalizeJsonRecord(row.response_metadata),
        company_object: normalizeOptionalJsonRecord(row.company_object),
        raw_response: normalizeJsonRecord(row.raw_response),
        jobs_count: Number(row.jobs_count ?? jobs.length),
        fetched_at: String(row.fetched_at ?? new Date(0).toISOString()),
        refresh_count: Number(row.refresh_count ?? 0)
      }
    };
  }

  async upsertCache(row: {
    company_linkedin_url: string;
    domain: string | null;
    jobs: HiringJob[];
    raw_jobs: JsonRecord[];
    response_metadata: JsonRecord;
    company_object: JsonRecord | null;
    raw_response: JsonRecord;
    jobs_count: number;
    fetched_at: string;
    refresh_count: number;
    last_error: string | null;
    last_error_at: string | null;
  }): Promise<{ error?: string }> {
    const { error } = await this.client
      .from("company_hiring_signals")
      .upsert(row, { onConflict: "company_linkedin_url" });

    return error ? { error: error.message } : {};
  }
}

let defaultDb: HiringSignalsDb | null = null;

function getDefaultDb(): HiringSignalsDb {
  if (defaultDb) {
    return defaultDb;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }

  defaultDb = new SupabaseHiringSignalsDb(createClient(url, key));
  return defaultDb;
}

function invalidInput(message: string, accountId?: string): HiringToolError {
  return { type: "invalid_input", message, account_id: accountId };
}

function notFound(message: string, accountId: string): HiringToolError {
  return { type: "not_found", message, account_id: accountId };
}

function authError(message: string, accountId: string): HiringToolError {
  return { type: "auth", message, account_id: accountId };
}

function transientError(
  message: string,
  accountId: string,
  retryAfter?: number
): HiringToolError {
  return {
    type: "transient",
    message,
    account_id: accountId,
    ...(retryAfter === undefined ? {} : { retry_after: retryAfter })
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeDomain(raw: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutPath = withoutProtocol.split(/[/?#]/, 1)[0]?.trim() ?? "";
  const lowered = withoutPath.toLowerCase();
  const withoutWww = lowered.replace(/^www\./, "");

  if (!withoutWww || !withoutWww.includes(".")) return null;
  if (withoutWww.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-"))) return null;

  return /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9]{2,63}$/.test(withoutWww)
    ? withoutWww
    : null;
}

export function normalizeCompanyLinkedInUrl(raw: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "linkedin.com" && !hostname.endsWith(".linkedin.com")) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== "company" || !segments[1]) {
      return null;
    }

    const slug = decodeURIComponent(segments[1]).trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+$/.test(slug)) {
      return null;
    }

    return `https://www.linkedin.com/company/${slug}/`;
  } catch {
    return null;
  }
}

function cacheIsFresh(cache: HiringCacheRow, now: Date): boolean {
  const fetchedAt = Date.parse(cache.fetched_at);
  return Number.isFinite(fetchedAt) && now.getTime() - fetchedAt < CACHE_TTL_MS;
}

function fromCache(
  accountId: string,
  accountName: string,
  cache: HiringCacheRow,
  isStale: boolean
): HiringSignalsOutput {
  return {
    account_id: accountId,
    account_name: accountName,
    company_linkedin_url: cache.company_linkedin_url,
    domain: cache.domain,
    jobs_count: cache.jobs_count,
    jobs: cache.jobs,
    fetched_at: cache.fetched_at,
    cache_hit: true,
    is_stale: isStale,
    source: "cache"
  };
}

function toYYYYMMDD(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function twelveMonthsAgoYYYYMMDD(now: Date): string {
  const date = new Date(now.getTime());
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return toYYYYMMDD(date);
}

function theirStackSearchBody(companyLinkedInUrl: string, now: Date): Record<string, unknown> {
  return {
    company_linkedin_url_or: [companyLinkedInUrl],
    posted_at_gte: twelveMonthsAgoYYYYMMDD(now),
    job_title_or: [...HIRING_TITLE_TERMS],
    job_title_pattern_or: [...HIRING_TITLE_PATTERNS],
    job_title_not: [...EXCLUDED_TITLE_TERMS],
    job_title_pattern_not: [...EXCLUDED_TITLE_PATTERNS],
    limit: 5,
    offset: 0,
    include_total_results: false,
    order_by: [{ field: "date_posted", desc: true }]
  };
}

function theirStackLegacySearchBody(companyIdentifier: string, now: Date): Record<string, unknown> {
  const linkedInUrl = normalizeCompanyLinkedInUrl(companyIdentifier);
  if (linkedInUrl) {
    return theirStackSearchBody(linkedInUrl, now);
  }

  return {
    ...theirStackSearchBody("https://www.linkedin.com/company/placeholder/", now),
    company_linkedin_url_or: undefined,
    company_domain_or: [normalizeDomain(companyIdentifier) ?? companyIdentifier]
  };
}

function retryAfterSeconds(response: Response, now: Date): number | undefined {
  const header =
    response.headers.get("ratelimit-reset") ??
    response.headers.get("RateLimit-Reset");

  if (!header) {
    return undefined;
  }

  const numeric = Number(header);
  if (Number.isFinite(numeric)) {
    if (numeric > 1_000_000_000) {
      return Math.max(0, Math.ceil((numeric * 1000 - now.getTime()) / 1000));
    }
    return Math.max(0, Math.ceil(numeric));
  }

  const parsedDate = Date.parse(header);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, Math.ceil((parsedDate - now.getTime()) / 1000));
  }

  return undefined;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractTheirStackJobs(payload: unknown): TheirStackJob[] {
  if (Array.isArray(payload)) {
    return payload as TheirStackJob[];
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const object = payload as Record<string, unknown>;
  for (const key of ["data", "jobs", "results"]) {
    if (Array.isArray(object[key])) {
      return object[key] as TheirStackJob[];
    }
  }

  return [];
}

function normalizeJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function normalizeOptionalJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function normalizeJsonArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function extractTheirStackMetadata(payload: unknown): JsonRecord {
  const object = normalizeJsonRecord(payload);
  const metadata = normalizeJsonRecord(object.metadata);

  if (Object.keys(metadata).length > 0) {
    return metadata;
  }

  const fallbackKeys = [
    "total_results",
    "total_companies",
    "truncated_results",
    "truncated_companies"
  ];
  return Object.fromEntries(
    fallbackKeys
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]])
  );
}

function extractCompanyObject(rawJobs: TheirStackJob[]): JsonRecord | null {
  for (const job of rawJobs) {
    const companyObject = normalizeOptionalJsonRecord(
      (job as JsonRecord).company_object
    );
    if (companyObject) {
      return companyObject;
    }
  }

  return null;
}

function normalizeLocation(location: unknown): string | null {
  if (typeof location === "string") {
    return location || null;
  }
  if (!location || typeof location !== "object") {
    return null;
  }
  return JSON.stringify(location);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeDescription(description: string | null | undefined): string | null {
  if (!description) {
    return null;
  }

  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function descriptionSnippet(description: string | null): string | null {
  return description ? description.slice(0, 800) : null;
}

function toHiringJob(job: TheirStackJob): HiringJob {
  const description = normalizeDescription(job.description);

  return {
    title: String(job.job_title ?? job.title ?? ""),
    posted_date: job.date_posted ?? job.posted_date ?? null,
    location: normalizeLocation(job.location),
    seniority: job.seniority ?? null,
    technology_slugs: normalizeStringArray(job.technology_slugs),
    url: job.final_url ?? job.url ?? job.source_url ?? null,
    description,
    description_snippet: descriptionSnippet(description)
  };
}

function normalizeCachedJob(value: unknown): HiringJob {
  const job = (value && typeof value === "object" ? value : {}) as Partial<HiringJob>;
  const description = job.description ?? null;
  return {
    title: String(job.title ?? ""),
    posted_date: job.posted_date ?? null,
    location: job.location ?? null,
    seniority: job.seniority ?? null,
    technology_slugs: normalizeStringArray(job.technology_slugs),
    url: job.url ?? null,
    description,
    description_snippet: job.description_snippet ?? descriptionSnippet(description)
  };
}

function normalizeTheirStackJobs(rawJobs: TheirStackJob[]): HiringJob[] {
  const seenIds = new Set<string>();
  const jobs: HiringJob[] = [];

  for (const rawJob of rawJobs) {
    const id = rawJob.id === undefined || rawJob.id === null ? null : String(rawJob.id);
    if (id) {
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
    }

    const job = toHiringJob(rawJob);
    if (!job.title) {
      continue;
    }
    jobs.push(job);
    if (jobs.length >= 5) {
      break;
    }
  }

  return jobs;
}

interface TheirStackSearchResult {
  jobs?: HiringJob[];
  rawJobs?: JsonRecord[];
  responseMetadata?: JsonRecord;
  companyObject?: JsonRecord | null;
  rawResponse?: JsonRecord;
  error?: HiringToolError;
}

async function searchTheirStackHiringJobs(
  accountId: string,
  companyLinkedInUrl: string,
  deps: Required<Pick<HiringSignalsDeps, "fetch" | "now" | "sleep">>
): Promise<TheirStackSearchResult> {
  const apiKey = process.env.THEIRSTACK_API_KEY;
  if (!apiKey) {
    return { error: authError("THEIRSTACK_API_KEY not set in environment variables", accountId) };
  }

  const body = theirStackSearchBody(companyLinkedInUrl, deps.now());
  let lastRetryAfter: number | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await deps.fetch("https://api.theirstack.com/v1/jobs/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      return {
        error: transientError(
          `TheirStack network request failed: ${error instanceof Error ? error.message : String(error)}`,
          accountId
        )
      };
    }

    if (response.ok) {
      const payload = await parseResponseBody(response);
      const rawJobs = extractTheirStackJobs(payload);
      return {
        jobs: normalizeTheirStackJobs(rawJobs),
        rawJobs: rawJobs.map((job) => ({ ...job }) as JsonRecord),
        responseMetadata: extractTheirStackMetadata(payload),
        companyObject: extractCompanyObject(rawJobs),
        rawResponse: normalizeJsonRecord(payload)
      };
    }

    if (response.status === 401 || response.status === 402) {
      return {
        error: authError(
          `TheirStack authentication or credits error: ${response.status} ${response.statusText}`,
          accountId
        )
      };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) {
      return {
        error: transientError(
          `TheirStack request failed: ${response.status} ${response.statusText}`,
          accountId
        )
      };
    }

    lastRetryAfter = retryAfterSeconds(response, deps.now());
    if (attempt < MAX_RETRIES) {
      await deps.sleep((lastRetryAfter ?? attempt + 1) * 1000);
    }
  }

  return {
    error: transientError(
      "TheirStack request failed after retries",
      accountId,
      lastRetryAfter
    )
  };
}

export async function getHiringSignals(
  input: { account_id?: unknown; force_refresh?: unknown },
  deps: HiringSignalsDeps = {}
): Promise<HiringSignalsResult> {
  const accountId = typeof input.account_id === "string" ? input.account_id.trim() : "";
  const forceRefresh = input.force_refresh === true;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const fetchImpl = deps.fetch ?? fetch;

  if (!accountId) {
    return invalidInput("account_id is required");
  }
  if (!isUuid(accountId)) {
    return invalidInput("account_id must be a valid UUID", accountId);
  }

  let db: HiringSignalsDb;
  try {
    db = deps.db ?? getDefaultDb();
  } catch (error) {
    return transientError(
      error instanceof Error ? error.message : String(error),
      accountId
    );
  }

  const accountResult = await db.getAccount(accountId);
  if (accountResult.error) {
    return transientError(`Account lookup failed: ${accountResult.error}`, accountId);
  }
  if (!accountResult.account) {
    return notFound("Account not found", accountId);
  }

  const account = accountResult.account;
  const companyLinkedInUrl = normalizeCompanyLinkedInUrl(account.linkedin_url);
  if (!companyLinkedInUrl) {
    return notFound("Account has no valid company LinkedIn URL", accountId);
  }
  const domain = normalizeDomain(account.website);

  const cacheResult = await db.getCache(companyLinkedInUrl);
  if (cacheResult.error) {
    return transientError(`Hiring cache read failed: ${cacheResult.error}`, accountId);
  }

  const cache = cacheResult.cache;
  if (cache && cacheIsFresh(cache, now()) && !forceRefresh) {
    return fromCache(accountId, account.company_name, cache, false);
  }

  const theirStackResult = await searchTheirStackHiringJobs(accountId, companyLinkedInUrl, {
    fetch: fetchImpl,
    now,
    sleep
  });

  if (theirStackResult.error) {
    if (theirStackResult.error.type === "transient" && cache) {
      return fromCache(accountId, account.company_name, cache, true);
    }
    return theirStackResult.error;
  }

  const fetchedAt = now().toISOString();
  const jobs = theirStackResult.jobs ?? [];
  const writeResult = await db.upsertCache({
    company_linkedin_url: companyLinkedInUrl,
    domain,
    jobs,
    raw_jobs: theirStackResult.rawJobs ?? [],
    response_metadata: theirStackResult.responseMetadata ?? {},
    company_object: theirStackResult.companyObject ?? null,
    raw_response: theirStackResult.rawResponse ?? {},
    jobs_count: jobs.length,
    fetched_at: fetchedAt,
    refresh_count: (cache?.refresh_count ?? 0) + 1,
    last_error: null,
    last_error_at: null
  });

  if (writeResult.error) {
    return transientError(`Hiring cache write failed: ${writeResult.error}`, accountId);
  }

  return {
    account_id: accountId,
    account_name: account.company_name,
    company_linkedin_url: companyLinkedInUrl,
    domain,
    jobs_count: jobs.length,
    jobs,
    fetched_at: fetchedAt,
    cache_hit: false,
    is_stale: false,
    source: "theirstack"
  };
}

export async function searchTheirStack(companyDomain: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.THEIRSTACK_API_KEY;
  if (!apiKey) {
    return { error: "THEIRSTACK_API_KEY not set in environment variables" };
  }

  try {
    const response = await fetch("https://api.theirstack.com/v1/jobs/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(theirStackLegacySearchBody(companyDomain, new Date())),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      return {
        error: `TheirStack request failed: ${response.status} ${response.statusText}`
      };
    }

    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    return {
      error: `TheirStack request failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export const getHiringSignalsTool = new OpenAITool({
  name: "get_hiring_signals",
  description:
    "Returns recent job postings for a company, focused on procurement, finance, AP, and vendor-risk roles. Cached for 30 days -- first call hits TheirStack (paid API, use sparingly), subsequent calls within the window are free. Use this when looking for a hiring trigger to anchor outbound. Returns jobs_count: 0 and an empty jobs array if no relevant openings exist; do not fabricate a hiring trigger.",
  parameters: {
    type: "object",
    properties: {
      account_id: {
        type: "string",
        description: "Required account UUID."
      },
      force_refresh: {
        type: "boolean",
        description: "When true, bypass fresh cache and call TheirStack."
      }
    },
    required: ["account_id"],
    additionalProperties: false
  },
  handler: (args) => getHiringSignals(args)
});

export const searchTheirStackTool = new OpenAITool({
  name: "search_theirstack",
  description: "Pull open job listings from TheirStack for a company domain.",
  parameters: {
    type: "object",
    properties: {
      company_domain: {
        type: "string",
        description: "The company's domain, e.g. acmecorp.com."
      }
    },
    required: ["company_domain"],
    additionalProperties: false
  },
  handler: (args) => searchTheirStack(String(args.company_domain ?? ""))
});
