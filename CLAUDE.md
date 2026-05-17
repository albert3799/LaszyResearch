# LaszyResearch — Claude Code Context

## What This Project Is

A multi-agent research pipeline for Zip HQ's BDR team. Takes a list of target accounts and, for each one, autonomously:
1. Researches business priorities (web search)
2. Finds key stakeholders (LinkedIn via Apify)
3. Detects hiring signals (TheirStack API)
4. Analyzes financial filings (SEC EDGAR)
5. Scores the account on "Zip-fit" (1-10)
6. Persists everything to Supabase

Built on the **OpenAI Agents SDK** (`openai-agents` package) pointed at **Azure OpenAI**. Each agent has one tool and one job.

## Architecture

- **6 agents + 1 orchestrator** — defined in `researchers/` (NOT `agents/` — that name would shadow the OpenAI Agents SDK package)
- **4 custom tools** — defined in `tools/`
- **Orchestrator** (`orchestrator.py`) — processes one account at a time, runs agents 1-4 in parallel via `asyncio.gather`, then scoring, then persist
- **Output validation** — every agent has `output_type=<PydanticModel>` from `researchers/_schemas.py`; the SDK guarantees the model output matches the schema
- **Database** — Supabase (Postgres). Schema in `supabase/schema.sql`.
- **Frontend** — separate app, reads from Supabase. NOT in this repo.

## Agent → Model Tier Mapping

Model deployments are configured via env vars so the same code works across Azure tenants.

| Agent | Tier | Env var | Why |
|-------|------|---------|-----|
| web_research | reasoning | `REASONING_MODEL_DEPLOYMENT` | Search synthesis |
| linkedin | extraction | `EXTRACTION_MODEL_DEPLOYMENT` | Structured extraction |
| hiring | extraction | `EXTRACTION_MODEL_DEPLOYMENT` | Pattern matching |
| financials | reasoning | `REASONING_MODEL_DEPLOYMENT` | Long-document analysis |
| scoring | reasoning | `REASONING_MODEL_DEPLOYMENT` | Multi-signal reasoning |
| output | extraction | `EXTRACTION_MODEL_DEPLOYMENT` | DB write |

## Context Engineering Rules

1. Each agent runs in its own `Runner.run()` call — fresh context, no cross-bleed
2. Only typed Pydantic outputs cross agent boundaries — never raw API data
3. Output schemas live in `researchers/_schemas.py`, NOT in the system prompts — the SDK enforces them
4. System prompts are STABLE (no dynamic data) to enable prompt caching
5. Dynamic data goes in the user message, not the system prompt

## Key Files

- `pipeline.py` — entry point, run with `python pipeline.py`
- `orchestrator.py` — coordinates agents for each account
- `researchers/__init__.py` — wires the SDK to Azure OpenAI at import time
- `researchers/_runner.py` — thin Runner.run wrapper with timing logs
- `researchers/_schemas.py` — Pydantic output models, one per agent
- `researchers/*.py` — one file per agent, each with instructions + Agent + run_<name>
- `tools/*.py` — one file per external API integration (decorated with `@function_tool`)
- `supabase/schema.sql` — Postgres schema for the `account_research` table
- `config/scoring_rubric.yaml` — editable scoring weights (informational; rubric lives in scoring.py prompt)
- `config/target_personas.yaml` — LinkedIn titles (informational; lives in linkedin.py prompt)
- `accounts.json` — input account list

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `AZURE_OPENAI_ENDPOINT` — v1 base URL (`https://<resource>.openai.azure.com/openai/v1`)
- `AZURE_OPENAI_API_KEY` — Azure OpenAI resource key
- `REASONING_MODEL_DEPLOYMENT`, `EXTRACTION_MODEL_DEPLOYMENT` — deployment names
- `APIFY_TOKEN` — LinkedIn scraping
- `THEIRSTACK_API_KEY` — hiring signals
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — database

## Running

```bash
pip install -r requirements.txt
cp .env.example .env  # fill in keys
python pipeline.py
```

## Important Notes for Claude Code

- The package directory is `researchers/`, NOT `agents/` — the OpenAI Agents SDK reserves `agents` for itself, and Python imports the local directory first which would shadow the SDK.
- Each tool function is decorated with `@function_tool` from `agents` (the SDK). The decorator wraps the function in a `FunctionTool` object; call it via `tool.on_invoke_tool(ctx, json_args)` in tests.
- Each agent's `output_type` is a Pydantic model from `researchers/_schemas.py`. The SDK enforces the schema — DO NOT add "return JSON" instructions to the system prompts; they're redundant.
- The SEC EDGAR API requires a descriptive User-Agent header — don't remove it.
- Supabase uses upsert on `account_id` so re-running the same account updates rather than duplicates.
- Tracing is disabled in `researchers/__init__.py` (would otherwise post to openai.com, which rejects Azure-issued keys anyway).
