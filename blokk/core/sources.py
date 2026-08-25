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
         "messages": "messages", "weather": "weather", "web": "web",
         "ics_out": "holds", "smtp": "send"}
# KINDS is not a label: the value is the name the connector is registered
# under in core/connectors, and test() and peek() both look a source up by
# it. Calling the web one "a page" here read better in the panel and made
# every web source report "not loaded".
# The two sources that reach off this machine. Neither "ref" is a keychain
# name: weather takes a place, because it has no credential to keep and
# needs to know where you are, and web takes the address of one page.
IS_PLACE = ("weather",)
IS_URL = ("web",)
# CalDAV reaches one fixed host that nothing in the data chooses, which is
# why it sat outside the gate for so long. It goes through it now, so it
# needs the same allowlist entry as anything else that leaves — added here
# rather than left for somebody to discover at 04:00 when every REPORT comes
# back refused.
IS_FIXED_HOST = ("caldav",)
REACHES_OUT = IS_PLACE + IS_URL + IS_FIXED_HOST
# The two that read this Mac's own files need no credential — and no network,
# and no app-specific password. They need Full Disk Access, which core/local.py
# checks for and explains.
NEEDS_KEYCHAIN = ("imap", "caldav", "smtp")
# The three that need nothing at all: no password, no network, no account.
# "local" points them at the Apple app's own folder; anything else is a path,
# which is how an exported mailbox or a shared calendar directory gets wired.
NEEDS_NOTHING = ("maildir", "ical", "messages", "ics_out")
READS_A_FOLDER = ("maildir", "ical")
# The one that writes a folder rather than reading one. It may name a folder
# that is not there yet — the point is that Blokk creates it — but its parent
# has to exist, or a typo'd path builds a tree three levels deep somewhere
# nobody will ever look.
WRITES_A_FOLDER = ("ics_out",)
# Everything that is not read-only. `scopes` is the column that answers
# "what may this credential do", and smtp — the only one that reaches
# another person — was being written into it as ["read"].
WRITES = WRITES_A_FOLDER + ("smtp",)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())[:12]


def name_for(store, kind: str, ref: str) -> str:
    """What to call a new source of this kind.

    The first mailbox is `mail`, because that is what it is and nobody
    should have to name it. The second cannot also be `mail`, and silently
    replacing the first is the failure this exists to stop — so it becomes
    `mail2`, and a third `mail3`. A person who wants better names can pass
    one; nothing here insists.
    """
    from core.connectors import ROLE
    base = ROLE.get(kind, kind)
    taken = {r["name"] for r in store.q("SELECT name FROM credential")
             if r["name"]}
    if base not in taken:
        return base
    # Try the reference first — "mail-icloud" says more than "mail2".
    hint = _slug(ref)
    if hint and f"{base}-{hint}" not in taken:
        return f"{base}-{hint}"
    n = 2
    while f"{base}{n}" in taken:
        n += 1
    return f"{base}{n}"


def listing(store) -> list[dict]:
    out = []
    for r in store.q("SELECT * FROM credential ORDER BY id"):
        keys = r.keys()
        try:
            only = json.loads(r["only"] or "[]") if "only" in keys else []
        except (ValueError, TypeError):
            only = []
        out.append({"name": (r["name"] if "name" in keys else "")
                    or KINDS.get(r["kind"], r["kind"]),
                    "kind": r["kind"],
                    "keychain_ref": r["keychain_ref"],
                    "scopes": json.loads(r["scopes"]),
                    # Which calendars or mailboxes, so the list can say what
                    # it is actually reading rather than implying all of it.
                    "only": only,
                    "reads": KINDS.get(r["kind"], r["kind"]),
                    "writes": r["kind"] in WRITES})
    return out


