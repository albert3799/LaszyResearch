import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getHiringSignals,
  normalizeCompanyLinkedInUrl,
  normalizeDomain,
  type HiringCacheRow,
  type HiringJob,
  type HiringSignalsDb
} from "../src/tools/theirstackTool.js";

const accountId = "11111111-1111-1111-1111-111111111111";
const secondAccountId = "22222222-2222-2222-2222-222222222222";
const linkedInUrl = "https://www.linkedin.com/company/acme/";
const now = new Date("2026-05-17T12:00:00.000Z");

interface FakeAccount {
  id: string;
  company_name: string;
  website: string | null;
  linkedin_url: string | null;
}

class FakeHiringDb implements HiringSignalsDb {
  accounts = new Map<string, FakeAccount>();
  caches = new Map<string, HiringCacheRow>();
  upserts: Array<{
    company_linkedin_url: string;
    domain: string | null;
    jobs: HiringJob[];
    raw_jobs: Record<string, unknown>[];
    response_metadata: Record<string, unknown>;
    company_object: Record<string, unknown> | null;
    raw_response: Record<string, unknown>;
    jobs_count: number;
    fetched_at: string;
    refresh_count: number;
    last_error: string | null;
    last_error_at: string | null;
  }> = [];
  accountError?: string;
  cacheError?: string;
  upsertError?: string;

  async getAccount(id: string) {
    if (this.accountError) {
      return { account: null, error: this.accountError };
    }
    return { account: this.accounts.get(id) ?? null };
  }

  async getCache(companyLinkedInUrl: string) {
    if (this.cacheError) {
      return { cache: null, error: this.cacheError };
    }
    return { cache: this.caches.get(companyLinkedInUrl) ?? null };
  }

  async upsertCache(row: {
    company_linkedin_url: string;
    domain: string | null;
    jobs: HiringJob[];
    raw_jobs: Record<string, unknown>[];
    response_metadata: Record<string, unknown>;
    company_object: Record<string, unknown> | null;
    raw_response: Record<string, unknown>;
    jobs_count: number;
    fetched_at: string;
    refresh_count: number;
    last_error: string | null;
    last_error_at: string | null;
  }) {
    if (this.upsertError) {
      return { error: this.upsertError };
    }
    this.upserts.push(row);
    this.caches.set(row.company_linkedin_url, row);
    return {};
  }
}

function makeDb({
  website = "https://www.acme.com/jobs",
  linkedin = "https://linkedin.com/company/acme/about"
}: {
  website?: string | null;
  linkedin?: string | null;
} = {}): FakeHiringDb {
  const db = new FakeHiringDb();
  db.accounts.set(accountId, {
    id: accountId,
    company_name: "Acme Corp",
    website,
    linkedin_url: linkedin
  });
  return db;
}

function cacheRow(
  fetchedAt: string,
  jobs: HiringJob[] = [job("Cached procurement manager")]
): HiringCacheRow {
  return {
    company_linkedin_url: linkedInUrl,
    domain: "acme.com",
    jobs,
    raw_jobs: jobs.map((item, index) => ({
      id: `cached-${index}`,
      job_title: item.title,
      description: item.description
    })),
    response_metadata: { total_companies: 1 },
    company_object: { name: "Acme Corp", linkedin_url: linkedInUrl },
    raw_response: { data: [] },
    jobs_count: jobs.length,
    fetched_at: fetchedAt,
    refresh_count: 2
  };
}

function job(title: string): HiringJob {
  return {
    title,
    posted_date: "2026-05-01",
    location: "London",
    seniority: "manager",
    technology_slugs: ["sap"],
    url: "https://example.com/job",
    description:
      "Own procurement transformation and vendor workflows across finance systems.",
    description_snippet:
      "Own procurement transformation and vendor workflows across finance systems."
  };
}

function rawJob(id: string | number, title: string, description = "Line one\nLine two") {
  return {
    id,
    job_title: title,
    date_posted: "2026-05-01",
    location: "London",
    seniority: "manager",
    technology_slugs: ["sap", "oracle"],
    final_url: `https://jobs.example.com/${id}`,
    url: `https://fallback.example.com/${id}`,
    source_url: `https://source.example.com/${id}`,
    description,
    hiring_team: [
      {
        full_name: "Ada Buyer",
        role: "Hiring Manager",
        linkedin_url: "https://linkedin.com/in/ada-buyer"
      }
    ],
    company_object: {
      name: "Acme Corp",
      domain: "acme.com",
      linkedin_url: linkedInUrl,
      employee_count: 1000,
      possible_domains: ["acme.com"]
    }
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers
  });
}

