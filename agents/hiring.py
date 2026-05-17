"""Agent 3 — Hiring Signals.

Model: claude-haiku-4-5 (pattern-matching on structured data — keep it cheap)
Tool: search_theirstack (TheirStack API)
Job: Analyze hiring patterns as buying signals.
"""

from __future__ import annotations

from typing import Any

from claude_agent_sdk import ClaudeAgentOptions, create_sdk_mcp_server

from agents._runner import run_agent
from tools.theirstack_tool import search_theirstack

SYSTEM_PROMPT = """You analyze hiring patterns as buying signals for Zip
(an intake-to-pay procurement platform).

Call search_theirstack for the company's domain to pull open roles, then
analyze what the hiring pattern signals.

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

Do not include any text outside the JSON object."""

_server = create_sdk_mcp_server(
    name="theirstack",
    version="1.0.0",
    tools=[search_theirstack],
)


async def run_hiring(account: dict[str, Any]) -> dict[str, Any]:
    options = ClaudeAgentOptions(
        model="claude-haiku-4-5",
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"theirstack": _server},
        allowed_tools=["mcp__theirstack__search_theirstack"],
        max_turns=3,
        permission_mode="bypassPermissions",
    )
    prompt = f"Pull hiring signals for {account['domain']}"
    return await run_agent(prompt, options, agent_name="hiring")
