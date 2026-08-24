"""What Blokk may do to itself, and the only place that says so.

Ask cannot write. That is invariant 2 and it has not changed: `core/ask.py`
has no executor in it and no way to reach one. What Ask can do is *propose* —
it writes one undecided row into the approval queue, and a person decides.
This file is the other half: given an approved row, what actually runs.

So the shape is:

    Ask                -> proposes {name, args}, validated here, into approval
    a person           -> approves, edits or rejects it, in the queue
    api/server.py      -> on approve only, calls run() below

Three rules hold the whole thing up.

**Nothing here reaches another person.** Almost every action operates on
Blokk itself: its workspaces, its sources, its allowlist, its schedule, its
backups. The one exception is `hold_dates`, which writes a .ics file into a
folder on this Mac — outside the database, but not off the machine and not to
anybody. Nothing is addressed, nothing is sent, and no guest learns anything.

There is still no send. Sending needs a connector that does not exist yet and
it will arrive the same way as everything else — behind this queue — not
through the chat box. An agent that can talk to your guests is a different
product with a different risk, and it is not one you get by accident.

**The arguments are validated here, not trusted from the model.** A proposal
arrives as JSON that a language model wrote after reading, among other
things, a stranger's email. It is treated exactly like a form submission from
the internet: every field checked against what it is allowed to be, and
anything unrecognised refused with a sentence rather than passed along.

**Some of them never graduate.** The trust ledger can earn a category the
right to act alone. Opening a hole in the egress allowlist, deleting a
workspace and removing a source are pinned to manual for the same reason a
cottage access question is: the cost of being wrong does not scale with how
often you have been right.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Callable

ID = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
# A name with at least one dot and nothing that belongs in a URL. Deliberately
# not a URL parser: core/egress.py does the real work of deciding what may be
# reached, and this only has to stop a sentence being built around nonsense.
HOSTNAME = re.compile(r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                      r"(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", re.I)
MAX_NIGHTS = 60           # see the length check in validate()
CLOCK = re.compile(r"^\s*(\d{1,2})\s*(?::\s*([0-5]\d))?\s*([ap])\.?m\.?\s*$", re.I)


def _day():
    from datetime import timedelta
    return timedelta(days=1)


def _ord(n: int) -> str:
    """1st, 2nd, 3rd, 11th. The teens are the whole reason this exists."""
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }".replace(
        " ", "")


def _as_time(v: str) -> str:
    """6pm, 6:30 PM, 06:30 — all of them, as HH:MM."""
    m = CLOCK.match(v)
    if not m:
        return v.strip()
    h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "p" else 0)
    return f"{h:02d}:{m.group(2) or '00'}"


class _Gap(dict):
    def __missing__(self, key):
        return "\u2026"


class Rejected(Exception):
    """The proposal is not something that can be run. Carries a sentence."""


@dataclass
class Action:
    name: str
    summary: str                      # a sentence, with {args} in it
    args: tuple[str, ...] = ()
    optional: tuple[str, ...] = ()
    pinned: bool = False              # never graduates to acting alone
    category: str = "blokk_admin"     # the trust bucket it counts toward
    run: Callable[..., dict] = field(default=lambda **kw: {})
    # An optional sentence-builder, for the actions whose arguments are
    # jargon. "Wire maildir into cottages, reading local" is accurate and
    # means nothing to the person whose thumb is over Approve, and that
    # sentence is the entire decision they are being asked to make.
    phrase: Callable[[dict], str] | None = None

    def preview(self, args: dict) -> str:
        if self.phrase is not None:
            try:
                return self.phrase(args)
            except Exception:                                    # noqa: BLE001
                pass
        try:
            return self.summary.format(**args)
        except KeyError:
            return self.summary

    def sketch(self, args: dict) -> str:
        """The same sentence with the holes still in it.

        For saying "I can do this much, and here is the bit I am missing",
        which is a better answer than either guessing the bit or pretending
        the request was a question about something else.
        """
        return self.summary.format_map(_Gap(args))


# ────────────────────────────────────────────────────────────── the executors
# Each one is a thin call into the same core/ module the CLI and the GUI use.
# Nothing new is implemented here: if connect.py cannot do it, neither can a
# proposal, which keeps the three surfaces honest about being one system.
def _sweep(store, **_):
    """The same sweep the button starts, not a second implementation.

    The import points the wrong way — core reaching into api — and that is
    deliberate. sweep_all() owns one rule this cannot duplicate: a sweep is a
    daily event, keyed by the day, so the Mac and the phone both pressing it
    at 04:00 start one run per workspace and not two. A copy of that rule
    living here would be a second opinion about whether today was already
    swept, and the two would eventually disagree. force=True because a person
    has just approved it by name, which is the manual override.
    """
    from api import server
    out = server.sweep_all(force=True)
    n = len(out.get("started", []))
    return {"ok": True, "detail": f"sweeping {n} workspace"
            f"{'' if n == 1 else 's'}", **out}


def _backup(store, **_):
    from core import backup
    out = backup.make(store.path)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": f"backup written to {out.get('path')}", **out}


def _schedule(store, at, **_):
    from core import nightly
    try:
        value = nightly.set_at(store, at)
    except ValueError as e:
        # set_at refuses an unparseable time rather than storing it, and its
        # sentence already names the shape it wanted.
        raise Rejected(str(e)) from e
    return {"ok": True, "at": value,
            "detail": (f"the night shift now runs at {value}" if value
                       else "the night shift is off")}


def _add_source(store, workspace, kind, ref, **_):
    from core import sources
    out = sources.add(store, workspace, kind, ref)
    if out.get("error"):
        raise Rejected(out["error"])
    # The same sentence the proposal was approved under, so what it says it
    # did matches what it said it would do. "maildir added to cottages" is
    # neither.
    return {"ok": True, **out,
            "detail": out.get("note")
            or ACTIONS["add_source"].preview(
                {"workspace": workspace, "kind": kind, "ref": ref})}


def _remove_source(store, workspace, kind, **_):
    from core import sources
    out = sources.remove(store, workspace, kind)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, **out}


def _egress_allow(store, workspace, host, **_):
    from core import egress
    out = egress.allow(store, workspace, host)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _egress_deny(store, workspace, host, **_):
    from core import egress
    out = egress.disallow(store, workspace, host)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _add_workspace(store, workspace, name=None, **_):
    from core import sources
    out = sources.workspace_add(store, workspace, name or workspace)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": f"workspace {workspace} added", **out}


def _remember(store, workspace, note, **_):
    """A standing instruction, taught rather than inferred.

    Memory could only fill from corrections: you edited three drafts the same
    way and a rule was derived. That works and it is slow, and it cannot
    learn anything you have not already watched it get wrong — "the key safe
    is on the back door, not the porch" is not a correction to a draft, it is
    something you know.

    Confidence is fixed at 0.9 and deliberately below certainty. You said it
    once; a derived rule with five corrections behind it earns 0.94 and
    should outrank it. Nothing here is retired automatically, because a
    person's own words are not evidence that expires.
    """
    from core.harness import MIN_CONFIDENCE
    note = " ".join(note.split())
    if len(note) < 4:
        raise Rejected("that is too short to be worth remembering")
    fid = "f_told_" + hashlib.sha256(
        f"{workspace}:{note.lower()}".encode()).hexdigest()[:10]
    already = store.one("SELECT id FROM fact WHERE id=?", fid)
    store.x("""INSERT OR REPLACE INTO fact
               (id,workspace_id,text,confidence,source_episodes,retired_at)
               VALUES(?,?,?,?,'[]',NULL)""",
            fid, workspace, note, max(0.9, MIN_CONFIDENCE))
    return {"ok": True, "id": fid,
            "detail": ("that was already remembered, and is again"
                       if already else f"remembered, for {workspace}")}


def _forget(store, workspace, note, **_):
    """Retire what it knows, by what it says.

    Matched on the text because that is what a person can see. They are
    reading a sentence in a list and asking for that sentence to stop
    applying; asking them for its id would be asking them to read the
    database.
    """
    want = " ".join(note.split()).lower()
    rows = [r for r in store.q(
        "SELECT id, text FROM fact WHERE workspace_id=? AND retired_at IS NULL",
        workspace) if want in r["text"].lower()]
    if not rows:
        raise Rejected(f"nothing it knows about {workspace} mentions "
                       f"{note!r}")
    if len(rows) > 1:
        raise Rejected(f"{len(rows)} things match {note!r}: "
                       + "; ".join(r["text"][:60] for r in rows[:3])
                       + ". Say more of the one you mean.")
    store.x("UPDATE fact SET retired_at=datetime('now') WHERE id=?",
            rows[0]["id"])
    return {"ok": True, "detail": f"forgotten: {rows[0]['text']}"}


def _remove_workspace(store, workspace, **_):
    from core import sources
    out = sources.workspace_remove(store, workspace)
    if out.get("error"):
        raise Rejected(out["error"])
    gone = sum((out.get("removed") or {}).values())
    return {"ok": True, "detail": f"{workspace} is gone, and the {gone} rows "
            f"that belonged to it", **out}


# Where a source actually reads from, said the way somebody would say it.
FROM = {
    "maildir":  "the Mail app on this Mac",
    "ical":     "the Calendar app on this Mac",
    "messages": "the Messages archive on this Mac",
}
NOUN = {"maildir": "mail", "imap": "mail", "ical": "calendar",
        "caldav": "calendar", "messages": "messages", "weather": "forecast",
        "web": "page", "ics_out": "holds folder"}


def _own(name: str) -> str:
    """cottages' mail, not cottages's mail."""
    return f"{name}'" if name.endswith(("s", "S")) else f"{name}'s"


def _say_add(a: dict) -> str:
    ws, kind, ref = a.get("workspace", ""), a.get("kind", ""), a.get("ref", "")
    noun = NOUN.get(kind, kind)
    if kind in FROM:
        where = FROM[kind] if ref.lower() in ("local", "default") else ref
        return f"Read {_own(ws)} {noun} from {where}."
    if kind == "imap":
        return (f"Read {_own(ws)} mail over IMAP, signing in with the "
                f"keychain entry {ref}.")
    if kind == "caldav":
        return (f"Read {_own(ws)} calendar over CalDAV, signing in with "
                f"the keychain entry {ref}.")
    if kind == "weather":
        return f"Get {ws} the forecast for {ref} — it sends a latitude and " \
               f"a longitude, and nothing else."
    if kind == "web":
        return f"Watch {ref} for {ws}, and let {ws} reach that one host."
    return f"Add a {kind} source to {ws}, reading {ref}."


def _say_schedule(a: dict) -> str:
    at = str(a.get("at", "")).strip().lower()
    if at in ("", "off", "never"):
        return "Turn the night shift off — nothing will sweep on its own."
    return f"Move the night shift to {a['at']}."


def _say_remove(a: dict) -> str:
    ws, kind = a.get("workspace", ""), a.get("kind", "")
    return f"Stop reading {_own(ws)} {NOUN.get(kind, kind)}."


def _clashes(store, workspace, start, end) -> list[str]:
    """Which nights in [start, end) something is already booked on.

    The whole value of a hold is that it is not a double-booking, so this
    asks the calendar Blokk already reads rather than trusting the model's
    "those nights are free" — which was written before the person spent two
    days deciding, and may have been written from a gap list that is now
    stale. Both halves are half-open: a booking that leaves on the 6th and
    one that arrives on the 6th do not clash over that bed.

    A calendar that cannot be opened returns no clashes and says so through
    the caller. Refusing to hold anything because a reader is down would
    make a broken source into a broken business; the hold is a file in a
    folder, and a person is looking at it either way.
    """
    from datetime import date as _d, datetime as _dt, timedelta as _td
    import core.connectors as _C
    cal = _C.wire(store).get(workspace, "calendar")
    if cal is None or not hasattr(cal, "busy"):
        return []
    days = max(1, (end - _d.today()).days + 1)
    hit = []
    for b_start, b_end in cal.busy(days=min(days, 800)):
        bs = b_start.date() if isinstance(b_start, _dt) else b_start
        be = b_end.date() if isinstance(b_end, _dt) else b_end
        # The overlap of two half-open ranges, said once. It was written as a
        # guard plus a loop bound, which is the same rule in two places — and
        # two places is where one of them gets "fixed" and the other quietly
        # compensates, so neither is ever seen to be wrong. Empty when they
        # only touch at an endpoint, which is a bed swapped over rather than
        # a bed sold twice.
        night, last = max(bs, start), min(be, end)
        while night < last:
            hit.append(night.isoformat())
            night += _td(days=1)
    return sorted(set(hit))


def _hold_dates(store, workspace, title, start, end, note=None, where=None,
                **_):
    """Write a hold into the folder Calendar can swallow.

    This is the first action that puts a file outside blokk.db, so it is
    the first one that can leave a mess. Three things keep it honest:

      * it refuses to write over a night the calendar says is taken, and
        names the nights rather than saying "clash";
      * the filename and the UID come from the booking, so approving the
        same proposal twice replaces one file instead of leaving two;
      * it says a file is waiting, never that anything was added to a
        calendar — because nothing was.
    """
    from datetime import date as _d
    from core.connectors.ics_out import IcsDrop, _as_date
    import core.connectors as _C
    s, e = _as_date(start), _as_date(end)
    taken = _clashes(store, workspace, s, e)
    if taken:
        nights = ", ".join(_d.fromisoformat(t).strftime("%-d %b")
                           for t in taken[:6])
        more = f" and {len(taken) - 6} more" if len(taken) > 6 else ""
        raise Rejected(f"{_own(workspace)} calendar already has something on "
                       f"{nights}{more}. Nothing was written. Move the dates, "
                       f"or take the other booking out first.")
    drop = _C.wire(store).get(workspace, "holds")
    if drop is None:
        # Unwired is the common case on day one, and the default folder is
        # a perfectly good answer — this is a file in the person's own home
        # directory, not a credential.
        drop = IcsDrop("local")
    out = drop.hold(workspace, title, s, e, note or "", where or "")
    nights = (e - s).days
    plural = "" if nights == 1 else "s"

    # The file is written first and always, whatever happens next. It is the
    # thing this machine can definitely do, and a Calendar that refuses must
    # not leave the person with nothing — the failure mode being avoided is
    # "it said it could not, and now there is no record of it anywhere".
    from core.connectors import calendar_app
    into = None
    why = ""
    try:
        # Already there? The uid is written into the event's description
        # precisely so a second approval of the same booking is findable.
        # Without this the .ics was replaced — it is keyed on the booking —
        # and Calendar quietly gained a duplicate beside the first, which is
        # the shape of thing somebody discovers when the diary says two
        # parties are arriving.
        if calendar_app.find(out["uid"]):
            return {"ok": True, "uid": out["uid"], "file": out["file"],
                    "folder": out["folder"], "replaced": out["replaced"],
                    "calendar": "already there",
                    "detail": (f"Already in your diary \u2014 nothing was "
                               f"added twice. The .ics in {out['folder']} was "
                               f"refreshed.")}
        added = calendar_app.add(title, s, e, calendar=_hold_calendar(store,
                                                                     workspace),
                                 note=note or "", where=where or "",
                                 uid=out["uid"])
        into = added.get("calendar")
    except calendar_app.CalendarError as e_cal:
        why = str(e_cal)
    except Exception as e_cal:                                   # noqa: BLE001
        why = f"{type(e_cal).__name__}: {e_cal}"

    if into:
        return {"ok": True, "uid": out["uid"], "file": out["file"],
                "folder": out["folder"], "replaced": out["replaced"],
                "calendar": into,
                "detail": (f"In your diary: {nights} night{plural} under "
                           f"\u201c{title}\u201d in {into}. The .ics is in "
                           f"{out['folder']} as well, in case you want it "
                           f"somewhere else.")}
    return {"ok": True, "uid": out["uid"], "file": out["file"],
            "folder": out["folder"], "replaced": out["replaced"],
            "calendar": None, "calendar_note": why,
            "detail": (f"{'Replaced' if out['replaced'] else 'Written'}: "
                       f"{out['file']} \u2014 {nights} night{plural} in "
                       f"{out['folder']}. Double-click it to put it in "
                       f"Calendar."
                       + (f" ({why})" if why else ""))}


def _hold_calendar(store, workspace: str) -> str:
    """Which calendar a hold goes in, when the person has said.

    The `only` on a wired ical source is the list they ticked in the picker,
    and the first of it is the one they meant — a business that reads
    "Bookings" and "Dentist" wants the booking in Bookings. Empty means they
    ticked nothing, which means all of them, which is no answer to *where to
    write*, so Calendar's own default is used and named in the reply.
    """
    try:
        row = store.one("SELECT only FROM credential WHERE workspace_id=? "
                        "AND kind='ical'", workspace)
        chosen = json.loads(row["only"] or "[]") if row else []
        return str(chosen[0]) if chosen else ""
    except (ValueError, TypeError, IndexError, KeyError):
        return ""


def _say_hold(a: dict) -> str:
    """"Hold 3-6 Sep for the Shaws" — the sentence somebody approves.

    Dates as a person writes them. A preview reading "hold_dates workspace=
    cottages start=2026-09-03" is accurate and is not a decision anybody can
    make with their thumb over a button.
    """
    from datetime import date as _d
    try:
        s = _d.fromisoformat(str(a.get("start", "")))
        e = _d.fromisoformat(str(a.get("end", "")))
    except ValueError:
        gap = "\u2026"
        return (f"Hold {a.get('start') or gap} to {a.get('end') or gap} "
                f"for {a.get('title') or 'a booking'}.")
    n = (e - s).days
    span = (f"{s:%-d}\u2013{e:%-d %b}" if s.month == e.month
            else f"{s:%-d %b}\u2013{e:%-d %b}")
    # What it will actually try, on this machine. Saying "writes a file; it
    # does not touch Calendar" was true everywhere until Calendar.app became
    # reachable, and is now a promise this would break on a Mac — in the
    # direction where somebody approves a hold believing nothing will change
    # and their diary changes.
    from core.connectors import calendar_app
    can, _ = calendar_app.available()
    lands = ("Adds it to Calendar, if macOS lets Blokk \u2014 it asks you "
             "once. A .ics file is written either way."
             if can else
             "Writes a .ics file for you to open; this machine has no "
             "Calendar to add it to.")
    return (f"Hold {span} for \u201c{a.get('title', 'a booking')}\u201d "
            f"in {_own(a.get('workspace', ''))} diary \u2014 {n} night"
            f"{'' if n == 1 else 's'}, out on the morning of "
            f"the {_ord(e.day)}. {lands}")


def _send_reply(store, workspace, approval, **_):
    """Send a draft that is already in the queue, to the address it was
    written to.

    Deliberately takes an approval id rather than a recipient and a body.
    Everything that decides where this goes and what it says was fixed when
    the draft was made and a person read it; this action only says "that
    one, now". A send action that took its own `to` and `text` would let a
    model write the words, choose the reader and ask for it in one step,
    which is the whole thing the queue exists to prevent.
    """
    import core.connectors as _C
    row = store.one("SELECT * FROM approval WHERE id=?", approval)
    if row is None:
        raise Rejected(f"there is no queued item with id {approval!r}")
    if row["workspace_id"] != workspace:
        # Scope is data, not prompt. Invariant 5.
        raise Rejected(f"that draft belongs to {row['workspace_id']}, not to "
                       f"{workspace}")
    if row["decision"] not in ("approve", "edit"):
        raise Rejected(
            f"that draft has not been approved — it is "
            f"{row['decision'] or 'still waiting on you'}. Approve it first; "
            f"sending is a separate decision on purpose.")
    already = row["sent_at"] if "sent_at" in row.keys() else None
    if already:
        raise Rejected(
            f"that draft was already sent at {already}. It is not sent again "
            f"— a duplicate is worse than a missing reply, and the person "
            f"who finds out is the one who received it.")
    # Time-of-check versus time-of-use, on the one path where it reaches
    # somebody. A quote true at 04:00 may be sold by the evening, and the
    # queue already knows how to say so — it was just never asked here.
    if row["revalidate"]:
        from api.server import _stale
        if _stale(row):
            raise Rejected(
                f"that draft was written against facts that have since "
                f"changed ({row['revalidate']}), so it is not sent. Re-run "
                f"the check from the queue and approve it again.")
    to = (row["recipient"] or "").strip() if "recipient" in row.keys() else ""
    if not to:
        raise Rejected(
            "that draft has no recorded recipient, so there is nobody to "
            "send it to. Only drafts written in reply to a message somebody "
            "sent you carry one.")
    # The edited text if a person corrected it, the original if not. The
    # thing that goes out is the thing that was on the screen.
    text = row["body"]
    if row["decision"] == "edit" and row["edited_body"]:
        try:
            text = (json.loads(row["edited_body"]) or {}).get("preview") or text
        except ValueError:
            text = row["edited_body"]
    sender = _C.wire(store).get(workspace, "send")
    if sender is None:
        raise Rejected(
            f"{_own(workspace)} has no way to send. Sending is off until you "
            f"wire it: connect.py add {workspace} smtp "
            f"blokk-{workspace}-smtp@smtp.example.com:465, and a keychain "
            f"entry to go with it.")
    from core.connectors.smtp_mail import SendRefused
    try:
        out = sender.send(to, _subject_for(row), text, expected=to)
    except SendRefused as e:
        raise Rejected(str(e)) from None
    # Marked before anything is returned, and marked even though the send
    # already happened — the window between the two is the one where a
    # crash would let it go twice.
    from core.durable import now as _now
    store.x("UPDATE approval SET sent_at=? WHERE id=?",
            _now().isoformat(), approval)
    return {"ok": True, "sent": True, "to": out["to"],
            "detail": f"Sent to {out['to']} via {out['via']}. "
                      f"{out['left_today']} left in today's cap."}


def _subject_for(row) -> str:
    """A reply's subject, from the message it answers."""
    try:
        ev = json.loads(row["evidence"] or "{}")
        for c in ev.get("drawn_from") or []:
            subj = str(c.get("subject") or "").strip()
            if subj:
                return subj if subj.lower().startswith("re:") else f"Re: {subj}"
    except (ValueError, TypeError):
        pass
    return "Re: your enquiry"


