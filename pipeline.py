"""ZipBDR Research Pipeline — Main Entry Point.

Run with: python pipeline.py
Processes accounts from accounts.json one at a time through the full research pipeline.
"""

import asyncio
import json
import sys
from pathlib import Path
from orchestrator import process_account


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
            print(f"  → Score: {result['score']}/10 ({result['confidence']})")
            results.append(result)
        except Exception as e:
            print(f"  → FAILED: {e}")
            failures.append({"account": account["name"], "error": str(e)})
            continue

    # Summary
    print(f"\n{'='*60}")
    print(f"  COMPLETE: {len(results)} scored, {len(failures)} failed")
    if results:
        avg_score = sum(r["score"] for r in results) / len(results)
        print(f"  Average score: {avg_score:.1f}/10")
        top = sorted(results, key=lambda r: r["score"], reverse=True)[:5]
        print(f"  Top accounts:")
        for r in top:
            print(f"    • {r['company']} — {r['score']}/10")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(main())
