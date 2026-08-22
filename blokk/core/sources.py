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

KINDS = {"imap": "mail", "maildir": "mail",
         "caldav": "calendar", "ical": "calendar",
         "messages": "messages"}
# The two that read this Mac's own files need no credential — and no network,
# and no app-specific password. They need Full Disk Access, which core/local.py
# checks for and explains.
NEEDS_KEYCHAIN = ("imap", "caldav")


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
