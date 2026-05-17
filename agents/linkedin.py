"""Agent 2 — LinkedIn Profiles.

Model: claude-haiku-4-5 (structured extraction — cheapest model works fine)
Tool: scrape_linkedin_profile (Apify actor)
Job: Find and analyze key finance/procurement stakeholders.
"""

from __future__ import annotations

from typing import Any

from claude_agent_sdk import ClaudeAgentOptions, create_sdk_mcp_server

from agents._runner import run_agent
from tools.apify_tool import scrape_linkedin_profile

SYSTEM_PROMPT = """You find key stakeholders at the target company who would be
decision-makers or influencers for procurement/spend management tooling.

Target titles (in priority order):
- Chief Procurement Officer (CPO)
- VP/Director of Procurement
- VP/Director of Finance Operations
- Chief Financial Officer (CFO)
- VP/Director of Accounts Payable
- Head of Strategic Sourcing
- VP/Director of Operations

Your process:
1. Use WebSearch to find LinkedIn profile URLs matching these titles at the target company
2. Call scrape_linkedin_profile for the top 2-3 most relevant profile URLs
3. Extract structured data from each profile

IMPORTANT: Your ENTIRE response must be valid JSON with this exact schema:
{
  "stakeholders": [
    {
      "name": "string",
      "title": "string — current title",
      "tenure": "string — how long in this role (e.g., '2 years')",
      "background": "string — 1-2 sentences on relevant experience"
    }
  ]
}

If you cannot find relevant stakeholders, return: {"stakeholders": []}
Do not include any text outside the JSON object."""

_server = create_sdk_mcp_server(
    name="apify",
    version="1.0.0",
    tools=[scrape_linkedin_profile],
)


async def run_linkedin(account: dict[str, Any]) -> dict[str, Any]:
    options = ClaudeAgentOptions(
        model="claude-haiku-4-5",
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"apify": _server},
        allowed_tools=["WebSearch", "mcp__apify__scrape_linkedin_profile"],
        max_turns=6,
        permission_mode="bypassPermissions",
    )
    prompt = f"Find finance/procurement leaders at {account['name']} ({account['domain']})"
    return await run_agent(prompt, options, agent_name="linkedin")
