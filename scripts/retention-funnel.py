#!/usr/bin/env python3
"""
Retention / activation FUNNEL report for PackZen.

Cross-references Clerk signups with D1 (SQLite on Cloudflare) app data to answer:
  - How far do new users get in the activation funnel?
  - Which signup cohorts stick?
  - How many signups are likely junk (bots / bursts / zero activity)?
  - Where do people drop off, and how long is a first session?

Read-only. Reuses the env-loading, Clerk-fetch, and query_d1 plumbing from
scripts/admin-user-audit.py.

Requires:
  - .env.production.local with CLERK_SECRET_KEY
  - wrangler CLI authenticated for remote D1 access

Usage:
    uv run scripts/retention-funnel.py

Notes on timestamps:
  - trips/trip_items/etc. created_at are Drizzle `mode: 'timestamp'` = Unix SECONDS.
  - change_log.created_at is Unix SECONDS (Math.floor(Date.now()/1000)).
  - change_log rows older than ~24h are pruned by sync.ts, so session/day analysis
    from the change log only reflects a rolling recent window, not full history.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

# ── Config ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_NAME = os.environ.get("DB_NAME", "packzen-db")

OWNER_EMAILS: frozenset[str] = frozenset({
    "garyo@oberbrunner.com",
    "garyo+pz@oberbrunner.com",
    "garyo@darkstarsystems.com",
})

# A signup day with at least this many signups is flagged as a possible burst.
BURST_THRESHOLD = 5


# ── Env / plumbing (mirrors admin-user-audit.py) ──────────────────────────────

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


# ── Clerk API (mirrors admin-user-audit.py) ───────────────────────────────────

def fetch_clerk_users() -> list[dict]:
    """Fetch all users from Clerk API with id/email/created_at/last_sign_in_at."""
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

        batch = data if isinstance(data, list) else data.get("data", [])
        if not batch:
            break

        for u in batch:
            email = ""
            if u.get("email_addresses"):
                email = u["email_addresses"][0].get("email_address", "")
            created_ts = u.get("created_at", 0)  # ms epoch
            created_dt = datetime.fromtimestamp(created_ts / 1000, tz=timezone.utc)
            last_ts = u.get("last_sign_in_at")  # ms epoch or None
            last_dt = (
                datetime.fromtimestamp(last_ts / 1000, tz=timezone.utc)
                if last_ts else None
            )
            users.append({
                "id": u["id"],
                "email": email.lower(),
                "created_dt": created_dt,
                "last_sign_in_dt": last_dt,
            })

        if len(batch) < page_size:
            break
        page += 1

    return users


# ── D1 aggregate pulls (small number of queries) ──────────────────────────────

def fetch_user_counts() -> dict[str, dict[str, int]]:
    """Per-user row counts across the main tables, keyed by clerk_user_id.

    trip_items has no clerk_user_id, so item/packed counts join through trips.
    """
    rows = query_d1("""
        SELECT
            u.clerk_user_id AS clerk_user_id,
            (SELECT COUNT(*) FROM trips t
                WHERE t.clerk_user_id = u.clerk_user_id) AS trip_count,
            (SELECT COUNT(*) FROM trip_items ti
                JOIN trips t ON ti.trip_id = t.id
                WHERE t.clerk_user_id = u.clerk_user_id) AS item_count,
            (SELECT COUNT(*) FROM trip_items ti
                JOIN trips t ON ti.trip_id = t.id
                WHERE t.clerk_user_id = u.clerk_user_id AND ti.is_packed = 1) AS packed_count,
            (SELECT COUNT(*) FROM master_items m
                WHERE m.clerk_user_id = u.clerk_user_id) AS master_item_count,
            (SELECT COUNT(*) FROM categories c
                WHERE c.clerk_user_id = u.clerk_user_id) AS category_count,
            (SELECT COUNT(*) FROM bag_templates b
                WHERE b.clerk_user_id = u.clerk_user_id) AS bag_template_count
        FROM (
            SELECT DISTINCT clerk_user_id FROM trips
            UNION SELECT DISTINCT clerk_user_id FROM master_items
            UNION SELECT DISTINCT clerk_user_id FROM categories
            UNION SELECT DISTINCT clerk_user_id FROM bag_templates
        ) u;
    """)
    counts: dict[str, dict[str, int]] = {}
    for r in rows:
        counts[r["clerk_user_id"]] = {
            "trips": int(r["trip_count"]),
            "items": int(r["item_count"]),
            "packed": int(r["packed_count"]),
            "master_items": int(r["master_item_count"]),
            "categories": int(r["category_count"]),
            "bag_templates": int(r["bag_template_count"]),
        }
    return counts


def fetch_change_log() -> list[dict]:
    """All change_log rows (clerk_user_id, entity_type, action, created_at)."""
    return query_d1("""
        SELECT clerk_user_id, entity_type, action, created_at
        FROM change_log
        ORDER BY clerk_user_id, created_at;
    """)


# ── Helpers ───────────────────────────────────────────────────────────────────

def to_epoch_seconds(value: int | float | str) -> int:
    """change_log timestamps are Unix seconds; guard against stray ms values."""
    n = int(float(value))
    if n > 1_000_000_000_000:  # looks like milliseconds
        n //= 1000
    return n


def pct(n: int, d: int) -> str:
    return f"{(100.0 * n / d):5.1f}%" if d else "  n/a"


def day_str(epoch_s: int) -> str:
    return datetime.fromtimestamp(epoch_s, tz=timezone.utc).strftime("%Y-%m-%d")


# ── Change-log analysis ───────────────────────────────────────────────────────

def analyze_change_log(rows: list[dict]) -> dict[str, dict]:
    """Per-user: distinct active days, event count, first-day session span,
    and last recorded (entity_type, action)."""
    by_user: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
    for r in rows:
        ts = to_epoch_seconds(r["created_at"])
        by_user[r["clerk_user_id"]].append(
            (ts, r.get("entity_type") or "?", r.get("action") or "?")
        )

    result: dict[str, dict] = {}
    for uid, events in by_user.items():
        events.sort()
        days = {day_str(ts) for ts, _, _ in events}
        first_day = day_str(events[0][0])
        first_day_ts = [ts for ts, _, _ in events if day_str(ts) == first_day]
        first_session_secs = max(first_day_ts) - min(first_day_ts)
        last_ts, last_entity, last_action = events[-1]
        result[uid] = {
            "distinct_days": len(days),
            "events": len(events),
            "first_session_secs": first_session_secs,
            "last_entity": last_entity,
            "last_action": last_action,
            "last_ts": last_ts,
        }
    return result


# ── Funnel ────────────────────────────────────────────────────────────────────

def classify(
    user: dict,
    counts: dict[str, dict[str, int]],
    cl: dict[str, dict],
) -> dict:
    """Compute per-signup funnel flags."""
    uid = user["id"]
    c = counts.get(uid, {})
    trips = c.get("trips", 0)
    items = c.get("items", 0)
    packed = c.get("packed", 0)
    has_any_db = bool(c) and any(v > 0 for v in c.values())
    cl_days = cl.get(uid, {}).get("distinct_days", 0)

    # Returned = came back on a 2nd distinct active day (from change_log),
    # or signed in again after the signup day.
    returned_signin = False
    if user["last_sign_in_dt"] is not None:
        returned_signin = (
            user["last_sign_in_dt"].date() > user["created_dt"].date()
        )
    returned = cl_days >= 2 or returned_signin

    return {
        "uid": uid,
        "email": user["email"],
        "created_dt": user["created_dt"],
        "has_trip": trips >= 1,
        "has_item": items >= 1,
        "has_packed": packed >= 1,
        "has_any_db": has_any_db,
        "returned": returned,
        "has_cl": uid in cl,
    }


def print_funnel(label: str, rows: list[dict]) -> None:
    n = len(rows)
    if n == 0:
        print(f"\n{label}: (no signups)")
        return

    step_trip = [r for r in rows if r["has_trip"]]
    step_item = [r for r in step_trip if r["has_item"]]
    step_pack = [r for r in step_item if r["has_packed"]]
    step_ret = [r for r in step_pack if r["returned"]]

    steps = [
        ("Signed up", rows, n),
        ("Created >=1 trip", step_trip, n),
        ("Added >=1 trip item", step_item, len(step_trip)),
        ("Packed >=1 item", step_pack, len(step_item)),
        ("Returned (2+ days)", step_ret, len(step_pack)),
    ]

    print(f"\n{label}  (N = {n})")
    print(f"  {'STEP':<24} {'COUNT':>6} {'% SIGNUPS':>10} {'STEP CONV':>10}")
    print(f"  {'-'*24} {'-'*6} {'-'*10} {'-'*10}")
    for name, group, prev in steps:
        print(f"  {name:<24} {len(group):>6} {pct(len(group), n):>10} {pct(len(group), prev):>10}")


# ── Report ────────────────────────────────────────────────────────────────────

def main() -> None:
    load_env()

    print("Fetching Clerk users...")
    clerk_users = fetch_clerk_users()
    print("Querying D1 (per-user counts)...")
    counts = fetch_user_counts()
    print("Querying D1 (change_log)...")
    cl_rows = fetch_change_log()
    cl = analyze_change_log(cl_rows)

    # External signups only (exclude owner/test accounts).
    external = [u for u in clerk_users if u["email"] not in OWNER_EMAILS]
    owners = [u for u in clerk_users if u["email"] in OWNER_EMAILS]

    classified = [classify(u, counts, cl) for u in external]

    print("\n" + "=" * 74)
    print("PACKZEN RETENTION / ACTIVATION FUNNEL")
    print("=" * 74)
    print(f"Clerk users total:      {len(clerk_users)}")
    print(f"Owner/test accounts:    {len(owners)} (excluded)")
    print(f"External signups:       {len(external)}")
    print(f"change_log rows pulled:  {len(cl_rows)} "
          "(note: rows >~24h old are pruned by sync.ts)")

    # 1. Overall funnel (polluted).
    print("\n" + "-" * 74)
    print("1. OVERALL FUNNEL (all external signups)")
    print("-" * 74)
    print_funnel("All external signups", classified)

    # 2. Cohort by signup month.
    print("\n" + "-" * 74)
    print("2. COHORT BY SIGNUP MONTH")
    print("-" * 74)
    by_month: dict[str, list[dict]] = defaultdict(list)
    for r in classified:
        by_month[r["created_dt"].strftime("%Y-%m")].append(r)
    print(f"  {'MONTH':<9} {'SIGNUPS':>7} {'ACTIVATED':>10} {'RETURNED':>9}  {'ACT%':>6} {'RET%':>6}")
    print(f"  {'-'*9} {'-'*7} {'-'*10} {'-'*9}  {'-'*6} {'-'*6}")
    for month in sorted(by_month):
        grp = by_month[month]
        signups = len(grp)
        activated = sum(1 for r in grp if r["has_item"])
        returned = sum(1 for r in grp if r["returned"])
        print(f"  {month:<9} {signups:>7} {activated:>10} {returned:>9}  "
              f"{pct(activated, signups):>6} {pct(returned, signups):>6}")

    # 3. Likely-junk vs real.
    print("\n" + "-" * 74)
    print("3. LIKELY-JUNK vs REAL")
    print("-" * 74)
    zero_db = [r for r in classified if not r["has_any_db"] and not r["has_cl"]]
    # Burst detection: signup days with many signups.
    by_day: dict[str, list[dict]] = defaultdict(list)
    for r in classified:
        by_day[r["created_dt"].strftime("%Y-%m-%d")].append(r)
    burst_days = {d: g for d, g in by_day.items() if len(g) >= BURST_THRESHOLD}

    # Likely junk = zero DB data AND never activated (subset above already has no db/cl).
    junk_ids = {r["uid"] for r in zero_db}
    real = [r for r in classified if r["uid"] not in junk_ids]

    print(f"  Zero-DB-data accounts (no trips/items/master/cats/bags, no change_log): "
          f"{len(zero_db)}")
    print(f"  Likely-junk signups:    {len(junk_ids)}")
    print(f"  Plausibly-real signups: {len(real)}")
    if burst_days:
        print(f"\n  Signup bursts (days with >= {BURST_THRESHOLD} signups):")
        print(f"    {'DAY':<12} {'SIGNUPS':>7} {'ZERO-DB':>8} {'ACTIVATED':>10}")
        for d in sorted(burst_days):
            g = burst_days[d]
            zd = sum(1 for r in g if not r["has_any_db"] and not r["has_cl"])
            act = sum(1 for r in g if r["has_item"])
            print(f"    {d:<12} {len(g):>7} {zd:>8} {act:>10}")
    else:
        print(f"\n  No signup-day bursts (>= {BURST_THRESHOLD}) detected.")

    print("\n  --- CLEANED FUNNEL (plausibly-real signups only) ---")
    print_funnel("Plausibly-real signups", real)

    # 4. Session analysis from change_log (real users).
    print("\n" + "-" * 74)
    print("4. SESSION ANALYSIS (change_log; recent ~24h window per user)")
    print("-" * 74)
    real_ids = {r["uid"] for r in real}
    real_cl = {uid: v for uid, v in cl.items() if uid in real_ids}
    if real_cl:
        days_list = [v["distinct_days"] for v in real_cl.values()]
        events_list = [v["events"] for v in real_cl.values()]
        sess_list = [v["first_session_secs"] for v in real_cl.values()]
        print(f"  Real users with change_log activity: {len(real_cl)}")
        print(f"  Distinct active days   -- median {median(days_list):.1f}, "
              f"max {max(days_list)}")
        print(f"  Events per user        -- median {median(events_list):.1f}, "
              f"max {max(events_list)}")
        sess_min = [s / 60.0 for s in sess_list]
        print(f"  First-session duration -- median {median(sess_min):.1f} min, "
              f"max {max(sess_min):.1f} min")
        # Distribution of first-session duration buckets.
        buckets = {"0 (single event)": 0, "<1 min": 0, "1-5 min": 0,
                   "5-30 min": 0, ">30 min": 0}
        for s in sess_list:
            if s == 0:
                buckets["0 (single event)"] += 1
            elif s < 60:
                buckets["<1 min"] += 1
            elif s < 300:
                buckets["1-5 min"] += 1
            elif s < 1800:
                buckets["5-30 min"] += 1
            else:
                buckets[">30 min"] += 1
        print("  First-session distribution:")
        for k, v in buckets.items():
            print(f"    {k:<18} {v:>4}")
    else:
        print("  No change_log activity for real users (log likely pruned).")

    # Drop-off: last recorded action for users who created a trip but no item,
    # and for zero-activity users.
    print("\n  DROP-OFF (last recorded change_log action before quitting):")
    trip_no_item = [r for r in real if r["has_trip"] and not r["has_item"]]
    zero_activity = [r for r in real if not r["has_trip"]]

    def last_action_hist(group: list[dict]) -> dict[str, int]:
        hist: dict[str, int] = defaultdict(int)
        for r in group:
            v = cl.get(r["uid"])
            key = f"{v['last_entity']}/{v['last_action']}" if v else "(no change_log)"
            hist[key] += 1
        return hist

    print(f"\n  Users who created a trip but never added an item: {len(trip_no_item)}")
    for k, v in sorted(last_action_hist(trip_no_item).items(), key=lambda x: -x[1]):
        print(f"    {k:<28} {v:>4}")
    print(f"\n  Users with no trip at all (near-zero activity): {len(zero_activity)}")
    for k, v in sorted(last_action_hist(zero_activity).items(), key=lambda x: -x[1]):
        print(f"    {k:<28} {v:>4}")

    print("\n" + "=" * 74)
    print("Done.")


if __name__ == "__main__":
    main()