def _say_send(a: dict) -> str:
    return (f"Send the approved draft {a.get('approval', '')} \u2014 this one "
            f"leaves this Mac and reaches the person it is addressed to. "
            f"Nothing else in Blokk does that.")


ACTIONS: dict[str, Action] = {a.name: a for a in (
    Action("sweep_now", "Run the sweep now, across every workspace.",
           run=_sweep, category="blokk_run"),
    Action("backup_now", "Take a backup of blokk.db.",
           run=_backup, category="blokk_run"),
    Action("set_schedule", "Move the night shift to {at}.",
           args=("at",), run=_schedule, phrase=_say_schedule),
    Action("add_source", "Wire {kind} into {workspace}, reading {ref}.",
           args=("workspace", "kind", "ref"), run=_add_source,
           phrase=_say_add),
    Action("add_workspace", "Add a workspace called {workspace}.",
           args=("workspace",), optional=("name",), run=_add_workspace),
    # The only action that reaches another person. Pinned, permanently: a
    # category earns the right to act alone by being right twenty times, and
    # what that would buy here is mail going to a guest off the back of a
    # sentence in somebody else's email. There is no number of correct sends
    # that makes the twenty-first safe to skip.
    Action("send_reply",
           "Send the approved draft {approval}.",
           args=("workspace", "approval"),
           pinned=True, category="send_mail",
           run=_send_reply, phrase=_say_send),
    # The only action that writes outside blokk.db, and pinned for it. A
    # category earns the right to act alone by being right twenty times;
    # what that buys elsewhere is a workspace renamed without asking. Here
    # it would be a file appearing in somebody's folder off the back of a
    # sentence in a guest's email, which is the shape of the thing this
    # whole design exists to stop.
    Action("hold_dates",
           "Hold {start} to {end} for {title}, in {workspace}.",
           args=("workspace", "title", "start", "end"),
           optional=("note", "where"),
           pinned=True, category="calendar_hold",
           run=_hold_dates, phrase=_say_hold),
    Action("remember", "Remember, for {workspace}: {note}",
           args=("workspace", "note"), run=_remember, category="blokk_memory"),
    # Pinned. Forgetting is the one memory operation that destroys something,
    # and a rule quietly retired is a rule you go looking for later and
    # cannot find.
    Action("forget", "Stop applying what it knows about {note}, for "
                     "{workspace}.",
           args=("workspace", "note"), pinned=True, run=_forget,
           category="blokk_memory"),
    # Pinned. Each of these either opens a route out of the machine or
    # removes something that does not come back, and neither gets safer
    # because the last ninety were fine.
    Action("egress_allow", "Let {workspace} reach {host}.",
           args=("workspace", "host"), pinned=True, run=_egress_allow),
    Action("egress_deny", "Stop {workspace} reaching {host}.",
           args=("workspace", "host"), pinned=True, run=_egress_deny),
    Action("remove_source", "Remove {workspace}'s {kind} source.",
           args=("workspace", "kind"), pinned=True, run=_remove_source,
           phrase=_say_remove),
    Action("remove_workspace",
           "Delete the workspace {workspace} and everything in it.",
           args=("workspace",), pinned=True, run=_remove_workspace),
)}


