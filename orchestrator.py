"""Pipeline Orchestrator — Coordinates agents for each account.

For each account:
1. Runs 4 research agents IN PARALLEL (each Runner.run = separate context)
2. Feeds the typed outputs to the scoring agent
3. Persists the scored output to Supabase
"""

from __future__ import annotations

import asyncio
from typing import Any

from researchers.financials import run_financials
from researchers.hiring import run_hiring
from researchers.linkedin import run_linkedin
from researchers.output import run_output
from researchers.scoring import run_scoring
from researchers.web_research import run_web_research


async def process_account(account: dict[str, Any]) -> dict[str, Any]:
    """Process a single account through the full research pipeline.

    Returns the scored output dict (the same shape that lands in Supabase).
    """

    # STEP 1: Run 4 research agents IN PARALLEL.
    # Each Runner.run() spins up its own conversation — raw API payloads
    # stay inside that agent's context. Only the typed Pydantic output
    # crosses the boundary.
    web, linkedin, hiring, financials = await asyncio.gather(
        run_web_research(account),
        run_linkedin(account),
        run_hiring(account),
        run_financials(account),
    )

    # STEP 2: Score — the scoring agent gets 4 compact JSON objects.
    research_bundle = {
        "company": account["name"],
        "domain": account["domain"],
        "web_research": web.model_dump(),
        "linkedin_profiles": linkedin.model_dump(),
        "hiring_signals": hiring.model_dump(),
        "financial_intelligence": financials.model_dump(),
    }
    score = await run_scoring(research_bundle)

    # STEP 3: Persist to Supabase via the output agent.
    output = {
        "id": account.get("id") or account["domain"],
        "company": account["name"],
        "domain": account["domain"],
        **score.model_dump(),
        "raw_research": research_bundle,
    }
    await run_output(output)

    return output