def add(store, kind: str, ref: str, only: list | None = None,
        name: str | None = None) -> dict:
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
    if kind in READS_A_FOLDER and ref.lower() not in ("local", "default"):
        # A folder that is not there is a source that adds cleanly and then
        # reads nothing — found at 04:00, by nobody. "local" means the Apple
        # app's own place and is checked when it is opened, not here.
        from pathlib import Path as _P
        folder = _P(ref).expanduser()
        if not folder.exists():
            return {"error": f"there is nothing at {ref}. Give a folder that "
                             f"exists, or 'local' for the Mac's own "
                             f"{'mailbox' if kind == 'maildir' else 'calendars'}."}
        if not folder.is_dir():
            return {"error": f"{ref} is a file. This wants the folder it is "
                             f"in — Blokk reads everything underneath."}
    if kind in WRITES_A_FOLDER and ref.lower() not in ("local", "default"):
        from pathlib import Path as _P
        folder = _P(ref).expanduser()
        if folder.exists() and not folder.is_dir():
            return {"error": f"{ref} is a file, not a folder to write into."}
        if not folder.exists() and not folder.parent.is_dir():
            return {"error": f"there is nothing at {folder.parent}, so "
                             f"{ref} cannot be created. Give a folder inside "
                             f"one that exists, or 'local' for ~/Blokk/Holds."}
    name = (name or "").strip().lower()
    if name and not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,30}", name):
        return {"error": "a name is lowercase letters, digits, - and _"}
    if name and store.one("SELECT 1 FROM credential WHERE name=?", name):
        return {"error": f"there is already a source called '{name}'"}
    name = name or name_for(store, kind, ref)
    chosen = [str(o).strip() for o in (only or []) if str(o).strip()]
    # A writer is recorded as one. scopes has said "read" on every row since
    # the first commit, which was true of every connector there was; putting
    # a writer in under the same word makes the column a decoration, and it
    # is the column that answers "what is this credential allowed to do".
    scopes = ["write"] if kind in WRITES else ["read"]
    store.x("""INSERT OR REPLACE INTO credential
               (id,name,kind,keychain_ref,scopes,only)
               VALUES(?,?,?,?,?,?)""",
            f"c_{name}", name, kind, ref, json.dumps(scopes),
            json.dumps(chosen))
    out = {"ok": True, "name": name, "kind": kind, "keychain_ref": ref,
           "scopes": scopes, "only": chosen}
    if chosen:
        out["note"] = ("Reading only " + ", ".join(chosen[:4])
                       + (f" and {len(chosen) - 4} more" if len(chosen) > 4
                          else "") + ". Nothing else in there is looked at.")
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
        egress.allow(store, host)
        out["egress"] = [host]
        out["note"] = (f"Blokk may now reach {host} — and nothing else new. "
                       f"What comes back is quarantined before anything "
                       f"reads it, and nothing in Blokk fetches it on its "
                       f"own: you ask, with peek.")
    if kind in IS_FIXED_HOST:
        from core import egress
        from core.connectors.caldav_cal import HOST as CAL_HOST
        egress.allow(store, CAL_HOST)
        out["egress"] = [CAL_HOST]
        out["note"] = (f"Blokk may now reach {CAL_HOST} — and nothing else "
                       f"new. Read-only: this makes PROPFIND and REPORT, and "
                       f"the gate will not make a method that writes.")
    if kind in IS_PLACE:
        # A source that leaves the machine is no use without permission to.
        # Adding it and then refusing every request it makes would be the
        # kind of silent half-state this codebase keeps having to fix.
        from core import egress
        from core.connectors.weather import HOSTS
        for host in HOSTS:
            egress.allow(store, host)
        out["egress"] = list(HOSTS)
        out["note"] = (f"Blokk may now reach {', '.join(HOSTS)} — and nothing "
                       f"else new. What leaves is a latitude and a longitude.")
    return out


def inside(kind: str, ref: str) -> dict:
    """What is in a source, before anything is wired to it.

    The names have always been discoverable — both local readers return them
    from check() — and nothing ever offered them as a choice, so wiring a
    calendar took the dentist along with the bookings and wiring a mailbox
    took somebody's whole private life.

    Read-only and wire-free on purpose: this is what a picker calls while a
    person is still deciding, so it must not create a credential, and it must
    answer fast enough to be a list appearing rather than a page hanging.
    """
    from pathlib import Path as _P
    if kind not in KINDS:
        return {"error": f"kind must be one of {', '.join(KINDS)}"}
    if kind not in READS_A_FOLDER:
        return {"kind": kind, "choosable": False, "found": [],
                "note": "This one is not a folder of things to pick from."}
    root = _P(ref).expanduser() if ref and ref.lower() not in (
        "local", "default") else None
    try:
        if kind == "ical":
            from core.connectors.ical import ROOT as CAL_ROOT, catalogue
            found = catalogue(root or CAL_ROOT)
            noun = "calendar"
        else:
            from core.connectors.emlx_mail import ROOT as MAIL_ROOT, catalogue
            found = catalogue(root or MAIL_ROOT)
            noun = "mailbox"
    except Exception as e:                                       # noqa: BLE001
        return {"error": f"{type(e).__name__}: {e}"[:200], "kind": kind,
                "choosable": True, "found": []}
    return {"kind": kind, "choosable": True, "noun": noun, "found": found,
            "note": ("Tick the ones Blokk should read. All of them "
                     "if you tick none." if found else
                     f"No {noun}s found there.")}


