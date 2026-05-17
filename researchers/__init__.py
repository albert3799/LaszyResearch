"""LaszyResearch agent definitions.

Each agent runs in its own context (separate Runner.run call) and returns
a typed Pydantic object — the OpenAI Agents SDK enforces output schemas
natively via `output_type=`, so we get validation for free.

This package's __init__ wires the SDK to your Azure OpenAI Foundry
deployment. It runs once on first import — pipeline.py is responsible
for calling `load_dotenv()` first so the env vars are available here.
"""

from __future__ import annotations

import os

from agents import set_default_openai_api, set_default_openai_client, set_tracing_disabled
from openai import AsyncOpenAI


def _resolve_azure_base_url() -> str:
    """Pick the Azure base URL from whatever env vars are populated.

    Accepts either the clean `AZURE_OPENAI_ENDPOINT` (already at /openai/v1)
    or the Foundry-style `AZURE_FOUNDRY_ENDPOINT` (project base, no /openai/v1
    suffix). The OpenAI SDK appends the /responses or /chat/completions
    suffix itself, so we just need to land at the v1 root.
    """
    explicit = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    if explicit and explicit.endswith("/openai/v1"):
        return explicit

    foundry = os.environ.get("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/")
    if foundry:
        if not foundry.endswith("/openai/v1"):
            foundry = f"{foundry}/openai/v1"
        return foundry

    raise RuntimeError(
        "No Azure endpoint configured. Set either AZURE_OPENAI_ENDPOINT "
        "(ending in /openai/v1) or AZURE_FOUNDRY_ENDPOINT (project base) in .env."
    )


def _resolve_azure_api_key() -> str:
    """Pick the API key — prefer the explicit name, fall back to Foundry's."""
    for var in ("AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY", "AZURE_OPENAIGPT5_API_KEY"):
        value = os.environ.get(var)
        if value:
            return value
    raise RuntimeError(
        "No Azure API key found. Set AZURE_OPENAI_API_KEY (or AZURE_FOUNDRY_API_KEY) in .env."
    )


def _configure_azure_openai() -> None:
    base_url = _resolve_azure_base_url()
    api_key = _resolve_azure_api_key()

    client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    set_default_openai_client(client)
    set_default_openai_api("responses")

    # Tracing would otherwise post telemetry to openai.com — disable it.
    # The Azure-issued key isn't valid for that endpoint anyway.
    set_tracing_disabled(True)


_configure_azure_openai()


# Model deployment names — these are the names YOU gave the deployments in
# Foundry, not the underlying model family. Configurable via env so they
# don't need to be edited in code per-tenant.
REASONING_MODEL = os.environ.get("REASONING_MODEL_DEPLOYMENT", "gpt-5")
EXTRACTION_MODEL = os.environ.get("EXTRACTION_MODEL_DEPLOYMENT", "gpt-5")
