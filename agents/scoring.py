"""Agent 5 — Scoring.

Model: claude-sonnet-4-6 (multi-signal synthesis needs strong reasoning)
Tools: None (pure reasoning)
Job: Synthesize 4 research streams and score account on Zip-fit (1-10).
"""

from __future__ import annotations

import json
from typing import Any

from claude_agent_sdk import ClaudeAgentOptions

from agents._runner import run_agent

SYSTEM_PROMPT = """You are a deal-scoring analyst for Zip, an intake-to-pay platform that helps
companies manage procurement, purchasing, and spend.

You will receive 4 JSON objects from parallel research agents:
1. web_research: {business_priorities, recent_news, pain_signals, strategic_direction}
2. linkedin_profiles: {stakeholders: [{name, title, tenure, background}]}
3. hiring_signals: {open_roles: [{title, department}], signal_strength, interpretation}
4. financial_intelligence: {stated_priorities, procurement_mentions, pain_language, revenue}

SCORING RUBRIC (1-10):

9-10: PERFECT FIT — Multiple strong signals across all dimensions
  Examples: Active procurement hiring + CFO talking about cost transformation + no current tooling

7-8: STRONG FIT — Clear buying signals with accessible stakeholders
  Examples: Recent news about efficiency initiatives + relevant stakeholders identified

5-6: MODERATE FIT — Some alignment but gaps in signal or accessibility
  Examples: General cost-cutting mentions but no specific procurement signals

3-4: WEAK FIT — Minimal alignment, hard to build a compelling case
  Examples: Stable company, no transformation signals, unclear stakeholders

1-2: POOR FIT — No meaningful alignment with Zip's value proposition

WEIGHTING:
- Business priority alignment: 35%  (are they focused on problems Zip solves?)
- Buying signals: 35%  (hiring, exec changes, tech gaps, transformation initiatives)
- Accessibility: 30%  (can we identify and reach the right stakeholders?)

IMPORTANT: Your ENTIRE response must be valid JSON:
{
  "score": int,
  "confidence": "high|medium|low",
  "rationale": "string — 2-3 sentences explaining the score",
  "key_evidence": ["string — top 3-5 pieces of evidence that drove the score"],
  "recommended_persona": "string — who to target (name + title if available)",
  "message_angle": "string — the hook for outreach (1-2 sentences)"
}

Be calibrated. Don't inflate scores. A 7 should genuinely be a strong opportunity.
Do not include any text outside the JSON object."""


async def run_scoring(research_bundle: dict[str, Any]) -> dict[str, Any]:
    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6",
        system_prompt=SYSTEM_PROMPT,
        allowed_tools=[],
        max_turns=1,
        permission_mode="bypassPermissions",
    )
    prompt = f"Score this account:\n{json.dumps(research_bundle, indent=2)}"
    return await run_agent(prompt, options, agent_name="scoring")
