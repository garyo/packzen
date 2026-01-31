#!/usr/bin/env python3
"""
Cross-reference Clerk users with D1 database users.

Shows all users from both sources and flags mismatches:
  - DB users with no corresponding Clerk account (orphaned data)
  - Clerk users with no DB data (unused accounts)

Requires:
  - .env.production.local with CLERK_SECRET_KEY
  - wrangler CLI authenticated for remote D1 access

Usage:
    uv run scripts/admin-user-audit.py
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_NAME = os.environ.get("DB_NAME", "packzen-db")


def load_env() -> None:
    """Load .env.production.local into os.environ."""
    env_file = PROJECT_ROOT / ".env.production.local"
    if not env_file.exists():
        print(f"Error: {env_file} not found", file=sys.stderr)
        sys.exit(1)
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        # Strip surrounding quotes
        value = value.strip().strip("'\"")
        os.environ[key.strip()] = value


def find_wrangler() -> str:
    wrangler_bin = os.environ.get("WRANGLER_BIN")
    if wrangler_bin:
        return wrangler_bin
    local = PROJECT_ROOT / "node_modules" / ".bin" / "wrangler"
    if local.exists():
        return str(local)
    return "wrangler"


# ── Clerk API ───────────────────────────────────────────────────────────────

def fetch_clerk_users() -> list[dict]:
    """Fetch all users from Clerk API."""
    import urllib.request

    api_key = os.environ.get("CLERK_SECRET_KEY", "")
    if not api_key:
        print("Error: CLERK_SECRET_KEY not set", file=sys.stderr)
        sys.exit(1)

    users: list[dict] = []
    page = 1
    page_size = 100

    while True:
        url = f"https://api.clerk.com/v1/users?limit={page_size}&page={page}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "packzen-admin/1.0",
        })
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())

        # Clerk returns a bare array
        batch = data if isinstance(data, list) else data.get("data", [])
        if not batch:
            break

        for u in batch:
            email = ""
            if u.get("email_addresses"):
                email = u["email_addresses"][0].get("email_address", "")
            created_ts = u.get("created_at", 0)
            created_dt = datetime.fromtimestamp(created_ts / 1000, tz=timezone.utc)
            users.append({
                "id": u["id"],
                "email": email,
                "created_at": created_dt.strftime("%Y-%m-%d %H:%M:%S"),
            })

        if len(batch) < page_size:
            break
        page += 1

    return users


# ── D1 Database ─────────────────────────────────────────────────────────────

def query_d1(sql: str) -> list[dict]:
    """Run a SQL query against the remote D1 database via wrangler."""
    wrangler = find_wrangler()
    result = subprocess.run(
        [wrangler, "d1", "execute", DB_NAME, "--remote", "--json", "--command", sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"wrangler error:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(result.stdout)
    if isinstance(data, list) and data:
        return data[0].get("results", [])
    return []


def fetch_db_users() -> list[dict]:
    """Get all distinct clerk_user_ids from the database with row counts."""
    rows = query_d1("""
        SELECT
            clerk_user_id,
            (SELECT COUNT(*) FROM trips        WHERE trips.clerk_user_id = u.clerk_user_id) AS trip_count,
            (SELECT COUNT(*) FROM master_items  WHERE master_items.clerk_user_id = u.clerk_user_id) AS master_item_count,
            (SELECT COUNT(*) FROM categories    WHERE categories.clerk_user_id = u.clerk_user_id) AS category_count,
            (SELECT COUNT(*) FROM bag_templates WHERE bag_templates.clerk_user_id = u.clerk_user_id) AS bag_template_count
        FROM (
            SELECT DISTINCT clerk_user_id FROM trips
            UNION
            SELECT DISTINCT clerk_user_id FROM master_items
            UNION
            SELECT DISTINCT clerk_user_id FROM categories
            UNION
            SELECT DISTINCT clerk_user_id FROM bag_templates
        ) u
        ORDER BY clerk_user_id;
    """)
    return rows


# ── Report ──────────────────────────────────────────────────────────────────

def main() -> None:
    load_env()

    print("Fetching Clerk users...")
    clerk_users = fetch_clerk_users()
    clerk_by_id = {u["id"]: u for u in clerk_users}

    print("Querying D1 database...")
    db_users = fetch_db_users()
    db_ids = {row["clerk_user_id"] for row in db_users}

    all_ids = sorted(set(clerk_by_id.keys()) | db_ids)

    # Print combined report
    print()
    print(f"{'USER_ID':<36} {'EMAIL':<35} {'TRIPS':>5} {'ITEMS':>5} {'CATS':>4} {'TMPL':>4}  STATUS")
    print(f"{'-'*36} {'-'*35} {'-'*5} {'-'*5} {'-'*4} {'-'*4}  {'-'*20}")

    orphaned_db = []
    unused_clerk = []

    for uid in all_ids:
        clerk = clerk_by_id.get(uid)
        db_row = next((r for r in db_users if r["clerk_user_id"] == uid), None)

        email = clerk["email"] if clerk else ""
        trips = db_row["trip_count"] if db_row else 0
        items = db_row["master_item_count"] if db_row else 0
        cats = db_row["category_count"] if db_row else 0
        tmpls = db_row["bag_template_count"] if db_row else 0

        if clerk and db_row:
            status = "ok"
        elif clerk and not db_row:
            status = "NO DB DATA"
            unused_clerk.append(uid)
        else:
            status = "** ORPHANED DB DATA **"
            orphaned_db.append(uid)

        print(f"{uid:<36} {email:<35} {trips:>5} {items:>5} {cats:>4} {tmpls:>4}  {status}")

    # Summary
    print()
    print(f"Clerk users:  {len(clerk_users)}")
    print(f"DB users:     {len(db_users)}")

    if orphaned_db:
        print(f"\nOrphaned DB users (no Clerk account): {len(orphaned_db)}")
        for uid in orphaned_db:
            row = next(r for r in db_users if r["clerk_user_id"] == uid)
            print(f"  {uid}  ({row['trip_count']} trips, {row['master_item_count']} items)")
    else:
        print("\nNo orphaned DB data found -- all DB users have Clerk accounts.")

    if unused_clerk:
        print(f"\nClerk users with no DB data: {len(unused_clerk)}")
        for uid in unused_clerk:
            print(f"  {uid}  ({clerk_by_id[uid]['email']})")


if __name__ == "__main__":
    main()
