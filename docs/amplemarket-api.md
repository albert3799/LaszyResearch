# Amplemarket API — Integration Guide

## Rule

**Use only the free endpoints listed below. Do NOT call any enrichment, validation, or reveal endpoints — they consume paid credits.**

LaszyResearch already does its own research (web search, hiring signals, scoring). We use Amplemarket for **discovery** (free) and to **push signals back** (free). Enrichment stays out of scope.

---

## Free endpoints we use

### 1. People Search — `POST /people/search`

Discover prospects by title, seniority, department, company, location, or behavioural filters (recent funding, headcount growth, news, job openings). Results include the person and a nested company object — no extra lookup needed.

**Key filters:**
- Person: `person_titles`, `person_seniorities`, `person_departments`, `person_job_functions`, `person_keywords`, `person_locations`
- Company: `company_domains`, `company_industries`, `company_sizes`, `company_revenue`, `company_locations`
- Signals: `headcount_growth`, `company_last_funding`, `news`, `job_openings.titles[]`

Pagination: `page` + `page_size` (1–100, default 5).

### 2. Companies Search — `POST /companies/search`

Same filter set as people search (company side). Use for **account discovery** — finding net-new accounts that match Zip-fit criteria instead of relying on a curated `accounts.json`.

### 3. Job Openings — `GET /job-openings`

List a company's open roles. Need one of: `company_id`, `domain`, or `linkedin_url`.

**Useful filters:** `person_seniorities[]`, `person_departments[]`, `person_job_functions[]`, `only_remote`.

**Returned per opening:** `id`, `title`, `url`, `raw_location`, `first_seen_at`, `seniorities[]`, `departments[]`, `job_functions[]`. Use `first_seen_at` to gate freshness for the hiring-signal agent.

Single opening: `GET /job-openings/{id}` adds `description`, `raw_salary`, `last_seen_at`, `contract_types`.

### 4. Custom Signal Entry — `POST <tenant-webhook-url>`

The **output** side. Push high-scoring accounts back into Amplemarket as signals; Duo auto-maps fields and can trigger personalized sequences.

- Auth: token embedded in the URL — treat as a secret, store in `.env`.
- Body: flexible JSON. Person signals need `linkedin_url` OR `email` OR (`full_name` + `company_name`). Company signals need `company_name` OR `company_domain` OR `company_linkedin_url`.
- Max payload: 1 MB. Returns 202 on accept.

---

## Banned endpoints — DO NOT CALL

These consume paid credits. The Amplemarket client wrapper in `src/tools/amplemarket.ts` must not expose them.

| Endpoint | Cost |
|---|---|
| `POST /people/find` (single + batch person enrichment) | 0.5 email credit on match, +1 email credit per email revealed, +1 phone credit per phone revealed |
| `POST /companies/find` (single + batch company enrichment) | Credit-consuming (per-record rate not published; budget ~0.5 email credit/record) |
| `POST /email-validations` | 1 email credit per email |
| `POST /phone-numbers/review` | Phone-credit consuming |

If you need enrichment, do it through our existing pipeline (web research agent, hiring agent, financials agent) — not Amplemarket.

---

## Implementation rules

1. **Allowlist wrapper.** All Amplemarket calls go through `src/tools/amplemarket.ts`. Only the four free endpoints above are exposed as methods. Raw `fetch` to `api.amplemarket.com` is banned.
2. **Defense in depth.** The wrapper rejects any path matching `/people/find`, `/companies/find`, `/email-validations`, or `/phone-numbers/review` even if called via a generic method.
3. **Auth.** Bearer token in `AMPLEMARKET_API_KEY`. Custom signal webhook URL in `AMPLEMARKET_SIGNAL_WEBHOOK_URL` (contains its own token).
4. **Rate limits.** Default 500 req/min; search endpoints are lower (~300 req/min). Respect them — add backoff on 429.
5. **Verification before shipping.** Before merging any new Amplemarket call, note the credit balance in the dashboard, run the call, confirm balance unchanged.

---

## References

- API home: https://docs.amplemarket.com/home
- OpenAPI JSON: https://docs.amplemarket.com/api-reference/openapi.json
- Credits article: https://knowledge.amplemarket.com/hc/en-us/articles/4406525110029-How-Amplemarket-credits-are-used-and-counted
- Endpoint pages: `https://docs.amplemarket.com/api-reference/{group}/{endpoint}.md`
