# LaszyResearch

Multi-agent account research pipeline for Zip BDR team. Scores target accounts on "Zip-fit" using web research, LinkedIn profiles, hiring signals, and financial filings.

## Quick Start

```bash
pip install -r requirements.txt
cp .env.example .env  # Fill in your API keys
python pipeline.py
```

## How It Works

For each account in `accounts.json`, the pipeline:

1. Runs 4 research agents **in parallel** (web, LinkedIn, hiring, financials)
2. Feeds structured findings to a **scoring agent** (rates 1-10 on Zip-fit)
3. **Persists** the scored output to Supabase

Built on the [Claude Agent SDK](https://docs.anthropic.com) (Python).

## Project Structure

```
LaszyResearch/
├── pipeline.py          # Entry point
├── orchestrator.py      # Agent coordination
├── agents/              # 6 agent definitions
├── tools/               # External API integrations
├── config/              # Scoring rubric + target personas
├── memory/              # Persistent scoring patterns
└── accounts.json        # Your account list (input)
```

## Required API Keys

| Key | Service | Get it from |
|-----|---------|-------------|
| `ANTHROPIC_API_KEY` | Claude API | [console.anthropic.com](https://console.anthropic.com) |
| `APIFY_TOKEN` | LinkedIn scraping | [apify.com](https://apify.com) |
| `THEIRSTACK_API_KEY` | Hiring signals | [theirstack.com](https://theirstack.com) |
| `SUPABASE_URL` | Database | [supabase.com](https://supabase.com) |
| `SUPABASE_SERVICE_KEY` | Database | Supabase project settings |
