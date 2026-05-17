"""Pipeline Orchestrator — Coordinates agents for each account.

For each account:
1. Runs 4 research agents IN PARALLEL (separate context windows)
2. Feeds all research to the scoring agent
3. Persists the scored output to Supabase
"""

import asyncio
import json
from agents.web_research import web_research_agent
from agents.linkedin import linkedin_agent
from agents.hiring import hiring_agent
from agents.financials import financials_agent
from agents.scoring import scoring_agent
from agents.output import output_agent


async def process_account(account: dict) -> dict:
    """Process a single account through the full research pipeline.

    Args:
        account: Dict with keys: name, domain, ticker (optional)

    Returns:
        Scored account dict with research, score, and recommendations.
    """

    # STEP 1: Run 4 research agents IN PARALLEL
    # Each agent gets its own fresh context window.
    # Raw data (search results, LinkedIn HTML, full 10-Ks) stays inside each agent.
    # Only structured JSON output crosses the boundary.
    web, linkedin, hiring, financials = await asyncio.gather(
        web_research_agent.run(
            f"Research: {account['name']} ({account['domain']})"
        ),
        linkedin_agent.run(
            f"Find finance/procurement leaders at {account['name']} ({account['domain']})"
        ),
        hiring_agent.run(
            f"Pull hiring signals for {account['domain']}"
        ),
        financials_agent.run(
            f"Analyze filings: {account['name']} (ticker: {account.get('ticker', 'unknown')})"
        ),
    )

    # STEP 2: Score — the scoring agent receives ~2,300 tokens of clean JSON
    # (not 50 pages of raw API responses)
    research_bundle = json.dumps({
        "company": account["name"],
        "domain": account["domain"],
        "web_research": json.loads(web) if isinstance(web, str) else web,
        "linkedin_profiles": json.loads(linkedin) if isinstance(linkedin, str) else linkedin,
        "hiring_signals": json.loads(hiring) if isinstance(hiring, str) else hiring,
        "financial_intelligence": json.loads(financials) if isinstance(financials, str) else financials,
    })

    score_result = await scoring_agent.run(f"Score this account:\n{research_bundle}")
    score_data = json.loads(score_result) if isinstance(score_result, str) else score_result

    # STEP 3: Persist to Supabase
    output = {
        "id": account.get("id", account["domain"]),
        "company": account["name"],
        "domain": account["domain"],
        **score_data,
        "raw_research": research_bundle,
    }

    await output_agent.run(f"Persist this account: {json.dumps(output)}")

    return output