def remove(store, name: str) -> dict:
    # Read before the delete: for a web source the host to close is derived
    # from the ref, and after the DELETE there is nothing left to derive it
    # from.
    was = store.one("SELECT kind, keychain_ref FROM credential WHERE name=?",
                    name)
    if not was:
        known = ", ".join(r["name"] for r in listing(store)) or "nothing"
        return {"error": f"no source called '{name}'. Wired: {known}"}
    kind = was["kind"]
    store.x("DELETE FROM credential WHERE name=?", name)
    note = ("The keychain entry is untouched — delete it yourself if you "
            "meant to revoke access.")
    if kind in IS_URL:
        from urllib.parse import urlparse

        from core import egress
        host = (urlparse(was["keychain_ref"]).hostname or "").lower()
        # Only if nothing else still points at it. Two web sources on the
        # same host would otherwise take each other's permission away.
        others = [r["keychain_ref"] for r in store.q(
            "SELECT keychain_ref FROM credential WHERE kind='web'")]
        if host and not any(
                (urlparse(o).hostname or "").lower() == host for o in others):
            if not egress.disallow(store, host).get("error"):
                note = f"Nothing here can reach {host} now. " + note
    if kind in IS_FIXED_HOST:
        # Adding it opened the allowlist, so removing it closes it again —
        # only once nothing else still needs the host.
        from core import egress
        from core.connectors.caldav_cal import HOST as CAL_HOST
        left = store.q("SELECT kind FROM credential WHERE kind='caldav'")
        if not left and not egress.disallow(store, CAL_HOST).get("error"):
            note = f"Nothing here can reach {CAL_HOST} now. " + note
    if kind in IS_PLACE:
        # Adding the source opened the allowlist; removing it has to close it
        # again. A permission that is granted automatically and revoked only
        # by hand is a ratchet, and this codebase has already been bitten
        # once by exactly that shape in the trust ledger.
        from core import egress
        from core.connectors.weather import HOSTS
        still = {r["kind"] for r in store.q("SELECT kind FROM credential")}
        if not still & set(IS_PLACE):
            gone = [h for h in HOSTS
                    if not egress.disallow(store, h).get("error")]
            if gone:
                note = f"Nothing here can reach {', '.join(gone)} now. " + note
    return {"ok": True, "name": name, "kind": kind, "detail": note}


# Words that are in every message and carry no query. Not a linguistics
# list — the point is only that "the Shaws" must not match every row that
# contains "the", which is what "count the query words present" did: on that
# rule the garden gate and the wrong invoice both scored as hits and one of
# them was handed to the model as the answer.
STOP = frozenset((
    "the", "and", "for", "you", "your", "our", "are", "was", "were", "with",
    "that", "this", "have", "has", "had", "not", "but", "can", "will",
    "would", "from", "about", "any", "all", "please", "thanks", "hi",
    "hello", "dear", "regards", "there", "their", "them", "they", "she",
    "him", "her", "his", "its", "just", "get", "got", "one", "out", "who",
    "what", "when", "where", "how", "did", "does", "been", "into", "over",
))
WORD = re.compile(r"[a-z0-9']+")
# A field's words are worth more than a body's: a name in the subject line
# is what the message is about, the same name in a signature is not.
FIELD_WEIGHT = (("subject", 3), ("summary", 3), ("from", 3),
                ("mailbox", 1), ("calendar", 1),
                ("body", 1), ("at", 1), ("date", 1), ("start", 1))
PREFIX_MIN = 4          # "Shaw" may match "Shaws"; "art" may not match "start"


