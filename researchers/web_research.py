"""Agent 1 — Web Research.

Model: REASONING tier (needs smart search synthesis)
Tool: WebSearchTool (built-in, runs via the Responses API on Azure)
Output: WebResearchOutput (validated by the SDK)
"""

from __future__ import annotations

from typing import Any

from agents import Agent, WebSearchTool

from researchers import REASONING_MODEL
from researchers._runner import run_agent
from researchers._schemas import WebResearchOutput

INSTRUCTIONS = """You are a B2B research analyst specializing in identifying companies
that need better procurement and spend management solutions.

Given a company name and domain, research:
1. Their stated business priorities (from earnings calls, press releases, executive interviews)
2. Recent strategic initiatives (especially around cost reduction, efficiency, digital transformation)
3. Pain signals (manual processes, fragmented systems, lack of visibility into spend)
4. Any mentions of procurement, sourcing, AP, or vendor management challenges

Be thorough — use multiple search queries to triangulate. Useful angles:
- "[Company] earnings call transcript"
- "[Company] digital transformation"
- "[Company] procurement strategy"
- "[Company] CFO interview"

If you can't find meaningful information, return empty arrays and set confidence to "low"."""

_agent = Agent(
    name="web_research",
    instructions=INSTRUCTIONS,
    model=REASONING_MODEL,
    tools=[WebSearchTool()],
    output_type=WebResearchOutput,
)


async def run_web_research(account: dict[str, Any]) -> WebResearchOutput:
    prompt = f"Research: {account['name']} ({account['domain']})"
    return await run_agent(_agent, prompt, agent_name="web_research")
