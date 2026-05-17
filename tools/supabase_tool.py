"""Supabase Database Persistence.

Writes scored account research to the account_research table.
Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.

`account_data` is dynamic in shape, so the function_tool is registered
with strict_mode=False (the OpenAI Agents SDK otherwise refuses a JSON
schema with `additionalProperties: true`).
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from agents import function_tool
from supabase import Client, create_client

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(url, key)
    return _client


async def _persist_to_db_impl(account_data: dict[str, Any]) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(_upsert, account_data)
    except Exception as e:
        return {"status": "error", "message": str(e)}


@function_tool(strict_mode=False)
async def persist_to_db(account_data: dict[str, Any]) -> dict[str, Any]:
    """Write a scored account-research record to Supabase.

    Upserts on account_id so re-running the pipeline updates the row
    rather than inserting a duplicate.

    Args:
        account_data: Dict with the keys: account_id (or id/domain), company,
            domain, score, confidence, rationale, key_evidence,
            recommended_persona, message_angle, raw_research.
    """
    return await _persist_to_db_impl(account_data)


def _upsert(account_data: dict[str, Any]) -> dict[str, Any]:
    client = _get_client()
    row = {
        "account_id": account_data.get("id") or account_data.get("domain"),
        "company_name": account_data.get("company") or account_data.get("company_name"),
        "company_domain": account_data.get("domain") or account_data.get("company_domain"),
        "score": account_data.get("score"),
        "confidence": account_data.get("confidence"),
        "rationale": account_data.get("rationale"),
        "key_evidence": account_data.get("key_evidence"),
        "recommended_persona": account_data.get("recommended_persona"),
        "message_angle": account_data.get("message_angle"),
        "raw_research": account_data.get("raw_research"),
        "status": "completed",
    }
    response = client.table("account_research").upsert(row, on_conflict="account_id").execute()
    if response.data:
        return {"status": "persisted", "id": response.data[0].get("id")}
    return {"status": "error", "message": "No data returned from upsert"}