def _nearness(row: dict) -> float:
    """How far this row is from today, in days. Bigger is further.

    The tiebreak between two equally good matches used to be the row's
    position in the list, on the assumption that the reader gives newest
    first. Mail does; a calendar gives oldest first, so on a diary the
    tiebreak quietly preferred the oldest — "when did the Shaws last stay"
    answered with the visit before last.

    Distance from today rather than recency, because a diary holds both
    directions: the nearest booking is the one being asked about, whether
    it is next month or last March.
    """
    from datetime import date as _d, datetime as _dt
    raw = str(row.get("at") or row.get("date") or row.get("start") or "")
    if not raw:
        return 10 ** 6
    when = None
    try:
        when = _dt.fromisoformat(raw[:19]).date()
    except ValueError:
        try:
            import email.utils as _eu
            parsed = _eu.parsedate_to_datetime(raw)
            when = parsed.date() if parsed else None
        except (TypeError, ValueError, IndexError):
            when = None
    if when is None:
        return 10 ** 6
    return abs((when - _d.today()).days)


def _score(row: dict, wanted: list[str], phrase: str) -> float:
    """How well one row answers the query. 0 means it does not.

    Three things the old rule got wrong, each of which put the wrong email
    in front of a model as if it were the answer:

      * it counted stopwords, so "the Shaws" matched every row with "the";
      * it matched substrings, so "art" matched "Start of season";
      * it weighted every field the same, so a name in a signature counted
        as much as a name in the subject line.

    A prefix still counts, from four characters — "Shaw" and "Shaws" are the
    same query and no rule about exact words should say otherwise — but only
    forwards, so "art" does not reach inside "start".
    """
    total = 0.0
    hit = set()
    for field, weight in FIELD_WEIGHT:
        text = str(row.get(field) or "").lower()
        if not text:
            continue
        words = set(WORD.findall(text))
        for w in wanted:
            if w in words:
                total += weight
                hit.add(w)
            elif len(w) >= PREFIX_MIN and any(
                    x.startswith(w) or w.startswith(x) and len(x) >= PREFIX_MIN
                    for x in words):
                total += weight * 0.6
                hit.add(w)
        # The whole query, contiguous, in one field. "the Shaws" as typed
        # beats the two words scattered through a long thread, and it is
        # the one case where a stopword earns its place.
        if phrase and len(phrase) >= 5 and phrase in text:
            total += weight * 2
    if not hit:
        return 0.0
    # Every word found is worth more than one word found three times: two
    # matches out of two is an answer, six of one is a coincidence.
    return total * (len(hit) / len(wanted))


# How far back a search goes when nobody says. peek's window is sixty days
# because it answers "can Blokk see my mail"; a search answers "what did the
# Shaws say", and the Shaws wrote in March. A search that quietly stops at
# sixty days does not say "I did not look" — it says "nothing", which is a
# confident wrong answer on the one question somebody came here to ask.
FIND_DAYS = 730
FIND_SCAN = 4000           # rows pulled before matching, per search


