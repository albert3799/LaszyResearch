"""Agent 3 — Hiring Signals.

Model: claude-haiku-4-5 (pattern-matching on structured data — keep it cheap)
Tool: search_theirstack (TheirStack API)
Job: Analyze hiring patterns as buying signals.
"""

from claude_agent_sdk import Agent
from tools.theirstack_tool import search_theirstack

hiring_agent = Agent(
    name="hiring",
    model="claude-haiku-4-5",
    system="""You analyze hiring patterns as buying signals for Zip
(an intake-to-pay procurement platform).

Pull open roles at this company, then analyze what the hiring pattern signals.

STRONG buying signals (these roles suggest the company is investing in procurement):
- VP/Director of Procurement (especially new/greenfield roles)
- Procurement Manager / Strategic Sourcing Manager
- AP Automation Specialist
- Spend Analyst / Category Manager
- Finance Operations / Finance Transformation roles
- ERP Implementation roles (SAP, Oracle, Workday)

MODERATE signals:
- General finance hiring (Controller, FP&A)
- Operations roles with process improvement focus
- IT roles mentioning procurement systems

WEAK/NO signal:
- Unrelated hiring (engineering, marketing, sales)

IMPORTANT: Your ENTIRE response must be valid JSON with this exact schema:
{
  "open_roles": [
    {"title": "string", "department": "string"}
  ],
  "signal_strength": "strong|moderate|weak",
  "interpretation": "string — 1-2 sentences explaining what the hiring pattern means"
}

Do not include any text outside the JSON object.""",
    tools=[search_theirstack],
    max_turns=3,
)
