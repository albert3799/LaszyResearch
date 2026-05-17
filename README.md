# LaszyResearch

Multi-agent account research pipeline for Zip BDR team. Scores target accounts on "Zip-fit" using web research, LinkedIn profiles, hiring signals, and financial filings.

## Quick Start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env  # Fill in your API keys
npm run pipeline
```

## How It Works

For each account in `accounts.json`, the pipeline:

1. Runs 4 research agents **in parallel** (web, LinkedIn, hiring, financials)
2. Feeds structured findings to a **scoring agent** (rates 1-10 on Zip-fit)
3. **Persists** the scored output to Supabase

Built with TypeScript on the [OpenAI JavaScript/TypeScript SDK](https://developers.openai.com/api/docs) and the Responses API.

## Project Structure

```
LaszyResearch/
├── src/pipeline.ts      # Entry point
├── src/orchestrator.ts  # Agent coordination
├── src/agents/          # 6 agent definitions
├── src/tools/           # External API integrations
├── tests/               # Vitest test suite
├── supabase/schema.sql  # Database schema
├── config/              # Scoring rubric + target personas
├── memory/              # Persistent scoring patterns
└── accounts.json        # Your account list (input)
```

## Required API Keys

| Key | Service | Get it from |
|-----|---------|-------------|
| `OPENAI_API_KEY` | OpenAI API | [platform.openai.com](https://platform.openai.com) |
| `APIFY_TOKEN` | LinkedIn scraping | [apify.com](https://apify.com) |
| `THEIRSTACK_API_KEY` | Hiring signals | [theirstack.com](https://theirstack.com) |
| `SUPABASE_URL` | Database | [supabase.com](https://supabase.com) |
| `SUPABASE_SERVICE_KEY` | Database | Supabase project settings |

Optional model overrides:
- `OPENAI_STRONG_MODEL` defaults to `gpt-5.5`
- `OPENAI_FAST_MODEL` defaults to `gpt-5.4-mini`

## Scripts

```bash
npm run pipeline    # process accounts.json
npm run typecheck   # TypeScript check
npm test            # Vitest suite
```

## Database

Run `supabase/schema.sql` once in your Supabase SQL editor before the first live pipeline run. The pipeline upserts into `account_research` by `account_id`.
