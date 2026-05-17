"""Shared runner for single-shot agent queries.

Each agent in this pipeline is a one-shot research task: build options, run
`query()`, collect the final assistant text, parse as JSON. This helper
centralises that pattern so every agent file stays focused on its prompt + model
+ tool wiring.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    query,
)


async def run_agent(prompt: str, options: ClaudeAgentOptions, *, agent_name: str) -> dict[str, Any]:
    """Run a single agent query and return its parsed JSON output.

    The SDK streams a sequence of messages. We keep only the last assistant
    text block (the model's final answer) and parse it as JSON. Cost info from
    the terminal ResultMessage is logged to stderr for observability.

    On any parsing failure we return a structured error dict rather than
    raising — callers downstream are expected to handle partial pipelines.
    """
    final_text = ""
    cost_usd: float | None = None

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    final_text = block.text
        elif isinstance(message, ResultMessage):
            cost_usd = getattr(message, "total_cost_usd", None)

    if cost_usd is not None:
        print(f"  [cost] {agent_name}: ${cost_usd:.4f}", file=sys.stderr)

    if not final_text:
        return {"error": f"{agent_name} returned no text"}

    return _parse_json(final_text, agent_name)


def _parse_json(text: str, agent_name: str) -> dict[str, Any]:
    """Parse JSON from a model response, tolerating prose wrapping."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fall back to extracting the first JSON object from the response.
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return {
            "error": f"{agent_name} did not return valid JSON",
            "raw_response": text[:2000],
        }
