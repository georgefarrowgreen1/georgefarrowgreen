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
         "messages": "messages", "weather": "weather", "web": "web"}
# KINDS is not a label: the value is the name the connector is registered
# under in core/connectors, and test() and peek() both look a source up by
# it. Calling the web one "a page" here read better in the panel and made
# every web source report "not loaded".
# The two sources that reach off this machine. Neither "ref" is a keychain
# name: weather takes a place, because it has no credential to keep and
# needs to know where you are, and web takes the address of one page.
IS_PLACE = ("weather",)
IS_URL = ("web",)
REACHES_OUT = IS_PLACE + IS_URL
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
        return {"error": ("a place is required — a town, or coordinates "
                          "like 54.97,-1.61" if kind in IS_PLACE
                          else "the address of one page, https://…"
                          if kind in IS_URL
                          else "a keychain service name is required")}
    if kind in IS_URL:
        from urllib.parse import urlparse
        u = urlparse(ref)
        if u.scheme == "http":
            return {"error": f"{ref!r} is http. Blokk reads pages over https "
                             f"only — plain http puts the request, and "
                             f"anything in it, on the wire in the clear."}
        if u.scheme != "https" or not u.hostname:
            return {"error": f"{ref!r} is not a page address. It wants the "
                             f"whole thing, starting https:// — for example "
                             f"https://example.com/prices"}
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
    if kind in IS_URL:
        # One host, the one in the address you gave. Not the page: an
        # allowlist of URLs would be a list nobody could reason about, and
        # the gate matches hosts.
        from core import egress
        host = urlparse(ref).hostname.lower()
        egress.allow(store, ws, host)
        out["egress"] = [host]
        out["note"] = (f"{ws} may now reach {host} — and nothing else new. "
                       f"What comes back is quarantined before anything "
                       f"reads it, and nothing in Blokk fetches it on its "
                       f"own: you ask, with peek.")
    if kind in IS_PLACE:
        # A source that leaves the machine is no use without permission to.
        # Adding it and then refusing every request it makes would be the
        # kind of silent half-state this codebase keeps having to fix.
        from core import egress
        from core.connectors.weather import HOSTS
        for host in HOSTS:
            egress.allow(store, ws, host)
        out["egress"] = list(HOSTS)
        out["note"] = (f"{ws} may now reach {', '.join(HOSTS)} — and nothing "
                       f"else new. What leaves is a latitude and a longitude.")
    return out


def remove(store, ws: str, kind: str) -> dict:
    # Read before the delete: for a web source the host to close is derived
    # from the ref, and after the DELETE there is nothing left to derive it
    # from.
    was = store.one("SELECT keychain_ref FROM credential "
                    "WHERE workspace_id=? AND kind=?", ws, kind)
    store.x("DELETE FROM credential WHERE workspace_id=? AND kind=?", ws, kind)
    note = ("The keychain entry is untouched — delete it yourself if you "
            "meant to revoke access.")
    if kind in IS_URL and was:
        from urllib.parse import urlparse

        from core import egress
        host = (urlparse(was["keychain_ref"]).hostname or "").lower()
        # Only if nothing else still points at it. Two web sources on the
        # same host would otherwise take each other's permission away.
        others = [r["keychain_ref"] for r in store.q(
            "SELECT keychain_ref FROM credential WHERE workspace_id=? "
            "AND kind IN ('web')", ws)]
        if host and not any(
                (urlparse(o).hostname or "").lower() == host for o in others):
            if not egress.disallow(store, ws, host).get("error"):
                note = f"{ws} can no longer reach {host}. " + note
    if kind in IS_PLACE:
        # Adding the source opened the allowlist; removing it has to close it
        # again. A permission that is granted automatically and revoked only
        # by hand is a ratchet, and this codebase has already been bitten
        # once by exactly that shape in the trust ledger. Only revoke what
        # nothing left in this workspace still needs.
        from core import egress
        from core.connectors.weather import HOSTS
        still = {r["kind"] for r in store.q(
            "SELECT kind FROM credential WHERE workspace_id=?", ws)}
        if not still & set(IS_PLACE):
            gone = [h for h in HOSTS
                    if not egress.disallow(store, ws, h).get("error")]
            if gone:
                note = (f"{ws} can no longer reach {', '.join(gone)}. " + note)
    return {"ok": True, "detail": note}