def find(store, name: str, term: str, days: int = FIND_DAYS,
         limit: int = 12) -> dict:
    """Look for words in what a source actually holds, not just its recent rows.

    Separate from peek() because the two answer different questions. peek is
    "show me what Blokk can see", so it takes a narrow window and shows the
    newest of it. This is "find the one about the dog", so it takes a wide
    one, matches, and — the part that matters — reports what it searched even
    when it finds nothing.

    Every row is untrusted text from outside and carries its quarantine
    verdict, exactly as it does through peek. Searching does not make a
    stranger's mail any less a stranger's.
    """
    from datetime import datetime, timedelta
    from core.connectors import wire, read_since
    from core.harness import quarantine_read

    raw = (term or "").lower()
    words = WORD.findall(raw)
    wanted = [w for w in words if w not in STOP and len(w) >= 2]
    if not wanted:
        # All stopwords is not a search. Refusing beats returning everything
        # that contains "the" and letting a model read that as the answer.
        return {"error": ("a search needs a word to look for"
                          if not words else
                          f"{term!r} is only common words \u2014 nothing to "
                          f"look for in it"),
                "fix": "Say what to look for — a name, a place, a date."}
    c = wire(store).get(name)
    if c is None:
        wired = ", ".join(sorted(wire(store).all())) or "nothing"
        return {"error": f"there is no source called '{name}'",
                "fix": f"Wired: {wired}."}

    days = max(1, min(int(days or FIND_DAYS), 3650))
    rows, window = [], f"the last {days} days"
    fn = getattr(c, "search_since", None) or getattr(c, "since", None)
    try:
        if fn:
            now = datetime.now()
            rows = read_since(fn, now - timedelta(days=days), now, FIND_SCAN)
        elif getattr(c, "events", None):
            # Both directions. A calendar read forward-only answers "when
            # did the Shaws last stay" with nothing found, which reads as
            # never rather than as never looked — and most questions about
            # a diary are about what happened, not what is coming.
            import inspect as _i
            try:
                takes_back = "back" in _i.signature(c.events).parameters
            except (TypeError, ValueError):
                takes_back = False
            if takes_back:
                rows = c.events(days=days, back=days)
                window = f"the {days} days either side of today"
            else:
                rows = c.events(days=days)
                window = f"the next {days} days"
        else:
            return {"error": f"'{name}' cannot be searched",
                    "fix": "It answers specific questions rather than "
                           "holding a list of things with words in them."}
    except Exception as e:                                        # noqa: BLE001
        # A source that cannot be read must not come back as "no matches".
        return {"error": f"{type(e).__name__}: {e}"[:200], "readable": False,
                "fix": "The source is wired but not answering."}

    rows = list(rows)
    hits = []
    for i, r in enumerate(rows):
        sc = _score(r, wanted, raw.strip())
        if sc:
            hits.append((sc, _nearness(r), i, r))
    # Best match first, then nearest to today, then whatever order the
    # reader gave — so the sort is total and two runs agree.
    hits.sort(key=lambda x: (-x[0], x[1], x[2]))

    out = []
    best = hits[0][0] if hits else 0
    for sc, _near, _i, r in hits[:limit]:
        body = r.get("body") or r.get("summary") or ""
        q = quarantine_read(body)
        out.append({"from": r.get("from") or r.get("start", ""),
                    "subject": r.get("subject") or r.get("summary", ""),
                    "when": r.get("at") or r.get("date") or r.get("start", ""),
                    "where": (r.get("mailbox") or r.get("calendar")
                              or r.get("place") or ""),
                    "provenance": r.get("provenance", "untrusted"),
                    "instruction_like": bool(q["instruction_like"]),
                    # How well this one answered, relative to the best. A
                    # list of rows with no strength on them reads as a list
                    # of answers, and the fourth-best match for "the Shaws"
                    # is not an answer — it is the thing a model quotes
                    # confidently when the real one was never in the window.
                    "match": ("strong" if sc >= best * 0.75 else
                              "partial" if sc >= best * 0.4 else "weak"),
                    "body": body[:600].strip()})
    # Searched is not the same as found, and the difference is the whole
    # answer when a search comes back empty. "Nothing" on its own invites
    # "there is no such email"; "nothing in 1,240 messages back to March"
    # invites "look further back", which is the true next step.
    return {"ok": True, "term": term, "window": window,
            "searched": len(rows), "found": len(hits), "rows": out,
            "ignored": sorted(set(words) - set(wanted)) or None,
            "capped": len(rows) >= FIND_SCAN}


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
    if "sent_today" in state:
        return (f"{state.get('from', '?')} via {state.get('host', '?')} — "
                f"{state['sent_today']} sent today. Logged in and hung up; "
                f"nothing was sent by this check.")
    if "waiting" in state and "folder" in state:
        n = state["waiting"]
        return (f"{state['folder']} \u2014 "
                + (f"{n} hold(s) waiting to be opened" if n
                   else "writable, nothing waiting"))
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
        keys = r.keys()
        label = (r["name"] if "name" in keys else "") or KINDS[r["kind"]]
        c = reg.get(label)
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


def _fix_for(name: str, state: dict) -> str:
    """What to actually do about this failure, for this kind of source.

    Written as a lookup on what went wrong rather than one sentence for
    everything, because the two failures look identical from here and have
    nothing in common: a local reader that cannot see a folder is a
    permission, and a web API that will not answer is a quota, a network or
    a host being down.
    """
    detail = str(state.get("detail") or "")
    low = detail.lower()
    if "429" in detail or "too many requests" in low or "rate" in low:
        return ("That is the far end refusing on volume, not anything wrong "
                "here. It usually clears on its own — the message above says "
                "when.")
    if any(k in low for k in ("refused", "not on the allowlist",
                              "allowlist", "http", "resolve", "timed out",
                              "certificate")):
        return ("This one leaves the machine, so it is the network or the "
                "far end. connect.py egress log shows every request and how "
                "it went.")
    if name in ("mail", "calendar", "messages", "holds"):
        return ("connect.py local, or Menu › Sources › On this Mac, says "
                "whether this is a permission or an empty folder.")
    return "connect.py test shows what each wired source can and cannot do."


