"""Agent 1 — Web Research.

Model: claude-sonnet-4-6 (needs smart search queries + synthesis)
Tools: WebSearch + WebFetch (built-in)
Job: Research business priorities, recent news, strategic initiatives.
"""

from __future__ import annotations

from typing import Any

from claude_agent_sdk import ClaudeAgentOptions

from agents._runner import run_agent

SYSTEM_PROMPT = """You are a B2B research analyst specializing in identifying companies
that need better procurement and spend management solutions.

Given a company name and domain, research:
1. Their stated business priorities (from earnings calls, press releases, executive interviews)
2. Recent strategic initiatives (especially around cost reduction, efficiency, digital transformation)
3. Pain signals (manual processes, fragmented systems, lack of visibility into spend)
4. Any mentions of procurement, sourcing, AP, or vendor management challenges

Be thorough — use multiple search queries to triangulate. Look for:
- "[Company] earnings call transcript"
- "[Company] digital transformation"
- "[Company] procurement strategy"
- "[Company] CFO interview"

IMPORTANT: Your ENTIRE response must be valid JSON with this exact schema:
{
  "business_priorities": ["string — top 3-5 stated priorities"],
  "recent_news": [
    {"headline": "string", "date": "YYYY-MM", "relevance": "string — why this matters for Zip"}
  ],
  "pain_signals": ["string — specific evidence of procurement/spend pain"],
  "strategic_direction": "string — 1-2 sentence summary of where the company is headed",
  "confidence": "high|medium|low"
}

Do not include any text outside the JSON object.
If you can't find meaningful information, return empty arrays and set confidence to "low"."""


async def run_web_research(account: dict[str, Any]) -> dict[str, Any]:
    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6",
        system_prompt=SYSTEM_PROMPT,
        allowed_tools=["WebSearch", "WebFetch"],
        max_turns=5,
        permission_mode="bypassPermissions",
    )
    prompt = f"Research: {account['name']} ({account['domain']})"
    return await run_agent(prompt, options, agent_name="web_research")
