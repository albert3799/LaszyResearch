"""Agent 2 — LinkedIn Profiles.

Model: claude-haiku-4-5 (structured extraction — cheapest model works fine)
Tool: scrape_linkedin_profile (Apify actor)
Job: Find and analyze key finance/procurement stakeholders.
"""

from claude_agent_sdk import Agent
from tools.apify_tool import scrape_linkedin_profile

linkedin_agent = Agent(
    name="linkedin",
    model="claude-haiku-4-5",
    system="""You find key stakeholders at the target company who would be
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
1. Search for LinkedIn profiles matching these titles at the company
2. Scrape the top 2-3 most relevant profiles
3. Extract structured data from each

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
Do not include any text outside the JSON object.""",
    tools=[scrape_linkedin_profile],
    max_turns=5,
)
