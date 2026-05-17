"""LinkedIn Profile Scraping via Apify.

Uses the apimaestro/linkedin-profile-detail actor.
Requires APIFY_TOKEN environment variable.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from claude_agent_sdk import tool


@tool(
    "scrape_linkedin_profile",
    "Scrape a LinkedIn profile via Apify. Returns structured profile data with name, headline, current title, experience, and education.",
    {"profile_url": str},
)
async def scrape_linkedin_profile(args: dict[str, Any]) -> dict[str, Any]:
    profile_url = args["profile_url"]
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        return _content({"error": "APIFY_TOKEN not set in environment variables"})

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            run_resp = await client.post(
                "https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/runs",
                json={"startUrls": [{"url": profile_url}]},
                headers={"Authorization": f"Bearer {token}"},
                params={"waitForFinish": 120},
            )
            run_resp.raise_for_status()
            run_data = run_resp.json()

            dataset_id = run_data["data"]["defaultDatasetId"]
            items_resp = await client.get(
                f"https://api.apify.com/v2/datasets/{dataset_id}/items",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            items_resp.raise_for_status()
            items = items_resp.json()

        if not items:
            return _content({"error": f"No profile data returned for {profile_url}"})
        return _content(items[0])

    except httpx.HTTPError as e:
        return _content({"error": f"Apify request failed: {e}"})


def _content(payload: dict[str, Any]) -> dict[str, Any]:
    """Wrap a JSON payload in the MCP tool-result content shape."""
    return {"content": [{"type": "text", "text": json.dumps(payload)}]}
