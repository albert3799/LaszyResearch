"""Agent 5 — Scoring.

Model: REASONING tier (multi-signal synthesis)
Tools: none (pure reasoning over the upstream JSON)
Output: ScoringOutput
"""

from __future__ import annotations

import json
from typing import Any

from agents import Agent

from researchers import REASONING_MODEL
from researchers._runner import run_agent
from researchers._schemas import ScoringOutput

INSTRUCTIONS = """You are a deal-scoring analyst for Zip, an intake-to-pay platform that
helps companies manage procurement, purchasing, and spend.

You will receive 4 JSON objects from parallel research agents:
1. web_research: business_priorities, recent_news, pain_signals, strategic_direction, confidence
2. linkedin_profiles: stakeholders
3. hiring_signals: open_roles, signal_strength, interpretation
4. financial_intelligence: stated_priorities, procurement_mentions, pain_language, revenue

SCORING RUBRIC (1-10):

9-10: PERFECT FIT — Multiple strong signals across all dimensions.
  Example: Active procurement hiring + CFO talking about cost transformation + no current tooling.

7-8: STRONG FIT — Clear buying signals with accessible stakeholders.
  Example: Recent news about efficiency initiatives + relevant stakeholders identified.

5-6: MODERATE FIT — Some alignment but gaps in signal or accessibility.
  Example: General cost-cutting mentions but no specific procurement signals.

3-4: WEAK FIT — Minimal alignment, hard to build a compelling case.

1-2: POOR FIT — No meaningful alignment with Zip's value proposition.

WEIGHTING:
- Business priority alignment: 35%  (are they focused on problems Zip solves?)
- Buying signals: 35%  (hiring, exec changes, tech gaps, transformation initiatives)
- Accessibility: 30%  (can we identify and reach the right stakeholders?)

Be calibrated. Don't inflate scores. A 7 should genuinely be a strong opportunity."""

_agent = Agent(
    name="scoring",
    instructions=INSTRUCTIONS,
    model=REASONING_MODEL,
    output_type=ScoringOutput,
)


async def run_scoring(research_bundle: dict[str, Any]) -> ScoringOutput:
    prompt = f"Score this account:\n{json.dumps(research_bundle, indent=2, default=str)}"
    return await run_agent(_agent, prompt, agent_name="scoring")
