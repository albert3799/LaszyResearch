"""Agent 3 — Hiring Signals.

Model: EXTRACTION tier (pattern-matching on structured data)
Tool: search_theirstack (TheirStack API)
Output: HiringOutput
"""

from __future__ import annotations

from typing import Any

from agents import Agent

from researchers import EXTRACTION_MODEL
from researchers._runner import run_agent
from researchers._schemas import HiringOutput
from tools.theirstack_tool import search_theirstack

INSTRUCTIONS = """You analyze hiring patterns as buying signals for Zip
(an intake-to-pay procurement platform).

Call search_theirstack for the company's domain to pull open roles, then
classify the buying-signal strength.

STRONG signals (company is investing in procurement):
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
- Unrelated hiring (engineering, marketing, sales)"""

_agent = Agent(
    name="hiring",
    instructions=INSTRUCTIONS,
    model=EXTRACTION_MODEL,
    tools=[search_theirstack],
    output_type=HiringOutput,
)


async def run_hiring(account: dict[str, Any]) -> HiringOutput:
    prompt = f"Pull hiring signals for {account['domain']}"
    return await run_agent(_agent, prompt, agent_name="hiring")
