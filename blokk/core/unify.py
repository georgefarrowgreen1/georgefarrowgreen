"""Collapse a four-workspace database into the one space there is now.

Blokk carried tenancy from line one: a `workspace` table with a row per
business, and a `workspace_id` on almost everything else. The reasoning was
that retrofitting tenancy is miserable, which is true. It was still the
wrong trade for a product that runs on one person's Mac: four queues to
check, four sweeps to wait for, four sets of sources to wire, and a picker
in the chat that had to be right before an answer could be. What the
businesses actually needed keeping out of was each other's mail, and that
is `credential.only` — per mailbox, per calendar — which has been doing the
job all along underneath the tenancy model.

Store's own migration is additive columns only, and says so: anything that
rewrites or drops "belongs in a script somebody runs deliberately, not
here". This is that script. `./blokk unify` runs it.

It builds a new file rather than rewriting the old one in place. Renaming
tables under live foreign keys is how a half-migrated database happens, and
a half-migrated database is worse than an un-migrated one — this way a
failure anywhere leaves the original exactly as it was.

Two of the merges throw information away and cannot be reversed by looking
at the result, so they are stated here and reported by name when they fire:

  trust — the key was (workspace, category) and is now (category), so four
    rows can land on one. The merge is the *most conservative* of them:
    clean takes the minimum, edited and rejected the maximum, auto only
    survives if every row had it, and one pinned row pins the lot. Summing
    the clean counts, or taking the best row, would hand a category autonomy
    on the strength of approvals somebody gave to a different business.

  egress — the allowlist was per workspace and is now one list. One list
    means the union, and a union is a *widening*: a host only the cottages
    could reach is now a host everything can. That is a change to the only
    way out of the machine, so unify() reports every host that was not on
    every list, by name, and the caller has to show it.
"""
from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path

# Everything that carried the column, and the key that decides what happens
# when two rows collide once it is gone.
#
# All but two of these have an id of their own, so nothing collides and the
# copy is a straight SELECT minus one column. The two that do are the two
# above, and they are the whole reason this file is not four lines long.
CARRIED = ("credential", "run", "approval", "trust", "episode",
           "fact", "skill", "message", "budget", "regression")


class NotNeeded(Exception):
    """The database is already unified. Not an error; just nothing to do."""


def _columns(db: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in db.execute(f"PRAGMA table_info({table})")]


def _tables(db: sqlite3.Connection) -> set[str]:
    return {r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}


def merge_trust(rows: list[dict]) -> dict:
    """The most conservative reading of several rows for one category.

    `rows` are the trust rows that shared a category across workspaces.
    Nothing here is an average: every field takes the value that gives the
    category the least freedom, because the alternative is granting autonomy
    that was earned somewhere else on somebody else's mail.
    """
    return {
        # Nineteen clean approvals on cottage enquiries and none on biz2's
        # is not nineteen. It is none — biz2's enquiries have never been
        # approved unchanged, and the merged category covers both.
        "clean": min(r["clean"] for r in rows),
        # The other direction for the two that count against it.
        "edited": max(r["edited"] for r in rows),
        "rejected": max(r["rejected"] for r in rows),
        "threshold": max(r["threshold"] for r in rows),
        # Autonomy survives only where every workspace had already granted
        # it. One row still asking for approval means the merged category
        # still asks.
        "auto": 1 if all(r["auto"] for r in rows) else 0,
        # And pinning is absolute: it exists to say "this one never
        # graduates", so one of them saying it is enough.
        "pinned_manual": 1 if any(r["pinned_manual"] for r in rows) else 0,
    }


def egress_union(lists: dict[str, list[str]]) -> dict:
    """One allowlist out of several, and what that widened.

    `lists` maps workspace id to the hosts it allowed. Returns the union and
    — the part that matters — every host that was not on all of them, with
    who did allow it, so somebody can be shown what just became reachable.
    """
    everyone = sorted({h for hosts in lists.values() for h in hosts})
    widened = {}
    for host in everyone:
        had = sorted(w for w, hosts in lists.items() if host in hosts)
        if len(had) != len(lists):
            widened[host] = had
    return {"allow": everyone, "widened": widened}


