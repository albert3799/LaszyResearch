# LaszyResearch — Product Management

## Vision

An autonomous multi-agent research pipeline for Zip HQ's BDR team. Given a list of target accounts, it researches each one across multiple signals, scores them for "Zip-fit", and persists structured output to Supabase — ready for a frontend dashboard and outbound workflows.

---

## Codebase Status (as of 2026-05-18)

Most code exists in draft form. The work is wiring it up end-to-end, testing, and fixing issues phase by phase.

### What's Written (code exists, not yet tested e2e)

- Agent loop wrapper (`src/agents/openaiAgent.ts`) — shared Responses API runner
- Web research agent (`src/agents/webResearch.ts`) — gpt-5.5, `web_search`, 5 turns
- Hiring agent (`src/agents/hiring.ts`) — gpt-5.4-mini, `searchTheirStackTool`, 3 turns
- LinkedIn agent (`src/agents/linkedin.ts`) — gpt-5.4-mini, Apify + web_search, 5 turns
- Financials facade (`src/agents/financials.ts`) — chains reportFinder → reportAnalyst
- Report finder (`src/agents/reportFinder.ts`) — Serper search + PDF download + verification
- Report analyst (`src/agents/reportAnalyst.ts`) — Zod-validated structured extraction
- Scoring agent (`src/agents/scoring.ts`) — gpt-5.5, no tools, rubric-based
- Output agent (`src/agents/output.ts`) — gpt-5.4-mini, `persistToDbTool`
- Orchestrator (`src/orchestrator.ts`) — parallel agents → scoring → output
- Pipeline entry point (`src/pipeline.ts`) — loads accounts.json, iterates, prints summary
- All tools: TheirStack (2 versions), Apify, SEC EDGAR, Serper, Companies House, PDF, Supabase
- Database schema (13 tables, deployed to Supabase today)
- Config: scoring rubric YAML, target personas YAML
- Tests: agent loop + orchestrator parsing utilities

### What's Missing

