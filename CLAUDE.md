# LaszyResearch — Claude Code Context

## What This Project Is

A multi-agent research pipeline for Zip HQ's BDR team. Takes a list of target accounts and, for each one, autonomously:
1. Researches business priorities (web search)
2. Finds key stakeholders (LinkedIn via Apify)
3. Detects hiring signals (TheirStack API)
4. Analyzes financial filings (SEC EDGAR)
5. Scores the account on "Zip-fit" (1-10)
6. Persists everything to Supabase

Built on the Claude Agent SDK (Python). Each agent has one tool and one job.

## Architecture

- **6 agents + 1 orchestrator** — defined in `agents/`
- **4 custom tools** — defined in `tools/`
- **Orchestrator** (`orchestrator.py`) — processes one account at a time, runs agents 1-4 in parallel via `asyncio.gather`, then scoring, then persist
- **Database** — Supabase (Postgres). Schema in the architecture plan doc.
- **Frontend** — separate app (Replit/Lovable), reads from Supabase. NOT in this repo.

## Agent → Model Mapping

| Agent | Model | Why |
|-------|-------|-----|
| web_research | claude-sonnet-4-6 | Needs smart search synthesis |
| linkedin | claude-haiku-4-5 | Structured extraction |
| hiring | claude-haiku-4-5 | Pattern matching |
| financials | claude-sonnet-4-6 | Long document analysis |
| scoring | claude-sonnet-4-6 | Multi-signal reasoning |
| output | claude-haiku-4-5 | DB write, logic already done |

## Context Engineering Rules

1. Each agent gets a FRESH context window (sub-agent isolation)
2. Only structured JSON crosses agent boundaries — never raw data
3. All agents have strict JSON output schemas in their system prompts
4. System prompts are STABLE (no dynamic data) to enable prompt caching
5. Dynamic data goes in the user message, not the system prompt

## Key Files

- `pipeline.py` — entry point, run with `python pipeline.py`
- `orchestrator.py` — coordinates agents for each account
- `agents/*.py` — one file per agent, each with model + system prompt + tools
- `tools/*.py` — one file per external API integration
- `config/scoring_rubric.yaml` — editable scoring weights
- `config/target_personas.yaml` — LinkedIn titles to search for
- `accounts.json` — input account list

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `ANTHROPIC_API_KEY` — Claude API
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

- The `claude_agent_sdk` package may need to be installed as `claude-agent-sdk` — check PyPI for the exact package name when it's available
- The SDK's `@tool` decorator, `Agent` class, and `.run()` method are the core primitives
- If the SDK API surface differs from what's coded here, adapt the agent definitions to match the actual SDK — the system prompts and tool logic are the important parts
- Each tool function should handle errors gracefully and return error dicts rather than raising exceptions
- The SEC EDGAR API requires a descriptive User-Agent header — don't remove it
- Supabase uses upsert on `account_id` so re-running the same account updates rather than duplicates
