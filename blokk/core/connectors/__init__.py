"""
Connectors.

The contract, and the reason it's shaped like this:

  * A connector NEVER holds a secret. It is handed a resolved credential by
    the control plane at call time. The database stores a keychain_ref, not
    a password, so `cat blokk.db | strings` gets you nothing.

  * A connector is read-only unless it declares `writes = True`, and a
    writing connector is only ever called from inside
    ctx.activity(..., side_effect=True) so the call carries an idempotency
    key and lands in the journal.

  * Reads return plain dicts. No connector returns prose. Anything that came
    from outside your control — an email body, a web page — is handed to
    quarantine_read before it can reach a model.

  * Search, don't list. Every read takes a filter and a limit. An agent that
    pulls 340 messages to find one has spent its context and, on a
    memory-bound box, another worker's cache.

Order of adoption matters more than which one you start with:

    1. read-only, for a fortnight, with nothing wired to a write path
    2. read the logs. Look at what it actually pulled and how much
    3. only then let a category start proposing

Registered connectors are resolved per workspace, so Cottages cannot reach
Business two's mailbox even if something asks it to — the credential simply
is not in scope.
"""
from __future__ import annotations

import json

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol


class Connector(Protocol):
    kind: str
    writes: bool

    def check(self) -> dict:
        """Prove the credential works and say what it can see.

        Run by `python3 connect.py test`. A connector that cannot answer this
        has no business being in a nightly sweep.
        """
        ...


def conversation_before(reader, who: str, this_body: str = "",
                        limit: int = 8) -> list[dict]:
    """What was said before this message, oldest first.

    A text saying "Washing ?" is a reply. Read on its own it is
    unanswerable, and the sweep answered it the only way it could — by
    asking the sender what they meant, which is the question a person would
    not have had to ask. Every message was triaged and drafted from itself
    with nothing in front of it.

    The three readers disagree about what a thread is, so this asks each in
    its own terms and hands back one shape:

      * Messages has `thread_with`, which returns both sides — the half
        somebody sent *and the half you sent*, which is the part that
        actually explains a one-word reply;
      * mail has no threading, so the sender's own recent messages are the
        best available answer and are labelled as that;
      * anything else has no conversation and says so by returning nothing.

    Every line comes back carrying provenance. Your own words are `self`;
    theirs stay untrusted, because an instruction planted three messages ago
    is exactly as dangerous as one planted in this one, and widening the
    window is what makes that worth saying.
    """
    if not who or reader is None:
        return []
    rows: list = []
    try:
        if hasattr(reader, "thread_with"):
            rows = list(reader.thread_with(who, limit=limit + 4) or [])
        elif hasattr(reader, "search_since"):
            from datetime import datetime, timedelta
            now = datetime.now()
            found = read_since(reader, now - timedelta(days=120), now, 200)
            key = _address(who)
            rows = [r for r in (found or [])
                    if key and key in _address(str(r.get("from") or ""))]
    except Exception:                                            # noqa: BLE001
        # A reader that cannot answer costs this message its context, not
        # the sweep. It still gets triaged, just as blind as before.
        return []

    out = []
    for r in rows:
        body = " ".join(str(r.get("body") or r.get("text") or "").split())
        if not body:
            continue
        # The message being answered is not context for itself.
        if this_body and body[:120] == " ".join(str(this_body).split())[:120]:
            continue
        mine = str(r.get("from") or "").lower() in ("you", "me", "self")
        out.append({"from": "you" if mine else who,
                    "when": str(r.get("at") or r.get("date") or "")[:64],
                    "body": body[:600],
                    "provenance": "self" if mine else "untrusted"})
        if len(out) >= limit:
            break
    # Oldest first: a conversation read backwards is not a conversation.
    return list(reversed(out))


def _address(value: str) -> str:
    """The bit of a From that identifies somebody — an address or a number."""
    import re as _re
    m = _re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+", str(value or ""))
    if m:
        return m.group(0).lower()
    digits = _re.sub(r"[^0-9]", "", str(value or ""))
    return digits[-9:] if len(digits) >= 7 else ""


