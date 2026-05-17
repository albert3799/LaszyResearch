"""Agent 2 — LinkedIn Profiles.

Model: EXTRACTION tier (structured extraction, cheapest sufficient model)
Tools: WebSearchTool (find profile URLs) + scrape_linkedin_profile (Apify)
Output: LinkedInOutput
"""

from __future__ import annotations

from typing import Any

from agents import Agent, WebSearchTool

from researchers import EXTRACTION_MODEL
from researchers._runner import run_agent
from researchers._schemas import LinkedInOutput
from tools.apify_tool import scrape_linkedin_profile

INSTRUCTIONS = """You find key stakeholders at the target company who would be
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
1. Use WebSearch to find LinkedIn profile URLs matching these titles at the company.
2. Call scrape_linkedin_profile for the top 2-3 most relevant profile URLs.
3. Return the structured stakeholders list.

If you cannot find relevant stakeholders, return an empty stakeholders list."""

_agent = Agent(
    name="linkedin",
    instructions=INSTRUCTIONS,
    model=EXTRACTION_MODEL,
    tools=[WebSearchTool(), scrape_linkedin_profile],
    output_type=LinkedInOutput,
)


async def run_linkedin(account: dict[str, Any]) -> LinkedInOutput:
    prompt = f"Find finance/procurement leaders at {account['name']} ({account['domain']})"
    return await run_agent(_agent, prompt, agent_name="linkedin")
