"""ZipBDR Research Pipeline — Main Entry Point.

Run with: python pipeline.py
Processes accounts from accounts.json one at a time through the full research pipeline.
"""

import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # populate os.environ from .env before researchers/tools import

from orchestrator import process_account  # noqa: E402


async def main():
    """Process all accounts — one at a time."""
    accounts_file = Path("accounts.json")

    if not accounts_file.exists():
        print("ERROR: accounts.json not found. Create it with your account list.")
        print('Format: [{"name": "Acme Corp", "domain": "acmecorp.com", "ticker": "ACME"}]')
        sys.exit(1)

    with open(accounts_file) as f:
        accounts = json.load(f)

    print(f"\n{'='*60}")
    print(f"  LaszyResearch Pipeline — Processing {len(accounts)} accounts")
    print(f"{'='*60}\n")

    results = []
    failures = []

    for i, account in enumerate(accounts):
        print(f"[{i+1}/{len(accounts)}] Processing: {account['name']} ({account['domain']})")
        try:
            result = await process_account(account)
            score = result.get("score")
            if score is None:
                print(f"  → Scoring agent returned no score: {result.get('error', 'unknown')}")
                failures.append({"account": account["name"], "error": "no score returned"})
                continue
            print(f"  → Score: {score}/10 ({result.get('confidence', 'unknown')})")
            results.append(result)
        except Exception as e:
            print(f"  → FAILED: {e}")
            failures.append({"account": account["name"], "error": str(e)})
            continue

    # Summary
    print(f"\n{'='*60}")
    print(f"  COMPLETE: {len(results)} scored, {len(failures)} failed")
    if results:
        scored = [r for r in results if isinstance(r.get("score"), (int, float))]
        if scored:
            avg_score = sum(r["score"] for r in scored) / len(scored)
            print(f"  Average score: {avg_score:.1f}/10")
            top = sorted(scored, key=lambda r: r["score"], reverse=True)[:5]
            print(f"  Top accounts:")
            for r in top:
                print(f"    • {r['company']} — {r['score']}/10")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(main())