def unify(db_path: str | Path, backup_first: bool = True) -> dict:
    """Rewrite the database without workspaces. Returns what it did.

    Raises NotNeeded if there is nothing to collapse, and leaves the
    original untouched if anything at all goes wrong.
    """
    db_path = Path(db_path)
    if not db_path.exists():
        raise FileNotFoundError(f"no database at {db_path}")

    old = sqlite3.connect(str(db_path))
    old.row_factory = sqlite3.Row
    try:
        if "workspace" not in _tables(old):
            raise NotNeeded("this database has no workspaces in it")
        spaces = [dict(r) for r in old.execute(
            "SELECT id, name, egress_allow FROM workspace ORDER BY id")]
    finally:
        pass

    report: dict = {"workspaces": [w["id"] for w in spaces], "rows": {},
                    "trust_merged": [], "backup": ""}

    if backup_first:
        from core import backup
        made = backup.make(db_path)
        if made.get("error"):
            old.close()
            raise RuntimeError(
                f"could not take a backup first: {made['error']}. "
                f"Nothing has been changed.")
        report["backup"] = str(made.get("path") or "")

    # The one list, and what it opened up.
    eg = egress_union({w["id"]: json.loads(w["egress_allow"] or "[]")
                       for w in spaces})
    report["egress"] = eg

    fresh = db_path.with_name(db_path.name + ".unified")
    for tail in ("", "-wal", "-shm"):
        Path(str(fresh) + tail).unlink(missing_ok=True)

    try:
        # A Store on the new path applies the new schema.sql, which is the
        # one without workspaces. Importing it here rather than at module
        # scope keeps this file importable by a probe that only wants the
        # merge rules.
        from core.durable import Store
        Store(fresh).db.close()

        new = sqlite3.connect(str(fresh))
        new.row_factory = sqlite3.Row
        new.execute("PRAGMA foreign_keys = OFF")

        have_old, have_new = _tables(old), _tables(new)
        for table in CARRIED:
            if table not in have_old or table not in have_new:
                continue
            if table == "trust":
                report["rows"][table] = _copy_trust(old, new, report)
            elif table == "budget":
                report["rows"][table] = _copy_budget(old, new)
            else:
                report["rows"][table] = _copy_plain(old, new, table)

        # Tables that never carried the column still have to come across.
        for table in ("journal", "waiting", "span", "setting"):
            if table in have_old and table in have_new:
                report["rows"][table] = _copy_plain(old, new, table)

        new.execute(
            "INSERT OR REPLACE INTO setting(key,value) VALUES('egress_allow',?)",
            (json.dumps(eg["allow"]),))
        new.commit()

        bad = new.execute("PRAGMA integrity_check").fetchone()[0]
        if bad != "ok":
            raise RuntimeError(f"the rebuilt database did not verify: {bad}")
        new.close()
    except Exception:
        for tail in ("", "-wal", "-shm"):
            Path(str(fresh) + tail).unlink(missing_ok=True)
        old.close()
        raise

    old.close()
    # Only now. The sidecars beside the file being replaced belong to the
    # database being replaced — SQLite will apply them to whatever it finds,
    # and the result is either "disk image is malformed" about a sound file
    # or, worse, a clean apply of somebody else's recent writes.
    for tail in ("-wal", "-shm"):
        Path(str(db_path) + tail).unlink(missing_ok=True)
    shutil.move(str(fresh), str(db_path))
    return report


def _copy_plain(old, new, table: str) -> int:
    """Straight across, minus workspace_id and anything else gone."""
    keep = [c for c in _columns(old, table) if c in set(_columns(new, table))]
    if not keep:
        return 0
    cols = ",".join(f'"{c}"' for c in keep)
    holes = ",".join("?" * len(keep))
    n = 0
    for row in old.execute(f"SELECT {cols} FROM {table}"):
        new.execute(f"INSERT OR REPLACE INTO {table}({cols}) VALUES({holes})",
                    tuple(row))
        n += 1
    new.commit()
    return n