def read_since(fn, since, now, limit: int = 50) -> list:
    """Call a reader with the window it understands.

    The three readers disagree about how to say "recent": LocalMail counts
    days or an ISO hour string, IcloudMail counts hours, Messages counts
    hours, the sample world wants a positional string. Calling them all the
    same way meant a TypeError on one and a silent twelve-hour window on the
    rest — and twelve hours of a quiet mailbox is indistinguishable from an
    empty one.

    `since` and `now` are passed in rather than read from the clock, because
    one of the two callers is a workflow and workflows do not get a clock.
    """
    import inspect
    import math
    try:
        args = inspect.signature(fn).parameters
    except (TypeError, ValueError):                    # a builtin, or a mock
        args = {}
    kw: dict = {}
    if "limit" in args:
        kw["limit"] = limit
    # Ceiling of the real gap, not floor-plus-one. The fudge turned a
    # twenty-four hour window into twenty-five hours, and then the day
    # rounding turned that into two days — so every nightly sweep re-read
    # the whole of the previous night, triaged it again, and spent a second
    # night's tokens doing it.
    secs = max(1.0, (now - since).total_seconds())
    if "days" in args:
        kw["days"] = max(1, math.ceil(secs / 86400))
    elif "hours" in args:
        kw["hours"] = max(1, math.ceil(secs / 3600))
    elif "hour" in args:
        kw["hour"] = since.strftime("%Y-%m-%dT%H")
    return list(fn(**kw))


def free_windows(busy, days: int, day_start: int, day_end: int,
                 min_hours: float, now) -> list[dict]:
    """Daylight hours with nothing in them, given the hours that are taken.

    Pure, and shared: the real calendar and the sample world must not each
    have their own idea of what "free on Saturday morning" means, or the
    demo teaches something the Mac does not do.

    `busy` is (start, end) local datetimes. `now` is passed in rather than
    read, so this can be tested at a fixed hour.
    """
    from datetime import time as _time, timedelta as _td
    out = []
    for i in range(max(1, int(days))):
        d = (now + _td(days=i)).date()
        # A window that has already passed is not an offer. Told at 18:00
        # that you are free from 09:00 is the same class of wrong answer as
        # an empty calendar on a Mac with a full diary.
        free = [(max(datetime.combine(d, _time(day_start)), now),
                 datetime.combine(d, _time(day_end)))]
        for bs, be in busy:
            cut = []
            for fs, fe in free:
                if be <= fs or bs >= fe:
                    cut.append((fs, fe))
                    continue
                if bs > fs:
                    cut.append((fs, min(bs, fe)))
                if be < fe:
                    cut.append((max(be, fs), fe))
            free = cut
        for fs, fe in free:
            hours = (fe - fs).total_seconds() / 3600
            if hours >= min_hours:
                out.append({"date": d.isoformat(), "day": d.strftime("%A"),
                            "from": fs.strftime("%H:%M"),
                            "to": fe.strftime("%H:%M"),
                            "hours": round(hours, 1),
                            # Your own calendar: not external, not
                            # quarantined — and no summary leaves with it.
                            "provenance": "self"})
    return out


@dataclass
class Registry:
    """Which connectors a workspace may use. Scope is data, not prompt."""

    _by_ws: dict[str, dict[str, Any]] = field(default_factory=dict)

    def add(self, workspace_id: str, name: str, conn: Any) -> None:
        self._by_ws.setdefault(workspace_id, {})[name] = conn

    def get(self, workspace_id: str, name: str) -> Any | None:
        return self._by_ws.get(workspace_id, {}).get(name)

    def for_workspace(self, workspace_id: str) -> dict[str, Any]:
        return dict(self._by_ws.get(workspace_id, {}))

    def describe(self) -> list[dict]:
        return [
            {"workspace": ws, "name": n, "kind": c.kind,
             "writes": getattr(c, "writes", False)}
            for ws, m in self._by_ws.items() for n, c in m.items()
        ]


REGISTRY = Registry()


def _root(ref: str):
    """A folder to read, or None for the app's own place on this Mac.

    "local" is the word connect.py has always used for "wherever the Apple
    app keeps it". Anything else is a path.
    """
    ref = (ref or "").strip()
    return None if ref.lower() in ("", "local", "default") else ref