- End-to-end validation (nothing has run against real APIs yet)
- Account import from CSV → `accounts` table
- Supabase cache writes for web research + hiring (cache tables exist, write logic not wired)
- Observability logging (pipeline_runs, agent_runs, tool_runs tables exist but aren't populated)
- Error handling under real conditions
- Frontend dashboard (separate repo)

---

## Phased Delivery Plan

### Phase 1 — Orchestrator + Web Research + Hiring Signals

**Goal:** Run 1 account end-to-end through 2 agents. Cache raw results to Supabase. Print combined summary to console.

**Scope:**
- Wire orchestrator to run ONLY web research + hiring agents (skip LinkedIn, financials)
- Web research agent searches broadly: business priorities, procurement signals, AND recent news
- Hiring agent uses `searchTheirStackTool` (the simpler domain-based version)
- Write results to `web_research_cache` and `company_hiring_signals` tables
- Print combined JSON summary to console
- Test with 1 account from `accounts.json`

**Tasks:**

1. **Seed a real test account into Supabase `accounts` table**
   - Pick a known public company with procurement activity
   - Insert via `execute_sql` so the UUID is available for tools that need it

2. **Modify orchestrator for Phase 1 subset**
   - Add a mode/flag that runs only web research + hiring in parallel
   - Skip LinkedIn, financials, scoring, and output agents
   - Combine the two agent outputs into a single summary object
   - Print structured JSON to console

3. **Wire web research cache writes**
   - After the web research agent returns, upsert to `web_research_cache`
   - Key on normalized domain

4. **Wire hiring signals cache writes**
   - The `searchTheirStackTool` returns raw results — upsert to `company_hiring_signals`
   - Or switch to `getHiringSignalsTool` which already has cache logic built in

5. **Test: run `npm run pipeline` against 1 real account**
   - Verify OpenAI API calls succeed (web_search works)
   - Verify TheirStack API call succeeds
   - Verify both cache tables get populated in Supabase
   - Verify console output is valid JSON with both research + hiring data

6. **Debug and fix issues**
   - Agent JSON parsing (the orchestrator's `parseAgentJson` handling edge cases)
   - API error handling (rate limits, timeouts, missing data)
   - Schema mismatches between agent output and cache table columns

**Exit Criteria:**
- `npm run pipeline` processes 1 account with no crashes
- `web_research_cache` has 1 row with structured research JSON
- `company_hiring_signals` has 1 row with jobs data
- Console shows a clean combined summary

**APIs Required:** OpenAI (web_search + agent calls), TheirStack, Supabase

---

### Phase 2 — Add Financials Agent

**Goal:** Add the report finder → analyst chain. 3 agents now run in parallel per account.

**Scope:**
- Enable the financials facade agent in the orchestrator's parallel block
- Report finder searches for annual/interim reports via Serper, downloads PDFs, extracts text
- Report analyst extracts Zip-relevant signals (procurement mentions, cost programs, priorities)
- Write results to `report_search_cache`, `report_documents`, `report_intelligence`
- Combined console output now includes financials alongside web research + hiring

**Tasks:**

1. **Enable financials agent in orchestrator**
   - Add `financialsAgent.runForAccount()` to the `Promise.all` block
   - Handle the "no report found" fallback gracefully (empty financials, not a crash)

2. **Test report finder with real companies**
   - Try a US public company (SEC EDGAR path)
   - Try a UK company (Companies House path)
   - Try a company with no public filings (should fall back cleanly)

3. **Wire cache writes for financials pipeline**
   - `report_search_cache` — Serper search results + selected URL
   - `report_documents` — downloaded report text + metadata
   - `report_intelligence` — structured analyst output

4. **Test combined 3-agent output**
   - Run with 1 account, verify all 3 agents complete
   - Verify all cache/output tables populated
   - Console shows web research + hiring + financials

5. **Handle PDF edge cases**
   - Very large PDFs (>80 pages, per config limit)
   - Encrypted/protected PDFs
   - Non-PDF links that look like reports
   - Timeout on slow downloads

**Exit Criteria:**
- 3 agents run in parallel successfully for 1 account
- `report_documents` has extracted text from a real report
- `report_intelligence` has structured Zip-relevant signals
- No crashes on "report not found" scenarios

**APIs Required:** + Serper, SEC EDGAR, Companies House (optional)

---

### Phase 3 — Scoring Agent + Output Agent

**Goal:** Full pipeline from research → score → persist. Supabase `account_research` gets populated.

**Scope:**
- Enable scoring agent — receives combined research from all 3 agents, produces 1-10 score
- Enable output agent — upserts scored result to `account_research` table
- Add observability: log `pipeline_runs`, `agent_runs`, `tool_runs`
- Test with a small batch (3-5 accounts)

**Tasks:**

1. **Enable scoring agent in orchestrator**
   - Receives bundled JSON from web research + hiring + financials
   - Applies rubric weights: business priority 35%, buying signals 35%, accessibility 30%
   - Outputs score, confidence, rationale, key_evidence, recommended_persona, message_angle

2. **Enable output agent**
   - Takes scoring output + raw research bundle
   - Upserts to `account_research` (keyed on account_id)
   - Verify upsert works (update on re-run, not duplicate)

3. **Add observability logging**
   - Insert `pipeline_runs` row at start, update status + finished_at on completion
   - Insert `agent_runs` row per agent per account
   - Insert `tool_runs` row per tool invocation (TheirStack, Serper, etc.)

4. **Test with 3-5 accounts batch**
   - Seed 3-5 real accounts into `accounts` table
   - Run full pipeline
   - Verify `account_research` has scored rows for each
   - Verify `pipeline_runs` + `agent_runs` show the run history

5. **Scoring quality review**
   - Check scores against manual intuition — do high-scoring accounts make sense?
   - Tune rubric weights if needed
   - Verify confidence levels (high/medium/low) are reasonable

**Exit Criteria:**
- Full 5-agent pipeline runs for 3-5 accounts
- `account_research` has scored rows with rationale
- `pipeline_runs` / `agent_runs` tables show run history
- Scores pass a manual sanity check

**APIs Required:** Same as Phase 2 (no new APIs)

---

### Phase 4 — LinkedIn Agent

**Goal:** Add stakeholder discovery. All 6 agents operational. Full pipeline.

**Scope:**
- Enable LinkedIn agent in the parallel block (now 4 agents in parallel)
- Uses Apify to scrape LinkedIn profiles for target personas
- Populate `linkedin_profile_cache` and `account_linkedin_research`
- Scoring agent now has stakeholder data as an input signal
- Test with full batch from accounts.json

**Tasks:**

1. **Enable LinkedIn agent in orchestrator**
   - Add to `Promise.all` with the other 3 research agents
   - Uses target personas from `config/target_personas.yaml`

2. **Test Apify integration**
   - Verify `apimaestro~linkedin-profile-detail` actor works
   - Handle rate limits and profile-not-found cases
   - Test with known LinkedIn URLs

3. **Wire cache writes**
   - `linkedin_profile_cache` — individual profile data
   - `account_linkedin_research` — account-level stakeholders list

4. **Update scoring context**
   - Scoring agent already expects stakeholder data in its input
   - Verify it uses the `accessibility` weight (30%) for stakeholder quality

5. **Full pipeline test**
   - Run all 6 agents against accounts.json
   - Verify all 13 tables have appropriate data
   - End-to-end: input → research → score → persist

6. **Cost and rate limit review**
   - Measure API costs per account (OpenAI, TheirStack, Apify, Serper)
   - Identify bottlenecks (Apify is likely slowest)
   - Decide on batch size and concurrency limits for production runs

**Exit Criteria:**
- All 6 agents operational, full pipeline end-to-end
- All cache and output tables populated
- Cost per account is known and acceptable
- Ready for production batch runs against real account lists

---

## Key Design Decisions

1. **Sub-agent isolation** — each agent gets a fresh context window; only structured JSON crosses boundaries
2. **Cache-first** — every external API call checks Supabase cache before hitting the paid API
3. **Idempotent schema** — can re-run `schema.sql` safely as we iterate
4. **Upsert on account_id** — re-running the pipeline updates rather than duplicates
5. **Stable system prompts** — dynamic data goes in the user message to enable prompt caching
6. **Config-driven scoring** — rubric weights live in YAML, not code

---

## Open Questions

1. Should TheirStack queries also use `company_name_partial_match_or` or `company_linkedin_url_or` for better coverage on rebranded companies?
2. What's the target batch size per pipeline run for production? (Rate limits, cost, Apify concurrency)
3. How should failed agent runs be retried? Per-agent? Whole account?
4. Do we need a queue/scheduler for continuous processing, or is manual `npm run pipeline` sufficient?
5. Frontend: Replit or Lovable? (separate repo, reads from Supabase)
