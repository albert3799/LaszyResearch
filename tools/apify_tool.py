"""LinkedIn Profile Scraping via Apify.

Uses the apimaestro/linkedin-profile-detail actor.
Requires APIFY_TOKEN environment variable.
"""

import os
import requests
from claude_agent_sdk import tool


@tool
def scrape_linkedin_profile(profile_url: str) -> dict:
    """Scrape a LinkedIn profile via Apify actor.

    Args:
        profile_url: The full LinkedIn profile URL
                     (e.g., "https://linkedin.com/in/janedoe")

    Returns:
        Structured profile data including name, title, experience, education.
    """
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        return {"error": "APIFY_TOKEN not set in environment variables"}

    try:
        # Start the Apify actor run
        response = requests.post(
            "https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/runs",
            json={"startUrls": [{"url": profile_url}]},
            headers={"Authorization": f"Bearer {token}"},
            params={"waitForFinish": 120},
            timeout=180,
        )
        response.raise_for_status()
        run_data = response.json()

        # Fetch results from the dataset
        dataset_id = run_data["data"]["defaultDatasetId"]
        items_response = requests.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}/items",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        items_response.raise_for_status()
        items = items_response.json()

        if not items:
            return {"error": f"No profile data returned for {profile_url}"}

        return items[0]

    except requests.exceptions.RequestException as e:
        return {"error": f"Apify request failed: {str(e)}"}
