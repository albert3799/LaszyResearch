"""Agent 6 — Output / Persist.

Model: claude-haiku-4-5 (formatting + DB write — logic already done by scoring agent)
Tool: persist_to_db (Supabase client)
Job: Take scored account data and persist it to the database.
"""

from claude_agent_sdk import Agent
from tools.supabase_tool import persist_to_db

output_agent = Agent(
    name="output",
    model="claude-haiku-4-5",
    system="""You take scored account research data and persist it to the database.

You will receive a JSON object with the complete research output for one account,
including: company name, domain, score, confidence, rationale, key evidence,
recommended persona, message angle, and raw research data.

Your job:
1. Parse the input to extract the required fields
2. Call persist_to_db with the complete account data
3. Confirm the write was successful

Do not modify the data — persist it exactly as received.
If the write fails, report the error clearly.""",
    tools=[persist_to_db],
    max_turns=2,
)
