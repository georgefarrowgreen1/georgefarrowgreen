"""Procedural memory: how to do it, as a script that has been run.

`fact` is what Blokk has learned — "always mention the dog charge". This is
the other half: a way of doing something that worked, kept as code rather
than as remembered reasoning, so the tenth time is the same as the first.

The table has been in the schema since the beginning with nothing using it,
for a good reason — a table of scripts and nowhere safe to run them is worse
than neither. `core/sandbox.py` is that place now, so this is the part that
was waiting on it.

Three rules, and they are all about not trusting the script:

**Nothing runs outside the sandbox.** `run()` has no path that executes
anything directly, and `sandbox.run` refuses rather than falling back to
running unconfined. A skill is code somebody or something wrote, kept in a
database, run later — every part of that sentence is a reason not to trust
it.

**A skill earns its status by running, not by being written.** It starts as
`candidate`. `PROMOTE_AFTER` clean runs make it `promoted`; `RETIRE_AFTER`
failures retire it, and a retired skill is never offered again until a
person says so. That is the same shape as the trust ledger and for the same
reason: a thing that only ever ratchets up is not a ledger.

**It carries no secrets and reaches nothing.** The sandbox has no network
and no home directory, so a skill cannot read the keychain, the database or
anybody's mail. What it gets is its argument on stdin and what it prints
back — which is the whole interface on purpose.
"""
from __future__ import annotations

import hashlib
import json
import re

from core import sandbox

NAME = re.compile(r"^[a-z][a-z0-9_-]{1,63}$")
PROMOTE_AFTER = 5
RETIRE_AFTER = 3
MAX_CODE = 64 * 1024


class SkillError(RuntimeError):
    pass


def add(store, name: str, description: str, code: str) -> dict:
    """Record a skill. Does not run it, and does not promote it."""
    name = str(name or "").strip().lower()
    if not NAME.match(name):
        raise SkillError(f"{name!r} is not a skill name — lower case, digits, "
                         f"dashes and underscores, starting with a letter")
    if not str(description or "").strip():
        raise SkillError("a skill needs a description: it is how the agent "
                         "finds it, and one nobody can find is one nobody runs")
    if len(code or "") > MAX_CODE:
        raise SkillError(f"that is {len(code):,} bytes and the limit is "
                         f"{MAX_CODE:,}")
    if not str(code or "").strip():
        raise SkillError("an empty skill does nothing")
    sid = "sk_" + hashlib.sha256(
        name.encode()).hexdigest()[:12]
    # The code lives in code_ref, which the schema calls "path in the skills
    # dir". It holds the source itself here: a path is a second place for
    # this to disagree with itself, and a backup of blokk.db that does not
    # contain the skills is a backup that restores a system missing half its
    # procedural memory.
    # Counters carried forward only while the code is the same. Adding a
    # *changed* skill starts it over: the runs behind a script belong to
    # that script, and keeping the failures while resetting the status to
    # candidate made the documented "fix it and add it again" path retire
    # it again on its first run. Re-adding an identical one is a no-op and
    # should not wipe what it has earned.
    prior = store.one("SELECT code_ref, runs, failures FROM skill WHERE id=?",
                      sid)
    same = prior is not None and prior["code_ref"] == code
    store.x("""INSERT OR REPLACE INTO skill
               (id,name,description,code_ref,runs,failures,status)
               VALUES(?,?,?,?,?,?,'candidate')""",
            sid, name, str(description).strip()[:400], code,
            prior["runs"] if same else 0,
            prior["failures"] if same else 0)
    return {"ok": True, "id": sid, "name": name, "status": "candidate",
            "restarted": not same,
            "note": (f"Recorded, not trusted. {PROMOTE_AFTER} clean runs "
                     f"promote it; {RETIRE_AFTER} failures retire it."
                     + ("" if same else " The code changed, so it starts "
                                        "over from nothing."))}


def listing(store, include_retired: bool = False) -> list[dict]:
    """What is available, and how much it has earned."""
    rows = store.q("SELECT id,name,description,runs,failures,"
                   "status FROM skill ORDER BY status, name")
    out = []
    for r in rows:
        if r["status"] == "retired" and not include_retired:
            continue
        out.append(dict(r))
    return out


def run(store, name: str, argument: str = "",
        timeout: int = sandbox.TIMEOUT) -> dict:
    """Run a recorded skill in the sandbox, and record what happened.

    The argument goes in on stdin, not into the source. A skill whose code
    is rewritten per call is not a verified script — it is a new script every
    time, and the runs behind it count for nothing.
    """
    row = store.one(
        "SELECT * FROM skill WHERE name=? LIMIT 1",
        str(name or "").strip().lower())
    if row is None:
        known = ", ".join(s["name"] for s in listing(store)) or "none"
        raise SkillError(f"no skill called {name!r}. There are: {known}")
    if row["status"] == "retired":
        raise SkillError(
            f"{row['name']} was retired after {row['failures']} failures and "
            f"is not run. Fix it and add it again to start it over.")

    ok, why = sandbox.capable()
    if not ok:
        # Refused, not run unconfined. The failure this avoids is a sandbox
        # that quietly is not one, because that is the point at which the
        # caller stops thinking about it.
        raise SkillError(f"nothing was run: {why}")
    failed = None
    try:
        out = sandbox.run(row["code_ref"], stdin=str(argument or ""),
                          timeout=timeout)
    except sandbox.Failed as e:
        out = {"ok": False, "code": e.code, "out": e.out, "err": e.err,
               "timed_out": e.timed_out}
        failed = str(e)
    except sandbox.Unavailable as e:
        raise SkillError(f"nothing was run: {e}") from None

    good = bool(out.get("ok"))
    store.x("UPDATE skill SET runs=runs+1, failures=failures+? WHERE id=?",
            0 if good else 1, row["id"])
    fresh = store.one("SELECT runs,failures,status FROM skill WHERE id=?",
                      row["id"])
    status = fresh["status"]
    clean = fresh["runs"] - fresh["failures"]
    if fresh["failures"] >= RETIRE_AFTER:
        status = "retired"
    elif clean >= PROMOTE_AFTER and status == "candidate":
        status = "promoted"
    if status != fresh["status"]:
        store.x("UPDATE skill SET status=? WHERE id=?", status, row["id"])
    return {"ok": good, "skill": row["name"], "status": status,
            "runs": fresh["runs"], "failures": fresh["failures"],
            "out": out.get("out", ""), "err": out.get("err", ""),
            "timed_out": bool(out.get("timed_out")),
            "detail": failed or ("ran clean" if good else
                                 f"exited {out.get('code')}")}


def forget(store, name: str) -> dict:
    """Take a skill out. Nothing here is retired automatically for ever."""
    row = store.one("SELECT id,name FROM skill WHERE name=?",
                    str(name or "").strip().lower())
    if row is None:
        raise SkillError(f"no skill called {name!r}")
    store.x("DELETE FROM skill WHERE id=?", row["id"])
    return {"ok": True, "removed": row["name"]}