def _copy_trust(old, new, report: dict) -> int:
    """Four rows for one category become the least free of them."""
    by_cat: dict[str, list[dict]] = {}
    for r in old.execute("SELECT * FROM trust"):
        by_cat.setdefault(r["category"], []).append(dict(r))
    for cat, rows in sorted(by_cat.items()):
        m = merge_trust(rows)
        if len(rows) > 1:
            report["trust_merged"].append({
                "category": cat,
                "from": [{"workspace": r["workspace_id"], "clean": r["clean"],
                          "auto": r["auto"]} for r in rows],
                "to": m})
        new.execute(
            "INSERT OR REPLACE INTO trust(category,clean,edited,rejected,"
            "threshold,auto,pinned_manual) VALUES(?,?,?,?,?,?,?)",
            (cat, m["clean"], m["edited"], m["rejected"], m["threshold"],
             m["auto"], m["pinned_manual"]))
    new.commit()
    return len(by_cat)


def _copy_budget(old, new) -> int:
    """A day's spend is a day's spend, so these add up rather than collide."""
    days: dict[str, dict] = {}
    for r in old.execute("SELECT * FROM budget"):
        d = days.setdefault(r["day"], {"tokens": 0, "tool_calls": 0,
                                       "max_tokens": 0, "max_tool_calls": 0})
        d["tokens"] += r["tokens"]
        d["tool_calls"] += r["tool_calls"]
        # The ceiling is a property of the machine, not of a business, so
        # four copies of it do not add up to four times the allowance.
        d["max_tokens"] = max(d["max_tokens"], r["max_tokens"])
        d["max_tool_calls"] = max(d["max_tool_calls"], r["max_tool_calls"])
    for day, d in sorted(days.items()):
        new.execute("INSERT OR REPLACE INTO budget(day,tokens,tool_calls,"
                    "max_tokens,max_tool_calls) VALUES(?,?,?,?,?)",
                    (day, d["tokens"], d["tool_calls"], d["max_tokens"],
                     d["max_tool_calls"]))
    new.commit()
    return len(days)


def say(report: dict) -> str:
    """The report as something a person reads in a terminal."""
    out = [f"  Collapsed {len(report['workspaces'])} workspaces into one: "
           + ", ".join(report["workspaces"])]
    if report.get("backup"):
        out.append(f"  The database as it was: {report['backup']}")
    rows = ", ".join(f"{n} {t}" for t, n in sorted(report["rows"].items()) if n)
    out.append(f"  Kept: {rows}")

    merged = report.get("trust_merged") or []
    if merged:
        out.append("")
        out.append("  Trust was per workspace and per category. Where a "
                   "category existed in")
        out.append("  more than one, the merged row is the most cautious of "
                   "them — a clean")
        out.append("  count earned on one business is not a clean count on "
                   "another:")
        for m in merged:
            was = ", ".join(f"{f['workspace']} {f['clean']}"
                            + (" auto" if f["auto"] else "") for f in m["from"])
            out.append(f"    {m['category']}: {was}  ->  clean "
                       f"{m['to']['clean']}"
                       + (", still automatic" if m["to"]["auto"]
                          else ", back to asking you"))

    widened = (report.get("egress") or {}).get("widened") or {}
    if widened:
        out.append("")
        out.append("  READ THIS. The egress allowlist was per workspace and "
                   "is now one list.")
        out.append("  These hosts were reachable by some and are now "
                   "reachable by everything")
        out.append("  you have wired. Take any you do not want out with "
                   "`connect.py egress`:")
        for host, had in sorted(widened.items()):
            out.append(f"    {host}   (was: {', '.join(had)})")
    elif report.get("egress", {}).get("allow"):
        out.append("")
        out.append("  The allowlist is unchanged — every workspace allowed "
                   "the same hosts:")
        out.append("    " + ", ".join(report["egress"]["allow"]))
    return "\n".join(out)


if __name__ == "__main__":                                       # ./blokk unify
    import sys
    here = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(here))
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "blokk.db"
    try:
        print()
        print(say(unify(target)))
        print()
        print("  Done. Nothing else needs doing — the app reads the new shape.")
        print()
    except NotNeeded as e:
        print(f"\n  Nothing to do: {e}\n")
    except Exception as e:                                       # noqa: BLE001
        print(f"\n  \033[31mStopped: {e}\033[0m")
        print("  The database has not been changed.\n")
        sys.exit(1)
