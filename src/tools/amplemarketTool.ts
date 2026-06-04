import { OpenAITool } from "./openaiTools.js";

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";
const PEOPLE_SEARCH_PATH = "/people/search";

const TARGET_DEPARTMENTS = [
  "Operations",
  "Information Technology",
  "Finance",
  "Legal"
] as const;

const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const REQUEST_TIMEOUT_MS = 30_000;

// Defense in depth: never let this tool talk to credit-consuming endpoints,
// even if a future caller passes a custom path. See docs/amplemarket-api.md.
const BANNED_PATH_SEGMENTS = [
  "/people/find",
  "/companies/find",
  "/email-validations",
  "/phone-numbers/review"
] as const;

export interface AmplemarketPerson {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  linkedin_url: string;
  title: string | null;
  headline: string | null;
  about: string | null;
  location: string | null;
  current_position_start_date: string | null;
  current_position_description: string | null;
  experiences: Array<{
    title: string;
    company_name: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;
}

export interface AmplemarketCompanySnapshot {
  id: string | null;
  name: string | null;
  linkedin_url: string | null;
  website: string | null;
  estimated_number_of_employees: number | null;
  size: string | null;
  location: string | null;
}

export interface PullPeopleByCompanyOutput {
  company: AmplemarketCompanySnapshot | null;
  total_indexed: number;
  people_count: number;
  people: AmplemarketPerson[];
  pages_fetched: number;
  truncated: boolean;
}

export interface AmplemarketToolError {
  type: "invalid_input" | "auth" | "not_found" | "transient" | "banned_path";
  message: string;
}

export type PullPeopleByCompanyResult = PullPeopleByCompanyOutput | AmplemarketToolError;

interface PullPeopleDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function invalidInput(message: string): AmplemarketToolError {
  return { type: "invalid_input", message };
}

function authError(message: string): AmplemarketToolError {
  return { type: "auth", message };
}

function transientError(message: string): AmplemarketToolError {
  return { type: "transient", message };
}

function bannedPathError(message: string): AmplemarketToolError {
  return { type: "banned_path", message };
}

function assertEndpointAllowed(path: string): AmplemarketToolError | null {
  for (const banned of BANNED_PATH_SEGMENTS) {
    if (path.startsWith(banned)) {
      return bannedPathError(
        `Refusing to call ${path}: it consumes paid credits. Free endpoints only.`
      );
    }
  }
  return null;
}

function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutPath = withoutProtocol.split(/[/?#]/, 1)[0]?.trim() ?? "";
  const lowered = withoutPath.toLowerCase().replace(/^www\./, "");

  if (!lowered.includes(".")) return null;
  return /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9]{2,63}$/.test(lowered) ? lowered : null;
}

function normalizeCompanyLinkedInUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0]?.toLowerCase() !== "company" || !segments[1]) return null;
    const slug = decodeURIComponent(segments[1]).trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+$/.test(slug)) return null;
    return `https://www.linkedin.com/company/${slug}/`;
  } catch {
    return null;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickCompanySnapshot(payload: Record<string, unknown>): AmplemarketCompanySnapshot | null {
  const results = Array.isArray(payload.results) ? payload.results : [];
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const company = (entry as Record<string, unknown>).company;
    if (company && typeof company === "object") {
      const c = company as Record<string, unknown>;
      return {
        id: typeof c.id === "string" ? c.id : null,
        name: typeof c.name === "string" ? c.name : null,
        linkedin_url: typeof c.linkedin_url === "string" ? c.linkedin_url : null,
        website: typeof c.website === "string" ? c.website : null,
        estimated_number_of_employees:
          typeof c.estimated_number_of_employees === "number" ? c.estimated_number_of_employees : null,
        size: typeof c.size === "string" ? c.size : null,
        location: typeof c.location === "string" ? c.location : null
      };
    }
  }
  return null;
}

function pickExperiences(value: unknown): AmplemarketPerson["experiences"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      company_name: typeof item.company_name === "string" ? item.company_name : "",
      description: typeof item.description === "string" ? item.description : null,
      start_date: typeof item.start_date === "string" ? item.start_date : null,
      end_date: typeof item.end_date === "string" ? item.end_date : null
    }));
}

function toPerson(raw: Record<string, unknown>): AmplemarketPerson | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const linkedinUrl = typeof raw.linkedin_url === "string" ? raw.linkedin_url : null;
  if (!id || !linkedinUrl) return null;

  return {
    id,
    name: typeof raw.name === "string" ? raw.name : null,
    first_name: typeof raw.first_name === "string" ? raw.first_name : null,
    last_name: typeof raw.last_name === "string" ? raw.last_name : null,
    linkedin_url: linkedinUrl,
    title: typeof raw.title === "string" ? raw.title : null,
    headline: typeof raw.headline === "string" ? raw.headline : null,
    about: typeof raw.about === "string" ? raw.about : null,
    location: typeof raw.location === "string" ? raw.location : null,
    current_position_start_date:
      typeof raw.current_position_start_date === "string" ? raw.current_position_start_date : null,
    current_position_description:
      typeof raw.current_position_description === "string" ? raw.current_position_description : null,
    experiences: pickExperiences(raw.experiences)
  };
}