# The keys peek's normalisation derives for itself. Everything below is
# about what happens to the ones it does not.
_DERIVED = frozenset((
    "from", "subject", "at", "where", "provenance", "instruction_like",
    "body", "start", "date", "mailbox", "calendar", "place", "summary",
))

# A measurement crosses on its own. This used to be a tuple of five field
# names — label, high_c, low_c, rain_chance, wind_kph — which fixed the
# forecast and fixed nothing else: a connector adding a sixth had to
# remember to append to a tuple in a different file, and if it did not, its
# numbers silently became prose again. That is the bug with a plaster on it,
# not the bug fixed.
#
# The rule instead of the list: **a number cannot carry an instruction.**
# That is the same reasoning invariant 3 already rests on — hand a small
# model a paragraph from a stranger and it paraphrases it, hand it numbers
# and it can say something true — so a number needs no permission to cross
# and free text needs quarantine.
#
# bool is deliberately in and str is deliberately out. `True` says nothing
# a stranger wrote; a string is where an instruction lives, and one that
# crossed here would reach a prompt without passing quarantine_read.
_MEASURED = (int, float, bool)


def _carried(conn) -> frozenset:
    """String fields a connector says are safe to carry, and why it may.

    A `label` like "light rain" is this project's own word out of a fixed
    table in weather.py, not text the far end chose — so it can cross where
    arbitrary prose cannot. The connector declares it, because the connector
    is the only thing that knows where its own strings come from. Anything
    not declared is treated as prose and left in `body`, where quarantine
    has already seen it.

    What this cannot check is whether a connector is *right* about its own
    strings. Declaring a field that actually came off the wire would carry a
    stranger's sentence past quarantine, and no probe here can tell the two
    apart — the difference lives in the connector's source, not in the
    value. So CARRY is deliberately opt-in, deliberately per-field, and
    deliberately short: an empty default means the failure mode of
    forgetting is a number that does not cross, not a sentence that does.
    """
    got = getattr(conn, "CARRY", ())
    try:
        return frozenset(str(x) for x in got)
    except TypeError:
        return frozenset()


