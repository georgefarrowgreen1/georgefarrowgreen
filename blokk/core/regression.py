"""Twenty frozen examples, run against whatever model is configured now.

The point is a model swap. You will change model — for size, for speed, for
whatever fits the Mac you are on — and the failure mode is not a crash. It is
drafts that quietly get worse, in a queue you approve at speed, until a guest
reads one. This runs the same inputs through the new weights and says which
expectations stopped holding.

Assertions rather than exact strings, because two good drafts are not the
same two hundred characters. And assertions checked in code rather than by a
second model: a judge that also changed when you swapped weights cannot tell
you the first model changed.

    contains:£25          somewhere in the answer, case-insensitive
    absent:tomorrow       nowhere in it
    word:Fenwick          the whole word, not a substring of another
    noword:Hall           and its opposite: absent:Hall fires on "Shall"
    matches:^\\{.*\\}$      a regex over the whole answer
    shorter:400           fewer than N characters
    longer:20
    json                  parses as JSON
    json.needs_reply      parses, and has that key

Several separated by `;`, and all of them must hold.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone


def _check(rule: str, text: str) -> tuple[bool, str]:
    rule = rule.strip()
    kind, _, arg = rule.partition(":")
    kind = kind.strip().lower()
    arg = arg.strip()
    if kind == "contains":
        return arg.lower() in text.lower(), f"expected to find {arg!r}"
    if kind == "absent":
        return arg.lower() not in text.lower(), f"expected not to find {arg!r}"
    if kind in ("word", "noword"):
        # A name is often a substring of an ordinary word — absent:Hall fires
        # on "Shall I hold it for you?" — so proper nouns want a boundary.
        hit = bool(re.search(rf"\b{re.escape(arg)}\b", text, re.I))
        return (hit if kind == "word" else not hit), (
            f"expected the word {arg!r}" if kind == "word"
            else f"expected the word {arg!r} to be absent")
    if kind == "matches":
        try:
            return bool(re.search(arg, text, re.S)), f"expected to match /{arg}/"
        except re.error as e:
            return False, f"bad regex: {e}"
    if kind == "shorter":
        return len(text) < int(arg), f"expected under {arg} chars, got {len(text)}"
    if kind == "longer":
        return len(text) > int(arg), f"expected over {arg} chars, got {len(text)}"
    if kind.startswith("json"):
        try:
            doc = json.loads(text)
        except ValueError:
            return False, "expected JSON, did not parse"
        key = kind.partition(".")[2] or arg
        if key and (not isinstance(doc, dict) or key not in doc):
            return False, f"JSON has no {key!r}"
        return True, ""
    return False, f"unknown assertion {kind!r}"


def assess(expect: str, text: str) -> tuple[bool, list[str]]:
    """Every rule must hold. Returns the ones that did not."""
    broke = []
    for rule in expect.split(";"):
        if not rule.strip():
            continue
        ok, why = _check(rule, text)
        if not ok:
            broke.append(why)
    return (not broke), broke


def listing(store) -> list[dict]:
    return [dict(r) for r in store.q(
        "SELECT * FROM regression ORDER BY workspace_id, name")]


def add(store, ws: str, name: str, prompt: str, expect: str,
        system: str = "") -> dict:
    ok, _ = assess(expect, "")
    if "unknown assertion" in " ".join(assess(expect, "x")[1]):
        return {"error": f"cannot read the expectation: {expect}"}
    store.x("""INSERT OR REPLACE INTO regression
               (id,workspace_id,name,input,expect) VALUES(?,?,?,?,?)""",
            f"r_{ws}_{re.sub(r'[^a-z0-9]+', '_', name.lower())}", ws, name,
            json.dumps({"system": system, "user": prompt}), expect)
    return {"ok": True, "name": name}


def run(store, router, only: str = "") -> dict:
    """Run every frozen example and record what held.

    A model that is not answering is not a regression — it is an outage, and
    calling it a failed expectation would have you hunting a prompt when the
    server is down. It is reported separately and does not touch last_pass.
    """
    rows = listing(store)
    if only:
        rows = [r for r in rows if only in r["name"] or only == r["workspace_id"]]
    at = datetime.now(timezone.utc).isoformat()
    results, passed, unreachable = [], 0, 0
    for r in rows:
        spec = json.loads(r["input"])
        model = router.pick(r["name"] + " " + spec.get("system", ""))
        try:
            answer = model.chat([
                {"role": "system", "content": spec.get("system", "")},
                {"role": "user", "content": spec.get("user", "")},
            ])
            text = answer.get("text", "")
        except Exception as e:                                    # noqa: BLE001
            unreachable += 1
            results.append({"name": r["name"], "workspace_id": r["workspace_id"],
                            "state": "unreachable", "detail": str(e)[:140],
                            "was": r["last_pass"]})
            continue
        ok, broke = assess(r["expect"], text)
        passed += ok
        store.x("UPDATE regression SET last_pass=?, last_run_at=? WHERE id=?",
                1 if ok else 0, at, r["id"])
        results.append({
            "name": r["name"], "workspace_id": r["workspace_id"],
            "state": "pass" if ok else "fail", "broke": broke,
            # A pass that used to fail is worth as much as the reverse; both
            # mean the model you are running is not the one you measured.
            "changed": r["last_pass"] is not None and bool(r["last_pass"]) != ok,
            "answer": text[:240],
        })
    ran = len(rows) - unreachable
    return {"results": results, "passed": passed, "ran": ran,
            "total": len(rows), "unreachable": unreachable, "at": at,
            "regressed": [x["name"] for x in results
                          if x.get("changed") and x["state"] == "fail"],
            "model": getattr(router.small, "name", "?")}
