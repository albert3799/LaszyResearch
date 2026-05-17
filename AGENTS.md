# LaszyResearch - Agent Context

> This file is for AI coding assistants. It mirrors `CLAUDE.md`; if you change one, update the other.

## What This Project Is

A multi-agent research pipeline for Zip HQ's BDR team. Takes a list of target accounts and, for each one, autonomously:
1. Researches business priorities (web search)
2. Finds key stakeholders (LinkedIn via Apify)
3. Detects hiring signals (TheirStack API)
4. Analyzes financial filings (SEC EDGAR)
5. Scores the account on "Zip-fit" (1-10)
6. Persists everything to Supabase

Built in TypeScript on the OpenAI JavaScript/TypeScript SDK and Responses API. Each agent has one tool and one job.

## Architecture

- **6 agents + 1 orchestrator** - defined in `src/agents/`
- **4 custom tools** - defined in `src/tools/`
- **Orchestrator** (`src/orchestrator.ts`) - processes one account at a time, runs agents 1-4 in parallel via `Promise.all`, then scoring, then persist
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

## Context Engineering Rules

1. Each agent gets a fresh context window through a separate `Agent.run(...)` call.
2. Only structured JSON crosses agent boundaries - never raw API data.
3. Agents include strict JSON output schemas in their system prompts.
4. System prompts are stable; dynamic company/account data goes in the user message.
5. The output agent forces the `persist_to_db` function tool before returning a final message.

## Key Files

- `src/pipeline.ts` - entry point, run with `npm run pipeline`
- `src/orchestrator.ts` - coordinates agents for each account
- `src/agents/*.ts` - one file per agent, each with model + system prompt + tools
- `src/agents/openaiAgent.ts` - shared Responses API agent loop
- `src/tools/*.ts` - one file per external API integration
- `src/tools/openaiTools.ts` - helper for local OpenAI function tools
- `tests/*.test.ts` - Vitest tests
- `supabase/schema.sql` - Postgres schema for the `account_research` table
- `accounts.json` - input account list

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY` - OpenAI API
- `OPENAI_STRONG_MODEL` / `OPENAI_FAST_MODEL` - optional model overrides
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

## Important Notes

- The OpenAI SDK entry point is `new OpenAI().responses.create(...)`.
- Use hosted `web_search` via the Responses API for web research agents.
- Use `src/tools/openaiTools.ts` for local function tools.
- Tool functions should handle errors gracefully and return error objects rather than raising.
- SEC EDGAR requires a descriptive User-Agent header.
- Supabase upserts on `account_id`, so re-running the same account updates the row.
- The Acme placeholder in `accounts.json` should be replaced with a real target before a meaningful live run.
