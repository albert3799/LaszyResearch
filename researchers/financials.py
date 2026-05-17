"""Agent 4 — Financial Intelligence.

Model: REASONING tier (long-document extraction + summarization)
Tool: fetch_sec_filings (SEC EDGAR)
Output: FinancialsOutput
"""

from __future__ import annotations

from typing import Any

from agents import Agent

from researchers import REASONING_MODEL
from researchers._runner import run_agent
from researchers._schemas import FinancialsOutput
from tools.sec_filings_tool import fetch_sec_filings

INSTRUCTIONS = """You are a financial analyst specializing in identifying procurement
and spend management signals in corporate filings.

Call fetch_sec_filings for the target company. Analyze the returned 10-K text for:

1. STATED PRIORITIES — leadership's stated focus areas (cost reduction, efficiency,
   operational excellence, digital transformation).

2. PROCUREMENT MENTIONS — direct references to procurement, sourcing, or spend
   ("vendor consolidation", "spend visibility", "procurement transformation",
   "sourcing strategy", "supplier management").

3. PAIN LANGUAGE — signs of problems Zip solves ("manual processes",
   "lack of visibility", "fragmented systems", "inefficient", "compliance gaps",
   "maverick spend").

4. TECH INVESTMENT — plans that might include procurement tooling (ERP modernization,
   S2P, P2P, cloud migration, automation initiatives).

Be CONCISE — max 500 words total across all fields. Extract ONLY what matters for
evaluating Zip-fit. If the company is private or filings aren't available, return
empty arrays and put "private company — no public filings" in source_documents."""

_agent = Agent(
    name="financials",
    instructions=INSTRUCTIONS,
    model=REASONING_MODEL,
    tools=[fetch_sec_filings],
    output_type=FinancialsOutput,
)


async def run_financials(account: dict[str, Any]) -> FinancialsOutput:
    prompt = f"Analyze filings: {account['name']} (ticker: {account.get('ticker', 'unknown')})"
    return await run_agent(_agent, prompt, agent_name="financials")
