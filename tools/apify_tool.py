"""LinkedIn Profile Scraping via Apify.

Uses the apimaestro/linkedin-profile-detail actor.
Requires APIFY_TOKEN environment variable.

`_scrape_linkedin_profile_impl` holds the logic (directly testable);
`scrape_linkedin_profile` is the @function_tool-wrapped agent tool.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from agents import function_tool


async def _scrape_linkedin_profile_impl(profile_url: str) -> dict[str, Any]:
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        return {"error": "APIFY_TOKEN not set in environment variables"}

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
            return {"error": f"No profile data returned for {profile_url}"}
        return items[0]
    except httpx.HTTPError as e:
        return {"error": f"Apify request failed: {e}"}


@function_tool
async def scrape_linkedin_profile(profile_url: str) -> dict[str, Any]:
    """Scrape a LinkedIn profile via Apify.

    Returns structured profile data including name, headline, current
    title, experience, and education.

    Args:
        profile_url: The full LinkedIn profile URL (e.g., "https://linkedin.com/in/janedoe").
    """
    return await _scrape_linkedin_profile_impl(profile_url)
