"""Tool sanity tests — verify each tool's logic handles missing keys gracefully.

We test the `_<name>_impl` async functions directly. The @function_tool
wrappers around them go through the SDK's serialization layer, which
isn't useful to exercise in unit tests.
"""

from __future__ import annotations

import os

import pytest


@pytest.mark.asyncio
async def test_theirstack_missing_key():
    original = os.environ.pop("THEIRSTACK_API_KEY", None)
    try:
        from tools.theirstack_tool import _search_theirstack_impl

        result = await _search_theirstack_impl("example.com")
        assert "error" in result
    finally:
        if original:
            os.environ["THEIRSTACK_API_KEY"] = original


@pytest.mark.asyncio
async def test_apify_missing_key():
    original = os.environ.pop("APIFY_TOKEN", None)
    try:
        from tools.apify_tool import _scrape_linkedin_profile_impl

        result = await _scrape_linkedin_profile_impl("https://linkedin.com/in/test")
        assert "error" in result
    finally:
        if original:
            os.environ["APIFY_TOKEN"] = original


@pytest.mark.asyncio
async def test_supabase_missing_config():
    original_url = os.environ.pop("SUPABASE_URL", None)
    original_key = os.environ.pop("SUPABASE_SERVICE_KEY", None)

    import tools.supabase_tool as st

    st._client = None
    try:
        from tools.supabase_tool import _persist_to_db_impl

        result = await _persist_to_db_impl({"company": "Test", "domain": "test.com"})
        assert result["status"] == "error"
    finally:
        if original_url:
            os.environ["SUPABASE_URL"] = original_url
        if original_key:
            os.environ["SUPABASE_SERVICE_KEY"] = original_key
