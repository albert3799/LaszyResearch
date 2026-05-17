"""SEC EDGAR Filing Retrieval.

Fetches 10-K annual reports for public companies. No API key required.
SEC fair-access policy requires a descriptive User-Agent header.
"""

from __future__ import annotations

from typing import Any

import httpx
from agents import function_tool

SEC_HEADERS = {
    "User-Agent": "LaszyResearch/1.0 (albert@zip.co)",
    "Accept-Encoding": "gzip, deflate",
}


async def _fetch_sec_filings_impl(company_name: str, ticker: str = "") -> dict[str, Any]:
    query = ticker if ticker and ticker != "unknown" else company_name

    try:
        async with httpx.AsyncClient(timeout=60.0, headers=SEC_HEADERS) as client:
            search_resp = await client.get(
                "https://efts.sec.gov/LATEST/search-index",
                params={
                    "q": query,
                    "dateRange": "custom",
                    "startdt": "2024-01-01",
                    "forms": "10-K",
                },
            )
            search_resp.raise_for_status()
            results = search_resp.json()

            hits = results.get("hits", {}).get("hits", [])
            if not hits:
                return {
                    "error": f"No 10-K found for {company_name}. Company may be private.",
                    "filings": [],
                    "company": company_name,
                }

            filing_source = hits[0]["_source"]
            filing_url = filing_source.get("file_url", "")
            if not filing_url:
                return {
                    "error": "Filing URL not found in search results",
                    "filings": [],
                    "company": company_name,
                }

            filing_resp = await client.get(f"https://www.sec.gov{filing_url}")
            filing_resp.raise_for_status()
            content = filing_resp.text[:100_000]

        return {
            "filing_type": "10-K",
            "company": company_name,
            "content": content,
            "source_url": f"https://www.sec.gov{filing_url}",
            "filing_date": filing_source.get("file_date", "unknown"),
        }
    except httpx.HTTPError as e:
        return {
            "error": f"SEC EDGAR request failed: {e}",
            "filings": [],
            "company": company_name,
        }


@function_tool
async def fetch_sec_filings(company_name: str, ticker: str = "") -> dict[str, Any]:
    """Fetch the most recent 10-K filing from SEC EDGAR.

    Returns filing text content (capped at ~100K chars). For private
    companies, returns an empty result with a note.

    Args:
        company_name: The company's full legal name (e.g., "Apple Inc").
        ticker: Stock ticker symbol (optional, improves search accuracy).
    """
    return await _fetch_sec_filings_impl(company_name, ticker)
