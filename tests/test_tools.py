"""Basic tool tests — verify each tool handles missing API keys gracefully."""

import os
import pytest


def test_theirstack_missing_key():
    """TheirStack tool should return error dict when API key is missing."""
    # Temporarily unset the key
    original = os.environ.pop("THEIRSTACK_API_KEY", None)
    try:
        from tools.theirstack_tool import search_theirstack
        result = search_theirstack("example.com")
        assert "error" in result
    finally:
        if original:
            os.environ["THEIRSTACK_API_KEY"] = original


def test_apify_missing_key():
    """Apify tool should return error dict when token is missing."""
    original = os.environ.pop("APIFY_TOKEN", None)
    try:
        from tools.apify_tool import scrape_linkedin_profile
        result = scrape_linkedin_profile("https://linkedin.com/in/test")
        assert "error" in result
    finally:
        if original:
            os.environ["APIFY_TOKEN"] = original


def test_supabase_missing_config():
    """Supabase tool should raise when URL/key are missing."""
    original_url = os.environ.pop("SUPABASE_URL", None)
    original_key = os.environ.pop("SUPABASE_SERVICE_KEY", None)
    try:
        from tools.supabase_tool import persist_to_db
        result = persist_to_db({"company": "Test", "domain": "test.com"})
        assert result["status"] == "error"
    finally:
        if original_url:
            os.environ["SUPABASE_URL"] = original_url
        if original_key:
            os.environ["SUPABASE_SERVICE_KEY"] = original_key
