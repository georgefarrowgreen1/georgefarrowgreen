"""Wiring real data sources in, once, for both the CLI and the GUI.

connect.py and the dashboard call these, so the two cannot disagree about
what "add" means — the same reason core/plan.py and core/servers.py exist.

No password passes through here. `add` records the name of a keychain
service; the password is put in the keychain separately and read at call
time. That is what makes this safe to put behind a web form: the browser
never sees a credential, and neither does the database.
"""
from __future__ import annotations

import json
import re

KINDS = {"imap": "mail", "maildir": "mail",
         "caldav": "calendar", "ical": "calendar",
         "messages": "messages"}
# The two that read this Mac's own files need no credential — and no network,
# and no app-specific password. They need Full Disk Access, which core/local.py
# checks for and explains.
NEEDS_KEYCHAIN = ("imap", "caldav")


SAMPLE = ("cottages", "biz2", "biz3", "personal")


def workspace_add(store, wid: str, name: str, egress: list | None = None) -> dict:
    """A real workspace of your own.

    seed.py was the only thing that ever made one, which was fine while the
    sample world was the point and useless the moment it stopped being.
    """
    wid = (wid or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,30}", wid or ""):
        return {"error": "an id is lowercase letters, digits, - and _"}
    if store.one("SELECT 1 FROM workspace WHERE id=?", wid):
        return {"error": f"'{wid}' already exists"}
    if wid in SAMPLE:
        # core/connectors/fake.py fills gaps by workspace id, so a real
        # workspace with a sample's name is handed invented guests for
        # anything not yet wired. "personal" is a name someone would
        # plausibly choose, so refuse rather than let that happen quietly.
        return {"error": f"'{wid}' is one of the sample world's names, so it "
                         f"would be handed invented data for anything not yet "
                         f"wired. Pick another id."}
    store.x("INSERT INTO workspace(id,name,active,egress_allow) VALUES(?,?,1,?)",
            wid, (name or wid).strip(), json.dumps(egress or []))
    return {"ok": True, "id": wid, "name": (name or wid).strip()}


def workspace_remove(store, wid: str) -> dict:
    """Everything that workspace ever held goes with it.

    The schema cascades — credentials, runs, journal, approvals, trust,
    episodes, facts. That is the point of removing a workspace, and it is not
    recoverable, so the caller has to mean it.
    """
    if not store.one("SELECT 1 FROM workspace WHERE id=?", wid):
        return {"error": f"no workspace '{wid}'"}
    counts = {t: store.one(f"SELECT COUNT(*) c FROM {t} WHERE workspace_id=?",
                           wid)["c"]
              for t in ("credential", "run", "approval", "trust", "episode",
                        "fact")}
    store.x("DELETE FROM workspace WHERE id=?", wid)
    return {"ok": True, "id": wid, "removed": counts}


def is_sample(store) -> list[str]:
    """Which of the seeded sample workspaces are still here."""
    return [w["id"] for w in workspaces(store) if w["id"] in SAMPLE]


def workspaces(store) -> list[dict]:
    return [dict(r) for r in store.q("SELECT id,name FROM workspace ORDER BY id")]


def listing(store) -> list[dict]:
    out = []
    for r in store.q("SELECT * FROM credential ORDER BY workspace_id"):
        out.append({"workspace_id": r["workspace_id"], "kind": r["kind"],
                    "keychain_ref": r["keychain_ref"],
                    "scopes": json.loads(r["scopes"]),
                    "reads": KINDS.get(r["kind"], r["kind"])})
    return out


def add(store, ws: str, kind: str, ref: str) -> dict:
    if kind not in KINDS:
        return {"error": f"kind must be one of {', '.join(KINDS)}"}
    if not ref:
        return {"error": "a keychain service name is required"}
    if not store.one("SELECT 1 FROM workspace WHERE id=?", ws):
        known = ", ".join(w["id"] for w in workspaces(store))
        return {"error": f"no workspace '{ws}'. Known: {known}"}
    store.x("""INSERT OR REPLACE INTO credential
               (id,workspace_id,kind,keychain_ref,scopes)
               VALUES(?,?,?,?,?)""",
            f"c_{ws}_{kind}", ws, kind, ref, json.dumps(["read"]))
    out = {"ok": True, "workspace_id": ws, "kind": kind, "keychain_ref": ref,
           "scopes": ["read"]}
    if kind in NEEDS_KEYCHAIN:
        # Shown, never run: this is the step that keeps the password out of
        # the browser, the database and this process.
        out["keychain_hint"] = (
            f"security add-generic-password -s {ref} -a you@icloud.com -w")
    return out


def remove(store, ws: str, kind: str) -> dict:
    store.x("DELETE FROM credential WHERE workspace_id=? AND kind=?", ws, kind)
    return {"ok": True, "detail": "The keychain entry is untouched — delete it "
                                  "yourself if you meant to revoke access."}


def test(store) -> dict:
    from core.connectors import wire
    reg = wire(store)
    rows = store.q("SELECT * FROM credential")
    results, bad = [], 0
    for r in rows:
        name = KINDS[r["kind"]]
        label = f"{r['workspace_id']}/{name}"
        c = reg.get(r["workspace_id"], name)
        if c is None or not hasattr(c, "check"):
            results.append({"label": label, "ok": False, "detail": "not loaded"})
            bad += 1
            continue
        try:
            results.append({"label": label, "ok": True, "detail": str(c.check())})
        except Exception as e:                                    # noqa: BLE001
            results.append({"label": label, "ok": False,
                            "detail": f"{type(e).__name__}: {e}"})
            bad += 1
    return {"results": results, "working": len(rows) - bad, "total": len(rows)}


def peek(store, ws: str, name: str, n: int = 5) -> dict:
    """What it would actually read. Nothing is written, nothing marked read.

    Every body here is untrusted text from outside, so it goes through
    quarantine_read and carries its verdict. Whatever renders this must
    escape it: it is the one place the product deliberately shows you a
    stranger's words.
    """
    from core.connectors import wire
    from core.harness import quarantine_read
    c = wire(store).get(ws, name)
    if c is None:
        return {"error": f"nothing named '{name}' for {ws}"}
    fn = (getattr(c, "search_since", None) or getattr(c, "since", None)
          or getattr(c, "events", None))
    rows = fn()[:n] if fn else []
    out = []
    for r in rows:
        body = r.get("body") or r.get("summary") or ""
        q = quarantine_read(body)
        out.append({"from": r.get("from") or r.get("start", ""),
                    "subject": r.get("subject") or r.get("summary", ""),
                    "provenance": r.get("provenance", "?"),
                    "instruction_like": bool(q["instruction_like"]),
                    "body": body[:400].strip()})
    return {"rows": out, "count": len(out)}
