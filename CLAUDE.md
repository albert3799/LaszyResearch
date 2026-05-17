# LaszyResearch — Claude Code Context

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

- **6 agents + 1 orchestrator** — defined in `src/agents/`
- **4 custom tools** — defined in `src/tools/`
- **Orchestrator** (`src/orchestrator.ts`) — processes one account at a time, runs agents 1-4 in parallel via `Promise.all`, then scoring, then persist
- **Database** — Supabase (Postgres). Schema in `supabase/schema.sql`.
- **Frontend** — separate app (Replit/Lovable), reads from Supabase. NOT in this repo.

## Agent → Model Mapping

| Agent | Model | Why |
|-------|-------|-----|
| web_research | `OPENAI_STRONG_MODEL` (`gpt-5.5`) | Needs smart search synthesis |
| linkedin | `OPENAI_FAST_MODEL` (`gpt-5.4-mini`) | Structured extraction |
| hiring | `OPENAI_FAST_MODEL` (`gpt-5.4-mini`) | Pattern matching |
| financials | `OPENAI_STRONG_MODEL` (`gpt-5.5`) | Long document analysis |
| scoring | `OPENAI_STRONG_MODEL` (`gpt-5.5`) | Multi-signal reasoning |
| output | `OPENAI_FAST_MODEL` (`gpt-5.4-mini`) | DB write, logic already done |

## Context Engineering Rules

1. Each agent gets a FRESH context window (sub-agent isolation)
2. Only structured JSON crosses agent boundaries — never raw data
3. All agents have strict JSON output schemas in their system prompts
4. System prompts are STABLE (no dynamic data) to enable prompt caching
5. Dynamic data goes in the user message, not the system prompt

## Key Files

- `src/pipeline.ts` — entry point, run with `npm run pipeline`
- `src/orchestrator.ts` — coordinates agents for each account
- `src/agents/*.ts` — one file per agent, each with model + system prompt + tools
- `src/agents/openaiAgent.ts` — shared Responses API agent loop
- `src/tools/*.ts` — one file per external API integration
- `src/tools/openaiTools.ts` — helper for local OpenAI function tools
- `tests/*.test.ts` — Vitest tests
- `supabase/schema.sql` — Postgres schema for the `account_research` table
- `config/scoring_rubric.yaml` — editable scoring weights
- `config/target_personas.yaml` — LinkedIn titles to search for
- `accounts.json` — input account list

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY` — OpenAI API
- `OPENAI_STRONG_MODEL` / `OPENAI_FAST_MODEL` — optional model overrides
- `APIFY_TOKEN` — LinkedIn scraping
- `THEIRSTACK_API_KEY` — hiring signals
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — database

## Running

```bash
npm install
cp .env.example .env  # fill in keys
npm run pipeline
```

## Important Notes for Claude Code

- The OpenAI SDK entry point is `new OpenAI().responses.create(...)`
- Use hosted `web_search` via the Responses API for web research agents
- Use `src/tools/openaiTools.ts` for local function tools
- The project-level `src/agents/openaiAgent.ts` wrapper preserves the desired `.run()` interface for each agent definition
- Each tool function should handle errors gracefully and return error dicts rather than raising exceptions
- The SEC EDGAR API requires a descriptive User-Agent header — don't remove it
- Supabase uses upsert on `account_id` so re-running the same account updates rather than duplicates
