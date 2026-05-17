"""SEC EDGAR Filing Retrieval.

Fetches 10-K annual reports for public companies. No API key required.
SEC fair-access policy requires a descriptive User-Agent header.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from claude_agent_sdk import tool

SEC_HEADERS = {
    "User-Agent": "LaszyResearch/1.0 (albert@zip.co)",
    "Accept-Encoding": "gzip, deflate",
}


@tool(
    "fetch_sec_filings",
    "Fetch the most recent 10-K filing from SEC EDGAR for a public company. Returns filing text content (capped at ~100K chars). For private companies, returns an empty result with a note.",
    {"company_name": str, "ticker": str},
)
async def fetch_sec_filings(args: dict[str, Any]) -> dict[str, Any]:
    company_name = args["company_name"]
    ticker = args.get("ticker") or ""
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
                return _content({
                    "error": f"No 10-K found for {company_name}. Company may be private.",
                    "filings": [],
                    "company": company_name,
                })

            filing_source = hits[0]["_source"]
            filing_url = filing_source.get("file_url", "")
            if not filing_url:
                return _content({
                    "error": "Filing URL not found in search results",
                    "filings": [],
                    "company": company_name,
                })

            filing_resp = await client.get(f"https://www.sec.gov{filing_url}")
            filing_resp.raise_for_status()
            content = filing_resp.text[:100_000]

        return _content({
            "filing_type": "10-K",
            "company": company_name,
            "content": content,
            "source_url": f"https://www.sec.gov{filing_url}",
            "filing_date": filing_source.get("file_date", "unknown"),
        })

    except httpx.HTTPError as e:
        return _content({
            "error": f"SEC EDGAR request failed: {e}",
            "filings": [],
            "company": company_name,
        })


def _content(payload: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload)}]}
