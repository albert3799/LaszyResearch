"""Pydantic output schemas — one per agent.

The OpenAI Agents SDK validates each agent's final response against
`output_type=<Schema>`, so we never have to parse JSON manually. If the
model returns something that doesn't match, the SDK retries or raises.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]


# ─────────────────────────────────────────────────────────────
# Web research
# ─────────────────────────────────────────────────────────────
class NewsItem(BaseModel):
    headline: str
    date: str = Field(description="YYYY-MM (best effort)")
    relevance: str = Field(description="Why this matters for a procurement/spend pitch")


class WebResearchOutput(BaseModel):
    business_priorities: list[str]
    recent_news: list[NewsItem]
    pain_signals: list[str]
    strategic_direction: str
    confidence: Confidence


# ─────────────────────────────────────────────────────────────
# LinkedIn
# ─────────────────────────────────────────────────────────────
class Stakeholder(BaseModel):
    name: str
    title: str
    tenure: str = Field(description="How long in this role, e.g. '2 years'")
    background: str = Field(description="1-2 sentences on relevant experience")


class LinkedInOutput(BaseModel):
    stakeholders: list[Stakeholder]


# ─────────────────────────────────────────────────────────────
# Hiring signals
# ─────────────────────────────────────────────────────────────
class OpenRole(BaseModel):
    title: str
    department: str


class HiringOutput(BaseModel):
    open_roles: list[OpenRole]
    signal_strength: Literal["strong", "moderate", "weak"]
    interpretation: str = Field(description="1-2 sentences on what the pattern means")


# ─────────────────────────────────────────────────────────────
# Financial intelligence
# ─────────────────────────────────────────────────────────────
class FinancialsOutput(BaseModel):
    stated_priorities: list[str]
    procurement_mentions: list[str] = Field(description="Exact quotes from filings")
    pain_language: list[str] = Field(description="Exact quotes — manual processes, gaps, etc.")
    tech_investment_plans: list[str]
    revenue: str = Field(description="e.g. '$2.1B'")
    employee_count: str = Field(description="e.g. '~8,000'")
    source_documents: list[str]


# ─────────────────────────────────────────────────────────────
# Scoring (the synthesis step)
# ─────────────────────────────────────────────────────────────
class ScoringOutput(BaseModel):
    score: int = Field(ge=1, le=10)
    confidence: Confidence
    rationale: str = Field(description="2-3 sentences explaining the score")
    key_evidence: list[str] = Field(description="Top 3-5 pieces of evidence")
    recommended_persona: str = Field(description="Who to target — name + title if available")
    message_angle: str = Field(description="The hook for outreach (1-2 sentences)")


# ─────────────────────────────────────────────────────────────
# Output / persist
# ─────────────────────────────────────────────────────────────
class OutputResult(BaseModel):
    status: Literal["persisted", "error"]
    id: str | None = None
    message: str | None = None