async function callPeopleSearch(
  body: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<{ payload?: Record<string, unknown>; error?: AmplemarketToolError }> {
  const guard = assertEndpointAllowed(PEOPLE_SEARCH_PATH);
  if (guard) return { error: guard };

  let response: Response;
  try {
    response = await fetchImpl(`${AMPLEMARKET_BASE_URL}${PEOPLE_SEARCH_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    return {
      error: transientError(
        `Amplemarket request failed: ${error instanceof Error ? error.message : String(error)}`
      )
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { error: authError(`Amplemarket auth failed: ${response.status} ${response.statusText}`) };
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      error: transientError(
        `Amplemarket /people/search failed: ${response.status} ${response.statusText}${
          detail ? ` — ${detail.slice(0, 400)}` : ""
        }`
      )
    };
  }

  try {
    return { payload: (await response.json()) as Record<string, unknown> };
  } catch (error) {
    return {
      error: transientError(
        `Amplemarket response parse failed: ${error instanceof Error ? error.message : String(error)}`
      )
    };
  }
}

export async function pullPeopleByCompany(
  input: { domain?: unknown; linkedin_url?: unknown; company_id?: unknown },
  deps: PullPeopleDeps = {}
): Promise<PullPeopleByCompanyResult> {
  const apiKey = process.env.AMPLEMARKET_API_KEY;
  if (!apiKey) {
    return authError("AMPLEMARKET_API_KEY not set in environment variables");
  }

  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;

  const domain = typeof input.domain === "string" ? normalizeDomain(input.domain) : null;
  const linkedinUrl =
    typeof input.linkedin_url === "string" ? normalizeCompanyLinkedInUrl(input.linkedin_url) : null;
  const companyId = typeof input.company_id === "string" ? input.company_id.trim() : "";

  if (!domain && !linkedinUrl && !companyId) {
    return invalidInput("Provide one of: domain, linkedin_url, or company_id");
  }

  const baseFilter: Record<string, unknown> = {
    person_departments: [...TARGET_DEPARTMENTS],
    page_size: PAGE_SIZE
  };
  if (companyId) baseFilter.company_ids = [companyId];
  else if (domain) baseFilter.company_domains = [domain];
  else if (linkedinUrl) baseFilter.company_linkedin_urls = [linkedinUrl];

  const people: AmplemarketPerson[] = [];
  const seenIds = new Set<string>();
  let companySnapshot: AmplemarketCompanySnapshot | null = null;
  let totalIndexed = 0;
  let pagesFetched = 0;
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { payload, error } = await callPeopleSearch(
      { ...baseFilter, page },
      apiKey,
      fetchImpl
    );
    if (error) return error;
    if (!payload) return transientError("Amplemarket returned empty payload");

    pagesFetched += 1;

    if (!companySnapshot) {
      companySnapshot = pickCompanySnapshot(payload);
    }

    const pagination = (payload._pagination ?? {}) as Record<string, unknown>;
    if (typeof pagination.total === "number") totalIndexed = pagination.total;
    const totalPages = typeof pagination.total_pages === "number" ? pagination.total_pages : null;

    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const entry of results) {
      if (!entry || typeof entry !== "object") continue;
      const person = toPerson(entry as Record<string, unknown>);
      if (!person || seenIds.has(person.id)) continue;
      seenIds.add(person.id);
      people.push(person);
    }

    if (results.length === 0) break;
    if (totalPages !== null && page >= totalPages) break;
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }

    // Light pacing to stay under the ~300 req/min search rate limit.
    await sleep(200);
  }

  return {
    company: companySnapshot,
    total_indexed: totalIndexed,
    people_count: people.length,
    people,
    pages_fetched: pagesFetched,
    truncated
  };
}

export const pullPeopleByCompanyTool = new OpenAITool({
  name: "pull_people_by_company",
  description:
    "Pulls every person Amplemarket has indexed at a company across Operations, Information Technology, Finance, and Legal departments. Paginates through /people/search (free, no credits consumed). Provide domain, linkedin_url, or company_id. Returns the company snapshot, total indexed count, and the deduped people array.",
  parameters: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: "Company website domain, e.g. tesco.com."
      },
      linkedin_url: {
        type: "string",
        description: "Company LinkedIn URL, e.g. https://www.linkedin.com/company/tesco/."
      },
      company_id: {
        type: "string",
        description: "Amplemarket company UUID, if known."
      }
    },
    required: [],
    additionalProperties: false
  },
  handler: (args) => pullPeopleByCompany(args)
});
