# LaszyResearch - Agent Context

> This file is for AI coding assistants. It mirrors `CLAUDE.md`; if you change one, update the other.

## What This Project Is

A multi-agent research pipeline for Zip HQ's BDR team. Takes a list of target accounts and, for each one, autonomously:
1. V1 researches business priorities (web search)
2. V1 detects hiring signals (TheirStack API)
3. Scores the account on "Zip-fit" (0-100)
4. Persists everything to Supabase

LinkedIn stakeholder discovery and financial report intelligence exist in code,
but are not enabled in the V1 orchestrator path.

Built in TypeScript on the OpenAI JavaScript/TypeScript SDK and Responses API. Each agent has one tool and one job.

## Architecture

- **6 agents + 1 orchestrator** - defined in `src/agents/`
- **4 custom tools** - defined in `src/tools/`
- **Orchestrator** (`src/orchestrator.ts`) - V1 processes one account at a time, runs web + hiring in parallel via `Promise.all`, then scoring, then persist
- **Database** - Supabase (Postgres). Schema in `supabase/schema.sql`.
- **Frontend** - separate app, reads from Supabase. NOT in this repo.

## Agent -> Model Mapping

| Agent | Model | Why |
|-------|-------|-----|
| web_research | `OPENAI_STRONG_MODEL` (`gpt-5.5`) | Needs smart search synthesis |
| linkedin | `OPENAI_FAST_MODEL` (`gpt-5.4-mini`) | Structured extraction |
| hiring | `OPENAI_FAST_MODEL` (`gpt-5.4-mini`) | Pattern matching |
| financials | `OPENAI_STRONG_MODEL` (`gpt-5.5`) | Long document analysis |
| scoring | `OPENAI_STRONG_MODEL` (`gpt-5.5`) | Multi-signal reasoning |
| output | `OPENAI_FAST_MODEL` (`gpt-5.4-mini`) | DB write |

When Azure OpenAI-compatible credentials are present in `.env`, defaults align to
the configured Azure deployments: strong defaults to `gpt-5.4`, fast defaults to
`gpt-5.4-nano`. Direct OpenAI fallback defaults remain `gpt-5.5` and
`gpt-5.4-mini`.

## Context Engineering Rules

1. Each agent gets a fresh context window through a separate `Agent.run(...)` call.
2. Only structured JSON crosses agent boundaries - never raw API data.
3. Agents include strict JSON output schemas in their system prompts.
4. System prompts are stable; dynamic company/account data goes in the user message.
5. The output agent forces the `persist_to_db` function tool before returning a final message.
6. The financials agent is a facade that runs `reportFinderAgent` then `reportAnalystAgent`.

## Key Files

- `src/pipeline.ts` - entry point, run with `npm run pipeline`
- `src/orchestrator.ts` - coordinates agents for each account
- `src/agents/*.ts` - one file per agent, each with model + system prompt + tools
- `src/agents/openaiAgent.ts` - shared Responses API agent loop
- `src/agents/reportFinder.ts` - finds, verifies, downloads, and extracts annual/interim report text
- `src/agents/reportAnalyst.ts` - analyses extracted report text for Zip-relevant signals
- `src/tools/*.ts` - one file per external API integration
- `src/tools/openaiTools.ts` - helper for local OpenAI function tools
- `tests/*.test.ts` - Vitest tests
- `supabase/schema.sql` - Postgres schema for the `account_research` table
- `accounts.json` - input account list

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY` - OpenAI API, only needed when not using Azure credentials
- `AZURE_OPENAIGPT5.4_API_KEY` + `AZURE_OPENAIGPT5.4_ENDPOINT` - Azure strong model
- `AZURE_OPENAIGPT5.4NANO_API_KEY` + `AZURE_OPENAIGPT5.4NANO_ENDPOINT` - Azure fast/report-finder model
- `OPENAI_STRONG_MODEL` / `OPENAI_FAST_MODEL` - optional model overrides
- `REPORT_FINDER_MODEL` / `REPORT_ANALYST_MODEL` - optional financial report model overrides
- `SERPAPI_API_KEY` - Preferred web search key (web research + report search)
- `SERPER_API_KEY` - Optional fallback web/report search key
- `COMPANIES_HOUSE_API_KEY` - optional UK accounts fallback
- `APIFY_TOKEN` - LinkedIn scraping
- `THEIRSTACK_API_KEY` - hiring signals
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` - database

## Running

```bash
npm install
cp .env.example .env
npm run pipeline
```

Checks:

```bash
npm run typecheck
npm test
npm audit --audit-level=high
```

Standalone V1 agent checks:

```bash
npm run agent:web -- "Tesco" tescoplc.com
npm run agent:hiring -- <account_uuid> "Tesco" tescoplc.com "https://www.linkedin.com/company/tesco/"
```

## Important Notes

- The OpenAI SDK entry point is `new OpenAI().responses.create(...)`.
- Use SerpAPI-powered `web_search` function tool for web research (fallback to Serper key if SerpAPI key is absent).
- Use `src/tools/openaiTools.ts` for local function tools.
- Tool functions should handle errors gracefully and return error objects rather than raising.
- SEC EDGAR requires a descriptive User-Agent header.
- Supabase upserts on `account_id`, so re-running the same account updates the row.
- The Acme placeholder in `accounts.json` should be replaced with a real target before a meaningful live run.