def describe(kind: str, state: dict) -> str:
    """A check() result as a sentence.

    It used to be str(the dict), so the screen that tells you whether your
    mail is readable said {'ok': True, 'calendars': [], 'events_on_disk': 0}.
    Every number in there was right and the sentence it added up to — none of
    your calendars are here — was left for you to work out.
    """
    if not isinstance(state, dict):
        return str(state)
    if state.get("ok") is False:
        return state.get("detail", "found nothing to read")
    if "calendars" in state:
        n = len(state["calendars"])
        return (f"{n} calendar(s) — {', '.join(state['calendars'][:6])}; "
                f"{state.get('events_on_disk', 0)} events on disk, "
                f"{state.get('in_next_90_days', 0)} in the next 90 days")
    if "messages_seen" in state:
        boxes = ", ".join(state.get("mailboxes", [])[:6])
        return (f"{state['messages_seen']} message(s)"
                + (f", newest {state['newest']}" if state.get("newest") else "")
                + (f"; in {boxes}" if boxes else "")
                + ("; more on disk than it walked" if state.get("capped") else ""))
    if "url" in state and "title" in state:
        return (f"{state['title'] or '(no title)'} — {state.get('chars', 0)} "
                f"characters"
                + ("; reads like an instruction, not a page"
                   if state.get("instruction_like") else "")
                + f"; {state.get('sends', '')}")
    if "place" in state:
        return (f"{state['place']} ({state.get('at','')}) — {state.get('today','')}"
                f"; sends {state.get('sends', 'a location')}")
    if "messages" in state or "chats" in state:
        return ", ".join(f"{k} {v}" for k, v in state.items() if k != "ok")
    return ", ".join(f"{k} {v}" for k, v in state.items() if k != "ok")


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
            state = c.check()
            # A connector that says ok: False has found nothing to read. That
            # is a failure of this test, whatever the call did not raise.
            good = not (isinstance(state, dict) and state.get("ok") is False)
            results.append({"label": label, "ok": good,
                            "detail": describe(r["kind"], state)})
            if not good:
                bad += 1
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
        return {"error": f"nothing named '{name}' for {ws}",
                "fix": "Add a source for it first."}

    # Ask whether it can read at all before showing you nothing. An empty list
    # and a source Blokk is not allowed to open look identical here, and this
    # is the screen you come to when you cannot see your mail — so it has to
    # tell the two apart rather than leave you to guess.
    state = None
    if hasattr(c, "check"):
        try:
            state = c.check()
            if isinstance(state, dict) and state.get("ok") is False:
                # The connector itself says it found nothing to read. It
                # knows why; pass that on rather than rendering an empty list.
                return {"error": state.get("detail", "nothing readable"),
                        "readable": False, "state": state,
                        "fix": "connect.py local, or the ⚯ panel's On this "
                               "Mac section, says whether this is a "
                               "permission or an empty folder."}
        except FileNotFoundError as e:
            return {"error": str(e), "readable": False,
                    "fix": "Either that app keeps nothing on this Mac, or "
                           "Blokk is not allowed to see it. connect.py local "
                           "says which, and names the app to grant Full Disk "
                           "Access to."}
        except PermissionError as e:
            return {"error": str(e), "readable": False,
                    "fix": "macOS is refusing. System Settings > Privacy & "
                           "Security > Full Disk Access, then start Blokk "
                           "again — it is only picked up on launch."}
        except Exception as e:                                    # noqa: BLE001
            return {"error": f"{type(e).__name__}: {e}", "readable": False,
                    "fix": "The source is wired but not answering."}

    # The window is stated, and it is wide. peek used to call search_since()
    # with no arguments, which means "since last night" — so a mailbox with
    # nothing in the last 24 hours peeked as empty, on the screen you open
    # precisely because you think Blokk cannot see your mail.
    # Ask for the window in whatever unit the connector counts in. The three
    # readers disagree — days, hours, or an ISO hour string — and calling
    # them blind meant peek raised TypeError on the sample world and asked
    # for twelve hours everywhere else. Twelve hours of a quiet mailbox looks
    # exactly like an empty one, on the screen you opened to tell them apart.
    from datetime import datetime, timedelta
    from core.connectors import read_since
    DAYS = 60
    window, rows = "", []
    fn = getattr(c, "search_since", None) or getattr(c, "since", None)
    if fn:
        window = f"the last {DAYS} days"
        now = datetime.now()
        rows = read_since(fn, now - timedelta(days=DAYS), now, max(n, 20))
    elif getattr(c, "events", None):
        window = "the next 90 days"
        rows = c.events(days=90)
    elif getattr(c, "read", None) and getattr(c, "kind", "") == "web":
        # One row, because it is one page. Shown as the fields a workflow
        # would get, quarantine flag and all.
        window = "the page as it is right now"
        page = c.read()
        rows = [{"from": page["url"], "subject": page["title"] or "(no title)",
                 "provenance": page["provenance"], "body": page["text"],
                 "instruction_like": page["instruction_like"]}]
    elif getattr(c, "forecast", None):
        window = "the next 5 days"
        # The body is the fields, not a second copy of the sentence: peek is
        # where you check what a workflow is actually handed, and what it is
        # handed is numbers.
        rows = [{"from": d["date"], "subject": d["summary"],
                 "provenance": d["provenance"],
                 "body": f"high {d['high_c']}°C, low {d['low_c']}°C, "
                         f"rain {d['rain_chance']}%, wind {d['wind_kph']} km/h"}
                for d in c.forecast(days=5)]
    elif getattr(c, "gaps", None):
        # The sample calendar answers "which nights are free" and nothing
        # else. Show that rather than an empty list with no explanation.
        window = "free nights in the next 90 days"
        rows = [{"from": g["from"], "subject": g["note"], "provenance": "self"}
                for g in c.gaps(days=90)]
    else:
        return {"error": f"'{name}' has nothing to peek at",
                "readable": True, "window": "",
                "fix": "This connector answers specific questions rather "
                       "than listing. Nothing is wrong with it."}
    rows = list(rows)[:n]
    out = []
    for r in rows:
        body = r.get("body") or r.get("summary") or ""
        q = quarantine_read(body)
        out.append({"from": r.get("from") or r.get("start", ""),
                    "subject": r.get("subject") or r.get("summary", ""),
                    "provenance": r.get("provenance", "?"),
                    "instruction_like": bool(q["instruction_like"]),
                    "body": body[:400].strip()})
    # Readable and empty is a real answer, and a different one from
    # unreadable — but "nothing here" on its own is still a shrug. Say what
    # was looked at and what is on disk outside the window, because that is
    # the sentence that tells you whether to widen the window or go and fix
    # Full Disk Access.
    note = ""
    if not out:
        note = f"Blokk can read this, and there is nothing in {window}."
        if isinstance(state, dict):
            seen = state.get("messages_seen") or state.get("events_on_disk")
            if seen:
                note += (f" {seen} item(s) are on disk"
                         + (f", the newest from {state['newest']}"
                            if state.get("newest") else "") + ".")
            boxes = state.get("mailboxes") or state.get("calendars")
            if boxes:
                note += f" It can see: {', '.join(map(str, boxes[:8]))}."
    return {"rows": out, "count": len(out), "readable": True,
            "window": window, "state": state if isinstance(state, dict) else {},
            "note": note}
