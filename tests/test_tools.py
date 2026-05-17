"""Tool sanity tests — verify each tool handles missing API keys gracefully.

The @tool decorator wraps the underlying function in an SdkMcpTool object,
so we call `.handler(args)` to invoke the raw async implementation. Tool
results follow the MCP content envelope shape:
    {"content": [{"type": "text", "text": "<json-string>"}]}
"""

from __future__ import annotations

import json
import os

import pytest


def _invoke(tool_obj):
    """Return the underlying async handler for an @tool-decorated symbol."""
    return getattr(tool_obj, "handler", tool_obj)


def _payload(result: dict) -> dict:
    """Extract the JSON payload from an MCP tool result envelope."""
    return json.loads(result["content"][0]["text"])


@pytest.mark.asyncio
async def test_theirstack_missing_key():
    original = os.environ.pop("THEIRSTACK_API_KEY", None)
    try:
        from tools.theirstack_tool import search_theirstack

        result = await _invoke(search_theirstack)({"company_domain": "example.com"})
        assert "error" in _payload(result)
    finally:
        if original:
            os.environ["THEIRSTACK_API_KEY"] = original


@pytest.mark.asyncio
async def test_apify_missing_key():
    original = os.environ.pop("APIFY_TOKEN", None)
    try:
        from tools.apify_tool import scrape_linkedin_profile

        result = await _invoke(scrape_linkedin_profile)(
            {"profile_url": "https://linkedin.com/in/test"}
        )
        assert "error" in _payload(result)
    finally:
        if original:
            os.environ["APIFY_TOKEN"] = original


@pytest.mark.asyncio
async def test_supabase_missing_config():
    original_url = os.environ.pop("SUPABASE_URL", None)
    original_key = os.environ.pop("SUPABASE_SERVICE_KEY", None)

    # Reset cached client so the missing-env error path runs.
    import tools.supabase_tool as st

    st._client = None
    try:
        from tools.supabase_tool import persist_to_db

        result = await _invoke(persist_to_db)(
            {"account_data": {"company": "Test", "domain": "test.com"}}
        )
        payload = _payload(result)
        assert payload["status"] == "error"
    finally:
        if original_url:
            os.environ["SUPABASE_URL"] = original_url
        if original_key:
            os.environ["SUPABASE_SERVICE_KEY"] = original_key