def peek(store, name: str, n: int = 5) -> dict:
    """What it would actually read. Nothing is written, nothing marked read.

    Every body here is untrusted text from outside, so it goes through
    quarantine_read and carries its verdict. Whatever renders this must
    escape it: it is the one place the product deliberately shows you a
    stranger's words.
    """
    from core.connectors import wire
    from core.harness import quarantine_read
    c = wire(store).get(name)
    if c is None:
        wired = ", ".join(sorted(wire(store).all())) or "nothing"
        return {"error": f"there is no source called '{name}'",
                "fix": f"Wired: {wired}."}

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
                #
                # The fix has to match the failure. This said "connect.py
                # local, or Menu › Sources › On this Mac, says whether
                # this is a permission or an empty folder" for *every* kind
                # of source — so a rate-limited weather API came back
                # telling somebody to go and check Full Disk Access. A
                # confidently wrong instruction is worse than none: it costs
                # whoever follows it the ten minutes before they work out it
                # was never going to help.
                return {"error": state.get("detail", "nothing readable"),
                        "readable": False, "state": state,
                        "fix": _fix_for(name, state)}
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
        # Which place, in the window, so every answer built from these rows
        # says where it is for. A forecast is the one source whose rows carry
        # nothing identifying: "clear, 11–19°C" reads exactly the same for
        # the town you meant and the one three thousand miles away that the
        # geocoder picked because the name was ambiguous. Naming it is what
        # makes a wrong one visible.
        where = ""
        try:
            where = str((state or {}).get("place")
                        or (c.where() or {}).get("place") or "")
        except Exception:                                        # noqa: BLE001
            where = ""
        # However many were asked for. This was pinned at five whatever `n`
        # said, so "what is it doing this week" could not be answered with a
        # week even though the connector would happily return one.
        span = max(1, min(int(n or 5), 16))
        window = f"the next {span} days{f' in {where}' if where else ''}"
        # The numbers travel as numbers. They used to be flattened into a
        # sentence in `body` and nowhere else, so anything downstream that
        # wanted to reason about rain had a string to re-parse and did not
        # try — which is how "will it rain this week" came back "it looks
        # dry" over a day at 85%. A confidently wrong answer about the
        # weather is worse than no weather at all, and this is the whole of
        # why the connector returns fields rather than prose in the first
        # place: flattening them here threw that away one layer later.
        # The connector's row, then the three keys this branch derives. It
        # used to re-list every field by name, which is the same whitelist
        # the normaliser below had and one layer earlier: a connector adding
        # a measurement had to be edited into *two* files, and until it was,
        # its numbers never reached the normaliser to be judged at all. The
        # rule about what may cross belongs in one place, and this is not
        # that place — so nothing is decided here, everything is passed on.
        rows = [{**d,
                 "from": d["date"], "subject": d["summary"],
                 # One key, read by the normaliser below alongside mailbox
                 # and calendar. It carried two — `place` and a `calendar`
                 # alias — and either alone was enough, so removing one
                 # changed nothing and a probe could not tell.
                 "place": where,
                 # .get, not [], now that the row is passed through rather
                 # than rebuilt: this branch is reached by anything with a
                 # forecast() and it no longer controls what that returns.
                 # A connector without a wind figure would have raised
                 # KeyError here and taken the whole peek with it.
                 "body": f"high {d.get('high_c')}°C, low {d.get('low_c')}°C, "
                         f"rain {d.get('rain_chance')}%, "
                         f"wind {d.get('wind_kph')} km/h"}
                for d in c.forecast(days=span)]
    elif getattr(c, "gaps", None):
        # The sample calendar answers "which nights are free" and nothing
        # else. Show that rather than an empty list with no explanation.
        window = "free nights in the next 90 days"
        rows = [{"from": g["from"], "subject": g["note"], "provenance": "self"}
                for g in c.gaps(days=90)]
    elif getattr(c, "hold", None):
        # The writer. Peeking at it means "what is sitting in that folder
        # waiting for me to double-click it" — which is the one question
        # somebody has about a folder they cannot see from here, and it is
        # answered by check() rather than by reading any of the files.
        window = "waiting in the holds folder"
        rows = [{"from": f, "subject": "not in Calendar until you open it",
                 "provenance": "self"}
                for f in (state or {}).get("files", [])]
    else:
        return {"error": f"'{name}' has nothing to peek at",
                "readable": True, "window": "",
                "fix": "This connector answers specific questions rather "
                       "than listing. Nothing is wrong with it."}
    rows = list(rows)[:n]
    carry = _carried(c)
    out = []
    for r in rows:
        body = r.get("body") or r.get("summary") or ""
        q = quarantine_read(body)
        out.append({"from": r.get("from") or r.get("start", ""),
                    "subject": r.get("subject") or r.get("summary", ""),
                    # When it arrived, carried through. It was dropped here,
                    # so every row the panel and the chat saw was undated —
                    # and a model with today's date in its prompt still could
                    # not answer "when did they write", on data where the
                    # connector knew all along.
                    "at": r.get("at") or r.get("date") or r.get("start", ""),
                    "where": (r.get("mailbox") or r.get("calendar")
                              or r.get("place") or ""),
                    "provenance": r.get("provenance", "?"),
                    "instruction_like": bool(q["instruction_like"]),
                    "body": body[:400].strip(),
                    # Whatever the row measured, kept as a measurement.
                    # This shape was a fixed set of strings, so a forecast's
                    # rain chance survived only inside the sentence in
                    # `subject` — and anything that wanted to answer "will it
                    # rain" had prose to re-parse. It did not, and said
                    # "looks dry" over a day at 85%. Fields the row does not
                    # have stay absent rather than arriving as None, so
                    # "no figure came back" and "0%" stay different answers.
                    **{k: v for k, v in r.items()
                       if k not in _DERIVED and v is not None
                       and (isinstance(v, _MEASURED) and not isinstance(v, str)
                            or k in carry)}})
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
