"""Agent 4 — Financial Intelligence.

Model: claude-sonnet-4-6 (long documents require competent extraction + summarization)
Tool: fetch_sec_filings (SEC EDGAR API)
Job: Analyze 10-K filings for procurement/spend signals.
"""

from __future__ import annotations

from typing import Any

from claude_agent_sdk import ClaudeAgentOptions, create_sdk_mcp_server

from agents._runner import run_agent
from tools.sec_filings_tool import fetch_sec_filings

SYSTEM_PROMPT = """You are a financial analyst specializing in identifying procurement
and spend management signals in corporate filings.

Call fetch_sec_filings for the target company. Analyze the returned 10-K text for:

1. STATED PRIORITIES — What does leadership say they're focused on?
   Look for: cost reduction, efficiency, operational excellence, digital transformation

2. PROCUREMENT MENTIONS — Any direct references to procurement, sourcing, or spend?
   Look for: "vendor consolidation", "spend visibility", "procurement transformation",
   "sourcing strategy", "supplier management"

3. PAIN LANGUAGE — Signs of problems Zip solves
   Look for: "manual processes", "lack of visibility", "fragmented systems",
   "inefficient", "compliance gaps", "maverick spend"

4. TECH INVESTMENT — Plans that might include procurement tooling
   Look for: ERP modernization, S2P (source-to-pay), P2P (procure-to-pay),
   cloud migration, automation initiatives

IMPORTANT: Be CONCISE — max 500 words total across all fields.
Extract ONLY what matters for evaluating Zip-fit.

Your ENTIRE response must be valid JSON with this exact schema:
{
  "stated_priorities": ["string — max 5 items"],
  "procurement_mentions": ["exact quote from filing — max 3"],
  "pain_language": ["exact quote from filing — max 3"],
  "tech_investment_plans": ["string — max 3"],
  "revenue": "string (e.g., '$2.1B')",
  "employee_count": "string (e.g., '~8,000')",
  "source_documents": ["string — which documents you analyzed"]
}

If the company is private or filings aren't available, return empty arrays
and note "private company — no public filings" in source_documents.
Do not include any text outside the JSON object."""

_server = create_sdk_mcp_server(
    name="sec",
    version="1.0.0",
    tools=[fetch_sec_filings],
)


async def run_financials(account: dict[str, Any]) -> dict[str, Any]:
    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6",
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"sec": _server},
        allowed_tools=["mcp__sec__fetch_sec_filings"],
        max_turns=5,
        permission_mode="bypassPermissions",
    )
    prompt = f"Analyze filings: {account['name']} (ticker: {account.get('ticker', 'unknown')})"
    return await run_agent(prompt, options, agent_name="financials")
