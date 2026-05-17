"""Hiring Signal Detection via TheirStack.

Pulls open job listings for a company domain.
Requires THEIRSTACK_API_KEY environment variable.
"""

import os
import requests
from claude_agent_sdk import tool


@tool
def search_theirstack(company_domain: str) -> dict:
    """Pull open job listings from TheirStack API.

    Args:
        company_domain: The company's domain (e.g., "acmecorp.com")

    Returns:
        Open roles list with titles, departments, and posting dates.
    """
    api_key = os.environ.get("THEIRSTACK_API_KEY")
    if not api_key:
        return {"error": "THEIRSTACK_API_KEY not set in environment variables"}

    try:
        response = requests.get(
            "https://api.theirstack.com/v1/jobs",
            params={"company_domain": company_domain},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        return {"error": f"TheirStack request failed: {str(e)}"}
