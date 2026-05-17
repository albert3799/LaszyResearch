"""Supabase Database Persistence.

Writes scored account research to the account_research table.
Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.

The supabase-py v2 client is synchronous; we offload its blocking calls to a
worker thread so the tool stays async-friendly.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from claude_agent_sdk import tool
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


@tool(
    "persist_to_db",
    "Write a scored account-research record to the Supabase `account_research` table. Upserts on account_id so re-runs update rather than duplicate.",
    {"account_data": dict},
)
async def persist_to_db(args: dict[str, Any]) -> dict[str, Any]:
    account_data = args["account_data"]
    if isinstance(account_data, str):
        # Some models pass the payload as a JSON string; accept both.
        try:
            account_data = json.loads(account_data)
        except json.JSONDecodeError:
            return _content({"status": "error", "message": "account_data was a string but not valid JSON"})

    try:
        result = await asyncio.to_thread(_upsert, account_data)
        return _content(result)
    except Exception as e:
        return _content({"status": "error", "message": str(e)})


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


def _content(payload: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload)}]}
