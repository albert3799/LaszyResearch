"""Pipeline Orchestrator — Coordinates agents for each account.

For each account:
1. Runs 4 research agents IN PARALLEL (separate context windows via separate query() calls)
2. Feeds the structured outputs to the scoring agent
3. Persists the scored output to Supabase
"""

from __future__ import annotations

import asyncio
from typing import Any

from agents.financials import run_financials
from agents.hiring import run_hiring
from agents.linkedin import run_linkedin
from agents.output import run_output
from agents.scoring import run_scoring
from agents.web_research import run_web_research


async def process_account(account: dict[str, Any]) -> dict[str, Any]:
    """Process a single account through the full research pipeline.

    Args:
        account: Dict with keys: name, domain, ticker (optional), id (optional)

    Returns:
        Scored account dict with research, score, and recommendations.
    """

    # STEP 1: Run 4 research agents IN PARALLEL.
    # Each agent runs its own query() — a fresh context window.
    # Raw API payloads (LinkedIn HTML, full 10-Ks, hiring lists) stay inside
    # each agent. Only the structured JSON output crosses the boundary.
    web, linkedin, hiring, financials = await asyncio.gather(
        run_web_research(account),
        run_linkedin(account),
        run_hiring(account),
        run_financials(account),
    )

    # STEP 2: Score — the scoring agent gets ~4 compact JSON objects, not 50
    # pages of raw research.
    research_bundle = {
        "company": account["name"],
        "domain": account["domain"],
        "web_research": web,
        "linkedin_profiles": linkedin,
        "hiring_signals": hiring,
        "financial_intelligence": financials,
    }
    score = await run_scoring(research_bundle)

    # STEP 3: Persist to Supabase.
    output = {
        "id": account.get("id") or account["domain"],
        "company": account["name"],
        "domain": account["domain"],
        **score,
        "raw_research": research_bundle,
    }
    await run_output(output)

    return output