def wire(store) -> Registry:
    """Build the registry from the credential table.

    Anything without a credential row falls back to the fake world, so a
    half-configured install still runs end to end instead of erroring at
    04:00 with nobody watching.
    """
    from core.connectors.fake import WORLD as FAKE

    for row in store.q("SELECT * FROM credential"):
        ws, kind, ref = row["workspace_id"], row["kind"], row["keychain_ref"]
        # Which calendars, or which mailboxes. Absent on a row written before
        # the column existed, which means all of them — the same thing every
        # wiring meant then.
        try:
            only = json.loads(row["only"] or "[]") if "only" in row.keys() else []
        except (ValueError, TypeError):
            only = []
        try:
            if kind == "imap":
                from core.connectors.imap_mail import IcloudMail
                REGISTRY.add(ws, "mail", IcloudMail(ref))
            elif kind == "caldav":
                # The store and the workspace, so its requests can go
                # through core/egress.py like everything else that leaves.
                from core.connectors.caldav_cal import IcloudCalendar
                REGISTRY.add(ws, "calendar",
                             IcloudCalendar(ref, store=store, workspace_id=ws))
            elif kind == "maildir":
                # ref is "local" for the Mac's own archive, or a folder. Both
                # connectors have taken a root since they were written and
                # nothing ever passed one, so a mailbox exported to disk, a
                # second Mail location or a shared calendar directory could
                # not be wired at all — the source added fine and then read
                # somewhere else.
                from core.connectors.emlx_mail import LocalMail
                REGISTRY.add(ws, "mail",
                             LocalMail(root=_root(ref), only=only))
            elif kind == "ical":
                from core.connectors.ical import LocalCalendar
                REGISTRY.add(ws, "calendar",
                             LocalCalendar(root=_root(ref), only=only))
            elif kind == "smtp":
                # The only connector that reaches another person. Handed the
                # store and the workspace because its daily cap is counted
                # from that workspace's own approvals — a rate limit that is
                # global is a rate limit one busy business spends for four.
                from core.connectors.smtp_mail import Smtp
                REGISTRY.add(ws, "send",
                             Smtp(ref, store=store, workspace_id=ws))
            elif kind == "ics_out":
                # The one writer. Registered like any other connector, and
                # reached only from an approved action — nothing in a sweep
                # or a chat turn calls it directly.
                from core.connectors.ics_out import IcsDrop
                REGISTRY.add(ws, "holds", IcsDrop(ref))
            elif kind == "messages":
                from core.connectors.messages import AppleMessages
                REGISTRY.add(ws, "messages", AppleMessages())
            elif kind == "web":
                # Handed the store and the workspace for the same reason as
                # weather: those two are what core/egress.py needs to answer
                # "may this workspace talk to that host".
                from core.connectors.web import Web
                REGISTRY.add(ws, "web", Web(ref, store=store, workspace_id=ws))
            elif kind == "weather":
                # The only connector that reaches off the machine, so it is
                # the only one handed the store and the workspace: both are
                # what core/egress.py needs to answer "may this workspace
                # talk to that host".
                from core.connectors.weather import Weather
                REGISTRY.add(ws, "weather",
                             Weather(ref, store=store, workspace_id=ws))
        except Exception as e:                                   # noqa: BLE001
            # A broken connector must not take the sweep with it. Log and
            # fall through to the fake, so the other four still run.
            print(f"[blokk] {ws}/{kind} unavailable: {e}")

    # The sample world fills gaps, but only for the sample workspaces, and
    # only while they still exist. Registering it unconditionally meant that
    # deleting "cottages" and later creating a real workspace with that name
    # handed it invented guests for anything not yet wired — fake data
    # appearing inside real data, which is the one place it must never be.
    live = {w["id"] for w in store.q("SELECT id FROM workspace WHERE active=1")}
    for ws, world in FAKE.items():
        if ws not in live:
            continue
        for name, obj in world.items():
            if obj is not None and REGISTRY.get(ws, name) is None:
                REGISTRY.add(ws, name, obj)
    return REGISTRY