# ────────────────────────────────────────────────────────────────── validation
def validate(name: str, args: dict) -> tuple[Action, dict]:
    """A proposal from a model is a form submission from the internet.

    It was written after reading a stranger's email, so every field is
    checked against what it is allowed to be. Unknown keys are dropped
    rather than passed on: an executor that receives a field nobody wrote a
    rule for is how an argument becomes an injection.
    """
    act = ACTIONS.get(str(name or "").strip())
    if act is None:
        raise Rejected(
            f"{name!r} is not something Blokk can do. It can: "
            + ", ".join(sorted(ACTIONS)) + ".")
    if not isinstance(args, dict):
        raise Rejected("the arguments have to be an object")
    clean: dict = {}
    for key in act.args + act.optional:
        if key not in args:
            if key in act.args:
                raise Rejected(f"{act.name} needs {key!r}")
            continue
        v = args[key]
        if not isinstance(v, (str, int)):
            raise Rejected(f"{key!r} has to be text")
        v = str(v).strip()
        cap = 400 if key == "note" else 200
        if len(v) > cap:
            raise Rejected(f"{key!r} is too long — {len(v)} characters, and "
                           f"the limit is {cap}")
        # Identifiers are identifiers. A workspace called "; DROP" is not one,
        # and neither is a kind that is not one of the kinds.
        if key == "workspace" and not ID.match(v):
            raise Rejected(f"{v!r} is not a workspace id")
        if key == "kind":
            from core import sources
            if v not in sources.KINDS:
                raise Rejected(f"{v!r} is not a kind. One of: "
                               + ", ".join(sources.KINDS))
        # Shapes, checked here rather than left to the executor. The executor
        # does refuse them — loudly, with a sentence — but by then the
        # proposal has been read, approved and run, and the person is being
        # told about a typo three steps after they could have fixed it. The
        # preview is also built from these, so an unchecked value put "Move
        # the night shift to tea." under an Approve button.
        if key == "at" and v.lower() not in ("", "off", "never"):
            from core import nightly
            # Normalised, not refused. Somebody typing into the edit field is
            # writing the time the way people write times, and "6pm" is not a
            # mistake — it is a time this can read perfectly well.
            v = _as_time(v)
            if nightly._hhmm(v) is None:
                raise Rejected(f"{args[key]!r} is not a time of day. It wants "
                               f"something like 04:00, or 6pm.")
        if key in ("start", "end"):
            # Normalised to ISO here so the preview, the clash check and
            # the file all agree about which day is meant. A model that
            # writes 03/09/2026 is not making a mistake; leaving it as
            # text until the executor is.
            from core.connectors.ics_out import _as_date
            try:
                v = _as_date(v).isoformat()
            except ValueError as ex:
                raise Rejected(str(ex)) from None
        if key == "approval" and not re.match(r"^a_[A-Za-z0-9_]{1,64}$", v):
            raise Rejected(f"{v!r} is not the id of a queued item")
        if key == "title" and len(v) < 2:
            raise Rejected("a hold needs something to call it")
        if key == "note" and len(v) < 4:
            raise Rejected("that is too short to be worth remembering")
        if key == "host":
            if not HOSTNAME.match(v):
                raise Rejected(f"{v!r} is not a hostname. It wants something "
                               f"like api.example.com.")
        clean[key] = v
    # Checks that need two fields at once, so they cannot live in the loop
    # above. Same reason everything else is checked here: a proposal that is
    # wrong should say so under the Approve button, not after it.
    if "start" in clean and "end" in clean:
        from datetime import date as _date
        s_, e_ = (_date.fromisoformat(clean["start"]),
                  _date.fromisoformat(clean["end"]))
        if e_ <= s_:
            raise Rejected(
                f"{e_:%-d %b} is not after {s_:%-d %b} \u2014 a hold needs at "
                f"least one night, and the leaving date is the morning after "
                f"the last one. For a single night on the "
                f"{_ord(s_.day)}, that is {s_ + _day():%Y-%m-%d}.")
        if s_ < _date.today() - _day():
            raise Rejected(f"{s_:%-d %b %Y} is in the past")
        # A hold this long is a misread sentence far more often than it is a
        # booking. "The 5th to the 5th of March" is a real thing somebody
        # types and it can be read as 28 nights; better to say the number out
        # loud than to write a month-long block into a diary.
        if (e_ - s_).days > MAX_NIGHTS:
            raise Rejected(
                f"that is {(e_ - s_).days} nights, {s_:%-d %b} to {e_:%-d %b}. "
                f"Over {MAX_NIGHTS} looks like a misread date rather than a "
                f"booking \u2014 write both dates out if you meant it.")
    return act, clean


