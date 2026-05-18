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

1. Runs the V1 research agents **in parallel** (web research + hiring)
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
| `SERPER_API_KEY` | Report PDF search | [serper.dev](https://serper.dev) |
| `COMPANIES_HOUSE_API_KEY` | UK filings fallback | [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk) |
| `APIFY_TOKEN` | LinkedIn scraping | [apify.com](https://apify.com) |
| `THEIRSTACK_API_KEY` | Hiring signals | [theirstack.com](https://theirstack.com) |
| `SUPABASE_URL` | Database | [supabase.com](https://supabase.com) |
| `SUPABASE_SERVICE_KEY` | Database | Supabase project settings |

Optional model overrides:
- `OPENAI_STRONG_MODEL` defaults to `gpt-5.5`
- `OPENAI_FAST_MODEL` defaults to `gpt-5.4-mini`
- `REPORT_FINDER_MODEL` defaults to `gpt-5.4-nano`
- `REPORT_ANALYST_MODEL` defaults to `gpt-5.4`

## Financial Report Intelligence

The `financialsAgent` is a two-step facade:

1. `reportFinderAgent` searches Serper for annual/interim/quarterly report PDFs, samples candidate PDFs, verifies the document, downloads it, and extracts text.
2. `reportAnalystAgent` reads the extracted report text and returns structured Zip-relevant signals.

The facade maps this report intelligence back into the existing `financial_intelligence` shape consumed by the scoring agent.

## Scripts

```bash
npm run pipeline    # process accounts.json
npm run agent:web -- "Tesco" tescoplc.com
npm run agent:hiring -- <account_uuid> "Tesco" tescoplc.com "https://www.linkedin.com/company/tesco/"
npm run typecheck   # TypeScript check
npm test            # Vitest suite
```

## V1 Scope

V1 runs only the web research and hiring agents before scoring. The research
bundle still includes `linkedin_profiles` and `financial_intelligence`, but they
are explicit empty placeholders until those agents are enabled again.

## Database

Run `supabase/schema.sql` once in your Supabase SQL editor before the first live pipeline run. The pipeline upserts into `account_research` by `account_id`.
