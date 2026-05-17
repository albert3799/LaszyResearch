"""Supabase Database Persistence.

Writes scored account research to the account_research table.
Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
"""

import os
from supabase import create_client, Client
from claude_agent_sdk import tool

# Initialize Supabase client (lazy — only connects when first used)
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


@tool
def persist_to_db(account_data: dict) -> dict:
    """Write research results to Supabase.

    Args:
        account_data: Complete account object with score, research, and recommendations.
                      Expected fields: id/domain, company, domain, score, confidence,
                      rationale, key_evidence, recommended_persona, message_angle,
                      raw_research.

    Returns:
        Confirmation with the database row ID.
    """
    try:
        client = _get_client()

        row = {
            "account_id": account_data.get("id", account_data.get("domain")),
            "company_name": account_data.get("company", account_data.get("company_name")),
            "company_domain": account_data.get("domain", account_data.get("company_domain")),
            "score": account_data.get("score"),
            "confidence": account_data.get("confidence"),
            "rationale": account_data.get("rationale"),
            "key_evidence": account_data.get("key_evidence"),
            "recommended_persona": account_data.get("recommended_persona"),
            "message_angle": account_data.get("message_angle"),
            "raw_research": account_data.get("raw_research"),
            "status": "completed",
        }

        # Upsert — insert or update if account_id already exists
        result = client.table("account_research").upsert(row).execute()

        if result.data:
            return {"status": "persisted", "id": result.data[0]["id"]}
        else:
            return {"status": "error", "message": "No data returned from upsert"}

    except Exception as e:
        return {"status": "error", "message": str(e)}
