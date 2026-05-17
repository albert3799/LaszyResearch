"""Agent 6 — Output / Persist.

Model: claude-haiku-4-5 (formatting + DB write — logic already done by scoring agent)
Tool: persist_to_db (Supabase upsert)
Job: Take scored account data and persist it to the database.
"""

from __future__ import annotations

import json
from typing import Any

from claude_agent_sdk import ClaudeAgentOptions, create_sdk_mcp_server

from agents._runner import run_agent
from tools.supabase_tool import persist_to_db

SYSTEM_PROMPT = """You take scored account research data and persist it to the database.

You will receive a JSON object with the complete research output for one account:
company name, domain, score, confidence, rationale, key evidence,
recommended persona, message angle, and raw research data.

Your job:
1. Call persist_to_db once with the complete account_data object exactly as received.
2. Confirm the write succeeded.

Do not modify the data. Do not call the tool more than once.

IMPORTANT: After the tool call, your response must be valid JSON:
{"status": "persisted"|"error", "id": "string (if persisted)", "message": "string (if error)"}"""

_server = create_sdk_mcp_server(
    name="supabase",
    version="1.0.0",
    tools=[persist_to_db],
)


async def run_output(scored_account: dict[str, Any]) -> dict[str, Any]:
    options = ClaudeAgentOptions(
        model="claude-haiku-4-5",
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"supabase": _server},
        allowed_tools=["mcp__supabase__persist_to_db"],
        max_turns=2,
        permission_mode="bypassPermissions",
    )
    prompt = f"Persist this account: {json.dumps(scored_account)}"
    return await run_agent(prompt, options, agent_name="output")
