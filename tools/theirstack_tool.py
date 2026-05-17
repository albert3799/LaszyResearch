"""Hiring Signal Detection via TheirStack.

Pulls open job listings for a company domain.
Requires THEIRSTACK_API_KEY environment variable.

The plain `_search_theirstack_impl` async function holds the actual logic
(directly testable); `search_theirstack` is the @function_tool-wrapped
version that gets handed to the hiring agent.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from agents import function_tool


async def _search_theirstack_impl(company_domain: str) -> dict[str, Any]:
    api_key = os.environ.get("THEIRSTACK_API_KEY")
    if not api_key:
        return {"error": "THEIRSTACK_API_KEY not set in environment variables"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://api.theirstack.com/v1/jobs",
                params={"company_domain": company_domain},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        return {"error": f"TheirStack request failed: {e}"}


@function_tool
async def search_theirstack(company_domain: str) -> dict[str, Any]:
    """Pull open job listings for a company from TheirStack.

    Returns open roles with titles, departments, and posting dates.

    Args:
        company_domain: The company's domain (e.g., "acmecorp.com").
    """
    return await _search_theirstack_impl(company_domain)