function deps(db: FakeHiringDb, fetchImpl: typeof fetch) {
  return {
    db,
    fetch: fetchImpl,
    now: () => now,
    sleep: vi.fn(async () => undefined)
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalization helpers", () => {
  it("normalizes protocol, www, and paths for domains", () => {
    expect(normalizeDomain("https://www.acme.com/jobs?x=1")).toBe("acme.com");
  });

  it("rejects malformed domains", () => {
    expect(normalizeDomain("https://-bad.com")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("normalizes company LinkedIn URLs", () => {
    expect(normalizeCompanyLinkedInUrl("linkedin.com/company/Acme/about")).toBe(
      linkedInUrl
    );
    expect(normalizeCompanyLinkedInUrl("https://uk.linkedin.com/company/acme/")).toBe(
      linkedInUrl
    );
  });

  it("rejects non-company LinkedIn URLs", () => {
    expect(normalizeCompanyLinkedInUrl("https://linkedin.com/in/person")).toBeNull();
    expect(normalizeCompanyLinkedInUrl("https://example.com/company/acme")).toBeNull();
  });
});

describe("get_hiring_signals", () => {
  it("fresh LinkedIn cache returns without TheirStack call", async () => {
    const db = makeDb();
    db.caches.set(linkedInUrl, cacheRow("2026-05-01T00:00:00.000Z"));
    const fetchImpl = vi.fn(async () => {
      throw new Error("should not call TheirStack");
    }) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({
      account_id: accountId,
      account_name: "Acme Corp",
      company_linkedin_url: linkedInUrl,
      domain: "acme.com",
      cache_hit: true,
      is_stale: false,
      source: "cache"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stale cache refreshes TheirStack", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    db.caches.set(linkedInUrl, cacheRow("2026-03-01T00:00:00.000Z"));
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [rawJob("1", "Procurement Transformation Lead")] })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({
      source: "theirstack",
      cache_hit: false,
      jobs_count: 1
    });
    expect(db.upserts[0].refresh_count).toBe(3);
  });

  it("cache miss fetches by company LinkedIn URL and writes cache", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        metadata: {
          total_results: 1,
          total_companies: 1,
          truncated_results: false,
          truncated_companies: false
        },
        data: [
          rawJob(
            "1",
            "Vendor Management Lead",
            "Own vendor governance, AP workflows, and procurement controls."
          )
        ]
      })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));
    const request = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(String((request[1] as RequestInit).body));

    expect(request[0]).toBe("https://api.theirstack.com/v1/jobs/search");
    expect(body).toMatchObject({
      company_linkedin_url_or: [linkedInUrl],
      posted_at_gte: "2025-05-17",
      limit: 5,
      offset: 0,
      include_total_results: false,
      order_by: [{ field: "date_posted", desc: true }]
    });
    expect(body.company_domain_or).toBeUndefined();
    expect(body.job_title_or).toContain("vendor management");
    expect(body.job_title_pattern_or).toContain("\\bP2P\\b");
    expect(body.job_title_not).toContain("tax");
    expect(result).toMatchObject({
      source: "theirstack",
      jobs_count: 1
    });
    expect("jobs" in result ? result.jobs[0].description : null).toBe(
      "Own vendor governance, AP workflows, and procurement controls."
    );
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({
      company_linkedin_url: linkedInUrl,
      domain: "acme.com",
      jobs_count: 1,
      refresh_count: 1
    });
    expect(db.upserts[0].jobs[0].description).toBe(
      "Own vendor governance, AP workflows, and procurement controls."
    );
    expect(db.upserts[0].raw_jobs[0]).toMatchObject({
      id: "1",
      job_title: "Vendor Management Lead",
      description: "Own vendor governance, AP workflows, and procurement controls.",
      hiring_team: [
        {
          full_name: "Ada Buyer",
          role: "Hiring Manager",
          linkedin_url: "https://linkedin.com/in/ada-buyer"
        }
      ]
    });
    expect(db.upserts[0].response_metadata).toMatchObject({
      total_results: 1,
      total_companies: 1
    });
    expect(db.upserts[0].company_object).toMatchObject({
      name: "Acme Corp",
      domain: "acme.com",
      linkedin_url: linkedInUrl
    });
    expect(db.upserts[0].raw_response).toHaveProperty("data");
  });

  it("cache miss accepts company_linkedin_url without account_id", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [rawJob("1", "Procurement Analyst")] })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals(
      { company_linkedin_url: "https://www.linkedin.com/company/acme/" },
      deps(db, fetchImpl)
    );

    expect(result).toMatchObject({
      source: "theirstack",
      account_id: undefined,
      account_name: "Acme Corp",
      jobs_count: 1
    });
  });

  it("force refresh bypasses fresh cache", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    db.caches.set(linkedInUrl, cacheRow("2026-05-01T00:00:00.000Z"));
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [rawJob("1", "New AP Automation Lead")] })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals(
      { account_id: accountId, force_refresh: true },
      deps(db, fetchImpl)
    );

    expect(result).toMatchObject({
      source: "theirstack",
      cache_hit: false,
      jobs_count: 1
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(db.upserts[0].jobs[0].title).toBe("New AP Automation Lead");
  });

  it("TheirStack transient failure returns stale LinkedIn cache", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    db.caches.set(linkedInUrl, cacheRow("2026-03-01T00:00:00.000Z"));
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({
      source: "cache",
      cache_hit: true,
      is_stale: true,
      jobs_count: 1
    });
  });

  it("TheirStack failure with no cache returns transient", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;
    const testDeps = deps(db, fetchImpl);

    const result = await getHiringSignals({ account_id: accountId }, testDeps);

    expect(result).toMatchObject({ type: "transient" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(testDeps.sleep).toHaveBeenCalledTimes(3);
  });

  it.each([401, 402])("%s returns auth errors", async (status) => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () => jsonResponse({}, status)) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({ type: "auth" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("429 returns transient with retry_after", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({}, 429, { "ratelimit-reset": "7" })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({ type: "transient", retry_after: 7 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("returns not_found for a missing account", async () => {
    const db = new FakeHiringDb();
    const result = await getHiringSignals(
      { account_id: accountId },
      deps(db, vi.fn() as unknown as typeof fetch)
    );

    expect(result).toMatchObject({ type: "not_found" });
  });

  it("returns not_found for an account with no LinkedIn URL", async () => {
    const db = makeDb({ linkedin: null });
    const result = await getHiringSignals(
      { account_id: accountId },
      deps(db, vi.fn() as unknown as typeof fetch)
    );

    expect(result).toMatchObject({ type: "not_found" });
  });

  it("returns not_found for a malformed LinkedIn URL", async () => {
    const db = makeDb({ linkedin: "https://linkedin.com/in/not-company" });
    const result = await getHiringSignals(
      { account_id: accountId },
      deps(db, vi.fn() as unknown as typeof fetch)
    );

    expect(result).toMatchObject({ type: "not_found" });
  });

  it("returns invalid_input for an invalid UUID", async () => {
    const result = await getHiringSignals(
      { account_id: "not-a-uuid" },
      deps(new FakeHiringDb(), vi.fn() as unknown as typeof fetch)
    );

    expect(result).toMatchObject({ type: "invalid_input" });
  });

  it("duplicate accounts share the same normalized LinkedIn cache", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb({ linkedin: "https://www.linkedin.com/company/acme/" });
    db.accounts.set(secondAccountId, {
      id: secondAccountId,
      company_name: "Acme UK",
      website: "www.acme.co.uk/careers",
      linkedin_url: "linkedin.com/company/ACME/about"
    });
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [rawJob("1", "Strategic Sourcing Manager")] })
    ) as unknown as typeof fetch;
    const testDeps = deps(db, fetchImpl);

    await getHiringSignals({ account_id: accountId }, testDeps);
    const secondResult = await getHiringSignals({ account_id: secondAccountId }, testDeps);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(secondResult).toMatchObject({
      account_id: secondAccountId,
      account_name: "Acme UK",
      company_linkedin_url: linkedInUrl,
      domain: "acme.com",
      source: "cache"
    });
  });

  it("caps results at 5", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: Array.from({ length: 6 }, (_, index) =>
          rawJob(String(index), `Procurement Role ${index}`)
        )
      })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({ jobs_count: 5 });
    expect("jobs" in result ? result.jobs : []).toHaveLength(5);
  });

  it("dedupes jobs by TheirStack job ID", async () => {
    vi.stubEnv("THEIRSTACK_API_KEY", "test-key");
    const db = makeDb();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          rawJob("same", "Vendor Risk Lead"),
          rawJob("same", "Vendor Risk Lead Duplicate"),
          rawJob("other", "Supplier Risk Manager")
        ]
      })
    ) as unknown as typeof fetch;

    const result = await getHiringSignals({ account_id: accountId }, deps(db, fetchImpl));

    expect(result).toMatchObject({ jobs_count: 2 });
    expect("jobs" in result ? result.jobs.map((item) => item.title) : []).toEqual([
      "Vendor Risk Lead",
      "Supplier Risk Manager"
    ]);
  });
});
