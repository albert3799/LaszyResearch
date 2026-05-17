"""SEC EDGAR Filing Retrieval.

Fetches 10-K annual reports and earnings transcripts for public companies.
No API key required — SEC EDGAR is free and public.
Requires a User-Agent header per SEC fair access policy.
"""

import requests
from claude_agent_sdk import tool

# SEC requires a descriptive User-Agent
SEC_HEADERS = {
    "User-Agent": "LaszyResearch/1.0 (albert@zip.co)",
    "Accept-Encoding": "gzip, deflate",
}


@tool
def fetch_sec_filings(company_name: str, ticker: str = None) -> dict:
    """Fetch annual reports and earnings transcripts from SEC EDGAR.

    Args:
        company_name: The company's full legal name (e.g., "Apple Inc")
        ticker: Stock ticker symbol (optional, improves search accuracy)

    Returns:
        Text content of the most recent 10-K filing.
        For private companies, returns an empty result with a note.
    """
    query = ticker if ticker and ticker != "unknown" else company_name

    try:
        # Search SEC EDGAR full-text search API
        search_response = requests.get(
            "https://efts.sec.gov/LATEST/search-index",
            params={
                "q": query,
                "dateRange": "custom",
                "startdt": "2024-01-01",
                "forms": "10-K",
            },
            headers=SEC_HEADERS,
            timeout=30,
        )
        search_response.raise_for_status()
        results = search_response.json()

        hits = results.get("hits", {}).get("hits", [])
        if not hits:
            return {
                "error": f"No 10-K found for {company_name}. Company may be private.",
                "filings": [],
                "company": company_name,
            }

        # Get the most recent 10-K
        filing_source = hits[0]["_source"]
        filing_url = filing_source.get("file_url", "")

        if not filing_url:
            return {
                "error": "Filing URL not found in search results",
                "filings": [],
                "company": company_name,
            }

        # Fetch the filing content
        filing_response = requests.get(
            f"https://www.sec.gov{filing_url}",
            headers=SEC_HEADERS,
            timeout=60,
        )
        filing_response.raise_for_status()

        # Cap content to prevent token overflow
        # ~100K chars ≈ ~25K tokens, well within agent context limits
        content = filing_response.text[:100_000]

        return {
            "filing_type": "10-K",
            "company": company_name,
            "content": content,
            "source_url": f"https://www.sec.gov{filing_url}",
            "filing_date": filing_source.get("file_date", "unknown"),
        }

    except requests.exceptions.RequestException as e:
        return {
            "error": f"SEC EDGAR request failed: {str(e)}",
            "filings": [],
            "company": company_name,
        }