def propose(name: str, args: dict) -> dict:
    """The JSON that goes in approval.action. Validated before it is stored.

    Storing an invalid proposal and finding out at approval time would put
    the error message in the wrong place: the person tapping Approve did not
    write it, and by then the model that did is three turns gone.
    """
    act, clean = validate(name, args)
    return {"name": act.name, "args": clean, "preview": act.preview(clean),
            "pinned": act.pinned, "category": act.category}


def run(store, action_json: str | dict) -> dict:
    """Carry out an approved proposal. Called from the approval path only.

    Deliberately re-validates. The row has been sitting in a queue and the
    only thing that should ever reach an executor is something that passes
    the same checks it passed on the way in.
    """
    payload = action_json
    if isinstance(payload, str):
        try:
            payload = json.loads(payload or "{}")
        except ValueError as e:
            raise Rejected("this proposal's action is not readable JSON") from e
    if not payload:
        return {"ok": True, "detail": "nothing to run"}
    act, clean = validate(payload.get("name"), payload.get("args") or {})
    out = act.run(store, **clean)
    return {"ok": True, "action": act.name, **(out or {})}


def edited(action_json: str | dict, corrections) -> dict:
    """The proposal, with a person's corrections merged in and re-validated.

    The corrections come from a browser and are treated exactly like the
    model's arguments were: checked against what the named action declares,
    with anything unrecognised dropped. A person tapping Edit has more
    standing than a model, but not the standing to invent an argument the
    executor has no rule for.

    The action's *name* is not editable. Changing "back up" into "delete the
    workspace" between the sentence somebody read and the thing that runs is
    the whole class of bug this queue exists to prevent.
    """
    payload = action_json
    if isinstance(payload, str):
        try:
            payload = json.loads(payload or "{}")
        except ValueError as e:
            raise Rejected("this proposal's action is not readable JSON") from e
    if isinstance(corrections, str):
        try:
            corrections = json.loads(corrections or "{}")
        except ValueError as e:
            raise Rejected("the corrections are not readable JSON") from e
    if not isinstance(corrections, dict):
        raise Rejected("the corrections have to be an object")
    merged = {**(payload.get("args") or {}), **corrections}
    act, clean = validate(payload.get("name"), merged)
    return {"name": act.name, "args": clean, "preview": act.preview(clean),
            "pinned": act.pinned, "category": act.category}


def catalogue() -> list[dict]:
    """What Ask is told it can propose. Names and sentences, no executors."""
    return [{"name": a.name, "does": a.summary,
             "needs": list(a.args), "optional": list(a.optional),
             "always_asks": a.pinned}
            for a in ACTIONS.values()]
