# LaszyResearch — Agent Context

> This file is for AI coding assistants (Codex CLI, Cursor, etc.). It mirrors `CLAUDE.md` — if you change one, change the other.

## What This Project Is

A multi-agent research pipeline for Zip HQ's BDR team. Takes a list of target accounts and, for each one, autonomously:
1. Researches business priorities (web search)
2. Finds key stakeholders (LinkedIn via Apify)
3. Detects hiring signals (TheirStack API)
4. Analyzes financial filings (SEC EDGAR)
5. Scores the account on "Zip-fit" (1-10)
6. Persists everything to Supabase

Built on the **OpenAI Agents SDK** (`openai-agents` package) pointed at **Azure OpenAI Foundry**.

## Architecture

- **6 agents + 1 orchestrator** — defined in `researchers/` (NOT `agents/` — that name would shadow the openai-agents SDK package, which lives at `site-packages/agents/`)
- **4 custom tools** — defined in `tools/`
- **Orchestrator** (`orchestrator.py`) — processes one account at a time, runs agents 1-4 in parallel via `asyncio.gather`, then scoring, then persist
- **Output validation** — every agent has `output_type=<PydanticModel>` from `researchers/_schemas.py`; the SDK guarantees the model output matches the schema
- **Database** — Supabase (Postgres). Schema in `supabase/schema.sql`, already applied to the live project.

## Agent → Model Tier Mapping

Deployment names are env-configurable so the same code works across Azure tenants.

| Agent | Tier | Env var | Why |
|-------|------|---------|-----|
| web_research | reasoning | `REASONING_MODEL_DEPLOYMENT` | Search synthesis |
| linkedin | extraction | `EXTRACTION_MODEL_DEPLOYMENT` | Structured extraction |
| hiring | extraction | `EXTRACTION_MODEL_DEPLOYMENT` | Pattern matching |
| financials | reasoning | `REASONING_MODEL_DEPLOYMENT` | Long-document analysis |
| scoring | reasoning | `REASONING_MODEL_DEPLOYMENT` | Multi-signal reasoning |
| output | extraction | `EXTRACTION_MODEL_DEPLOYMENT` | DB write |

## Context Engineering Rules

1. Each agent runs in its own `Runner.run()` call — fresh context, no cross-bleed.
2. Only typed Pydantic outputs cross agent boundaries — never raw API data.
3. Output schemas live in `researchers/_schemas.py`, NOT in system prompts — the SDK enforces them. DO NOT add "return JSON" instructions to prompts.
4. System prompts are STABLE (no dynamic data) to enable prompt caching.
5. Dynamic data goes in the user message, not the system prompt.

## Key Files

- `pipeline.py` — entry point, run with `python pipeline.py`
- `orchestrator.py` — coordinates agents for each account
- `researchers/__init__.py` — wires the SDK to Azure OpenAI at import time
- `researchers/_runner.py` — thin Runner.run wrapper with timing logs
- `researchers/_schemas.py` — Pydantic output models, one per agent
- `researchers/*.py` — one file per agent (instructions + Agent + run_<name>)
- `tools/*.py` — one file per external API integration (`@function_tool` from SDK, with `_<name>_impl` async functions alongside for direct testing)
- `supabase/schema.sql` — Postgres schema for the `account_research` table
- `accounts.json` — input account list

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `AZURE_OPENAI_ENDPOINT` — v1 base URL (`https://<resource>.openai.azure.com/openai/v1`), OR `AZURE_FOUNDRY_ENDPOINT` for a Foundry project (init auto-appends `/openai/v1`)
- `AZURE_OPENAI_API_KEY` (or `AZURE_FOUNDRY_API_KEY` as fallback)
- `REASONING_MODEL_DEPLOYMENT`, `EXTRACTION_MODEL_DEPLOYMENT` — deployment names you gave in Foundry
- `APIFY_TOKEN` — LinkedIn scraping
- `THEIRSTACK_API_KEY` — hiring signals
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — database (service key, not publishable)

## Running

```bash
pip install -r requirements.txt   # or `uv pip install -r requirements.txt`
cp .env.example .env              # fill in keys
python pipeline.py
```

Tests: `pytest tests/` — 3 tool tests pass without API keys.

## Important Notes

- The package directory is `researchers/`, NOT `agents/` — see Architecture section for why.
- Each tool has an `_<name>_impl(...)` async function alongside the `@function_tool`-decorated public name. Tests call `_impl` directly because the SDK's FunctionTool wrapper requires a full `ToolContext` to invoke through.
- `tools/supabase_tool.py:persist_to_db` uses `@function_tool(strict_mode=False)` because the input is `dict[str, Any]` and the SDK's strict JSON schema generation rejects `additionalProperties: true`.
- SEC EDGAR requires a descriptive User-Agent header — don't remove it.
- Supabase upserts on `account_id` — re-running for the same account updates the row.
- Tracing is disabled in `researchers/__init__.py` (would otherwise post to openai.com, which rejects Azure-issued keys).

## Picking up cold (handoff notes)

**Current state as of last commit (`37b5697`):**

- ✅ Supabase project `LaszyResearch` (id `qodlodrtpgemxrobjgkn`, eu-west-1) live with schema applied; advisors clean.
- ✅ Azure OpenAI Foundry wired — verified end-to-end with a live scoring-agent smoke test (6.6s, valid Pydantic output).
- ✅ All 6 agents import + initialize correctly using deployment name `gpt-5` by default.
- ✅ 3/3 tool unit tests passing.
- ⏸️ Full pipeline end-to-end run against a REAL company in `accounts.json` has NOT been done yet. The Acme placeholder will mostly produce empty results (no real 10-K, no real LinkedIn profiles).

**To pick up:**

1. **Confirm deployment names**: the code defaults `REASONING_MODEL_DEPLOYMENT` and `EXTRACTION_MODEL_DEPLOYMENT` both to `gpt-5`. If you've also got a GPT-5.4 (or other) deployment for cheaper extraction, set `EXTRACTION_MODEL_DEPLOYMENT` in `.env` accordingly.
2. **Replace the Acme placeholder** in `accounts.json` with a real target company (name, domain, ticker if public).
3. **Run** `python pipeline.py` and watch all 6 agents fire — this exercises Apify, TheirStack, SEC, WebSearch on Azure, the parallel gather, and the Supabase upsert.
4. **Verify the row landed** in Supabase: Dashboard → Table Editor → `account_research`.

**Known unknowns:**
- WebSearchTool support on Azure Foundry varies by region/API version. If the web_research or linkedin agents fail with "tool not supported," you'll need to swap to an external search API (Tavily, Brave, or use the existing Apify Google Scraper actor).
