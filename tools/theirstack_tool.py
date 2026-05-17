"""Hiring Signal Detection via TheirStack.

Pulls open job listings for a company domain.
Requires THEIRSTACK_API_KEY environment variable.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from claude_agent_sdk import tool


@tool(
    "search_theirstack",
    "Pull open job listings for a company from TheirStack. Returns open roles with titles, departments, and posting dates.",
    {"company_domain": str},
)
async def search_theirstack(args: dict[str, Any]) -> dict[str, Any]:
    company_domain = args["company_domain"]
    api_key = os.environ.get("THEIRSTACK_API_KEY")
    if not api_key:
        return _content({"error": "THEIRSTACK_API_KEY not set in environment variables"})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://api.theirstack.com/v1/jobs",
                params={"company_domain": company_domain},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            return _content(resp.json())

    except httpx.HTTPError as e:
        return _content({"error": f"TheirStack request failed: {e}"})


def _content(payload: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload)}]}
