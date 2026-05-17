"""Agent 6 — Output / Persist.

Model: EXTRACTION tier (just calls persist_to_db with received data)
Tool: persist_to_db (Supabase upsert)
Output: OutputResult
"""

from __future__ import annotations

import json
from typing import Any

from agents import Agent

from researchers import EXTRACTION_MODEL
from researchers._runner import run_agent
from researchers._schemas import OutputResult
from tools.supabase_tool import persist_to_db

INSTRUCTIONS = """You take scored account research data and persist it to the database.

Call persist_to_db exactly once with the complete account_data object you received.
Do not modify the data. Do not call the tool more than once.
Return the resulting status."""

_agent = Agent(
    name="output",
    instructions=INSTRUCTIONS,
    model=EXTRACTION_MODEL,
    tools=[persist_to_db],
    output_type=OutputResult,
)


async def run_output(scored_account: dict[str, Any]) -> OutputResult:
    prompt = f"Persist this account: {json.dumps(scored_account, default=str)}"
    return await run_agent(_agent, prompt, agent_name="output")
