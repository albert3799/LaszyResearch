"""Thin wrapper around Runner.run() for timing logging.

Each agent file builds its own Agent(...) and calls run_agent(). The
SDK enforces output_type at the Pydantic level, so there's no JSON
parsing or fallback logic to do here — we just clock execution time.
"""

from __future__ import annotations

import sys
import time
from typing import Any

from agents import Agent, Runner


async def run_agent(agent: Agent, prompt: str, *, agent_name: str) -> Any:
    """Run an agent and return its typed final output.

    `result.final_output` is already a validated instance of the agent's
    output_type Pydantic model — return it as-is.
    """
    started = time.monotonic()
    result = await Runner.run(agent, prompt)
    elapsed = time.monotonic() - started
    print(f"  [{agent_name}] {elapsed:.1f}s", file=sys.stderr)
    return result.final_output
