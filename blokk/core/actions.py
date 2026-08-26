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
Blokk itself: its sources, its allowlist, its schedule, its
backups. The one exception is `put_in_diary`, which writes a .ics file into a
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
right to act alone. Opening a hole in the egress allowlist and removing a
source are pinned to manual for the same reason an access question is: the
cost of being wrong does not scale with how often you have been right.
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
    at 04:00 start one run and not two. A copy of that rule
    living here would be a second opinion about whether today was already
    swept, and the two would eventually disagree. force=True because a person
    has just approved it by name, which is the manual override.
    """
    from api import server
    out = server.sweep_all(force=True)
    return {"ok": True, "detail": "sweeping", **out}


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


def _add_source(store, kind, ref, name=None, **_):
    from core import sources
    out = sources.add(store, kind, ref, name=name)
    if out.get("error"):
        raise Rejected(out["error"])
    # The same sentence the proposal was approved under, so what it says it
    # did matches what it said it would do. "maildir added" is neither.
    return {"ok": True, **out,
            "detail": out.get("note")
            or ACTIONS["add_source"].preview({"kind": kind, "ref": ref})}


def _remove_source(store, name, **_):
    from core import sources
    out = sources.remove(store, name)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, **out}


def _egress_allow(store, host, **_):
    from core import egress
    out = egress.allow(store, host)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _egress_deny(store, host, **_):
    from core import egress
    out = egress.disallow(store, host)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _app_allow(store, app, verb=None, **_):
    from core import permission
    out = permission.set_state(store, permission.APP, app,
                               (verb or permission.READ).strip().lower(),
                               permission.ALLOW, by="approval")
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _app_block(store, app, verb=None, **_):
    """Blocking with no verb blocks every verb the app has. Over-blocking
    is the safe direction, and "block Calendar" from a person means the
    app, not one of its doors."""
    from core import permission
    row = permission.known(app)
    if not row:
        raise Rejected(permission.set_state(
            store, permission.APP, app, "read", permission.BLOCK)["error"])
    verbs = [verb.strip().lower()] if verb else list(row["verbs"])
    said = []
    for v in verbs:
        out = permission.set_state(store, permission.APP, app, v,
                                   permission.BLOCK, by="approval")
        if out.get("error"):
            raise Rejected(out["error"])
        said.append(out["detail"])
    return {"ok": True, "detail": said[-1]}


def _say_app_allow(a: dict) -> str:
    from core import permission
    row = permission.known(a.get("app", "")) or {}
    app = row.get("app") or a.get("app") or "…"
    doing = {"read": "read", "write": "write into"}.get(
        str(a.get("verb") or "read"), str(a.get("verb")))
    tail = f" That is {row['where']}" if row.get("where") else ""
    return f"Let Blokk {doing} {app}.{tail}"


def _say_app_block(a: dict) -> str:
    from core import permission
    row = permission.known(a.get("app", "")) or {}
    app = row.get("app") or a.get("app") or "…"
    if a.get("verb"):
        doing = {"read": "read", "write": "write into"}.get(
            str(a["verb"]), str(a["verb"]))
        return (f"Stop Blokk being able to {doing} {app}. Kept until you "
                f"change it in Permissions.")
    return (f"Stop Blokk touching {app} at all. Every attempt after this "
            f"is refused by name, until you change it in Permissions.")


def _remind(store, when, note, **_):
    """Put something in front of the person on a day of their choosing.

    The single most-used thing a secretary does, and Blokk could not do it
    at all: it could read a diary, draft a reply and file a receipt, and it
    had no way to be told "bring this back on Thursday". Everything it knew
    was either happening now or already recorded.

    Deliberately not a calendar write. A reminder is not an appointment —
    it does not take an hour, it is nobody else's business, and putting one
    in a shared calendar is how a private note about somebody ends up on a
    screen in front of them. It is a row here, and `put_in_diary` is a
    separate decision for the things that really are appointments.

    The morning sweep raises it as a card on the day and marks it raised,
    so it appears once. A date that has already gone is taken at its word
    and surfaces at the next sweep, saying how late it is.

    The first version quietly rolled a past date forward to the same weekday
    — "Tuesday" said on a Wednesday meaning the Tuesday coming. It read as
    helpful and it was two bad things at once. A reminder that moves itself
    is a reminder somebody approved for one day and got on another, and the
    model resolves the weekday anyway, so a past date means the model was
    wrong about today — which is exactly the thing to show a person rather
    than smooth over. It also made the sweep's own "this is four days late"
    branch unreachable: nothing could ever be overdue if overdue dates were
    moved. A rule that hides the state another rule exists to report is
    worse than either rule alone.
    """
    from datetime import date as _d
    import hashlib as _h
    try:
        day = _as_day(_at(when))
    except ValueError:
        # validate() already refuses this shape with the same sentence;
        # this is the backstop for a caller that skipped it, and a backstop
        # that answers with a traceback teaches people to fear the queue.
        raise Rejected(f"{when!r} is not a day this can read. It wants a "
                       f"real date, like 2026-09-03.") from None
    if not isinstance(day, _d):
        raise Rejected(f"{when!r} is not a date I can read. Try 2026-09-03.")
    text = str(note).strip()
    if not text:
        raise Rejected("a reminder with nothing in it is a card you will "
                       "not understand on Thursday")
    rid = "rm_" + _h.sha256(
        f"{day.isoformat()}|{text}".encode()).hexdigest()[:12]
    # Keyed on the day and the words, so approving the same proposal twice
    # is one reminder. The same rule the .ics filename uses, for the same
    # reason: a replay must not leave two.
    store.x("INSERT OR REPLACE INTO reminder(id,at,note) VALUES(?,?,?)",
            rid, day.isoformat(), text[:400])
    return {"ok": True, "id": rid, "at": day.isoformat(),
            "detail": f"You will see this on {day.strftime('%A %-d %B')}: "
                      f"\u201c{text[:120]}\u201d."}


def _remember(store, note, **_):
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
    fid = "f_told_" + hashlib.sha256(note.lower().encode()).hexdigest()[:10]
    already = store.one("SELECT id FROM fact WHERE id=?", fid)
    store.x("""INSERT OR REPLACE INTO fact
               (id,text,confidence,source_episodes,retired_at)
               VALUES(?,?,?,'[]',NULL)""",
            fid, note, max(0.9, MIN_CONFIDENCE))
    return {"ok": True, "id": fid,
            "detail": ("that was already remembered, and is again"
                       if already else "remembered")}


def _forget(store, note, **_):
    """Retire what it knows, by what it says.

    Matched on the text because that is what a person can see. They are
    reading a sentence in a list and asking for that sentence to stop
    applying; asking them for its id would be asking them to read the
    database.
    """
    want = " ".join(note.split()).lower()
    rows = [r for r in store.q(
        "SELECT id, text FROM fact WHERE retired_at IS NULL")
        if want in r["text"].lower()]
    if not rows:
        raise Rejected(f"nothing it knows mentions {note!r}")
    if len(rows) > 1:
        raise Rejected(f"{len(rows)} things match {note!r}: "
                       + "; ".join(r["text"][:60] for r in rows[:3])
                       + ". Say more of the one you mean.")
    store.x("UPDATE fact SET retired_at=datetime('now') WHERE id=?",
            rows[0]["id"])
    return {"ok": True, "detail": f"forgotten: {rows[0]['text']}"}


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
    kind, ref = a.get("kind", ""), a.get("ref", "")
    noun = NOUN.get(kind, kind)
    if kind in FROM:
        where = FROM[kind] if ref.lower() in ("local", "default") else ref
        return f"Read your {noun} from {where}."
    if kind == "imap":
        return (f"Read your mail over IMAP, signing in with the "
                f"keychain entry {ref}.")
    if kind == "caldav":
        return (f"Read your calendar over CalDAV, signing in with "
                f"the keychain entry {ref}.")
    if kind == "weather":
        return (f"Get the forecast for {ref} — it sends a latitude and "
                f"a longitude, and nothing else.")
    if kind == "web":
        return f"Watch {ref}, and open the allowlist to that one host."
    return f"Add a {kind} source, reading {ref}."


def _say_schedule(a: dict) -> str:
    at = str(a.get("at", "")).strip().lower()
    if at in ("", "off", "never"):
        return "Turn the night shift off — nothing will sweep on its own."
    return f"Move the night shift to {a['at']}."


def _say_remove(a: dict) -> str:
    return f"Stop reading the source called {a.get('name', '')}."


def _diary_around(store, start, end) -> list[tuple]:
    """Everything already in the diary that touches [start, end).

    Returns the occurrences themselves rather than a list of dates, because
    the two callers need different things out of them: one asks whether the
    *times* overlap, the other wants to say what else is on that day.

    A calendar that cannot be opened returns nothing and the caller says so.
    Refusing to write anything because a reader is down would make a broken
    source into a broken diary; what is being written is a file in a folder,
    and a person is looking at it either way.
    """
    from datetime import date as _d, datetime as _dt, timedelta as _td
    import core.connectors as _C
    # Every calendar, not one: two diaries in one space means a night is
    # taken if either of them says so.
    cals = [c for _, c in _C.wire(store).by_role("calendar")
            if hasattr(c, "busy")]
    if not cals:
        return []
    days = max(1, (_as_day(end) - _d.today()).days + 1)
    lo, last = _as_day(start), _last_day(start, end)
    out = []
    for b_start, b_end in [b for c in cals
                           for b in c.busy(days=min(days, 800))]:
        # Days that touch, inclusively. "Around" is a question about
        # proximity — what else is on that day — and the exclusive
        # half-open test belongs to the narrower question `_touching` asks.
        # Written as `<` first, which meant a single day could never
        # intersect anything: max(4th, 4th) < min(4th, 4th) is false, so a
        # two o'clock appointment was invisible to a half-two one.
        if _as_day(b_start) <= last and lo <= _last_day(b_start, b_end):
            out.append((b_start, b_end))
    return out


def _last_day(lo, hi):
    """The last day something actually occupies.

    A whole-day range is half-open — the 3rd to the 4th is the 3rd — and a
    timed one is not. Getting this wrong in either direction reports a
    neighbour as a clash or misses one.
    """
    from datetime import datetime as _dt, timedelta as _td
    a, b = _as_day(lo), _as_day(hi)
    if b <= a:
        return a
    if isinstance(lo, _dt) and isinstance(hi, _dt) and not _midnight(lo, hi):
        return b
    return b - _td(days=1)


def _as_day(v):
    from datetime import date as _d, datetime as _dt
    return v.date() if isinstance(v, _dt) else v


def _touching(a1, a2, b1, b2) -> bool:
    """Do two things actually overlap in time?

    Only meaningful when both carry a time of day. Two whole-day entries on
    one day do not conflict — that is a Tuesday — and treating them as a
    conflict is the single biggest difference between a diary and a bed.
    """
    from datetime import datetime as _dt
    if not all(isinstance(v, _dt) for v in (a1, a2, b1, b2)):
        return False
    if _midnight(a1, a2) or _midnight(b1, b2):
        return False
    return max(a1, b1) < min(a2, b2)


def _midnight(lo, hi) -> bool:
    """A whole day dressed as a datetime — midnight to midnight."""
    return (lo.hour, lo.minute, hi.hour, hi.minute) == (0, 0, 0, 0)


def _at(v):
    """A date or a datetime out of whatever the proposal wrote.

    `_as_date` throws the time away, which is right for a filename and
    wrong for deciding whether two things collide.
    """
    from datetime import date as _d, datetime as _dt
    if isinstance(v, (_d, _dt)):
        return v
    try:
        return _dt.fromisoformat(str(v).strip())
    except ValueError:
        from core.connectors.ics_out import _as_date
        return _as_date(v)


def _span(lo, hi) -> str:
    """When something is, in the words somebody would use out loud.

    "3 Sep, 15:00\u201316:00" and "3\u20135 Sep" rather than a night count.
    A person's diary is not measured in nights.
    """
    from datetime import datetime as _dt
    d1, d2 = _as_day(lo), _as_day(hi)
    timed = (isinstance(lo, _dt) and isinstance(hi, _dt)
             and not _midnight(lo, hi))
    if timed and d1 == d2:
        return (f"{d1.strftime('%-d %b')}, {lo.strftime('%H:%M')}"
                f"\u2013{hi.strftime('%H:%M')}")
    # Half-open at the end: a whole day entered as 3rd to 4th is the 3rd.
    last = d2 - _day() if d2 > d1 else d2
    if d1 == last:
        return d1.strftime("%-d %b")
    return f"{d1.strftime('%-d')}\u2013{last.strftime('%-d %b')}"


def _put_in_diary(store, title, start, end, note=None, where=None, **_):
    """Put something in the diary, as a file Calendar can swallow.

    This was `hold_dates` and it held a *booking*, which is why it refused
    over any day the calendar already had something on. A bed is exclusive
    and a Tuesday is not: refusing to put the dentist in because you are
    having lunch with somebody that day is wrong about how a person's diary
    works, and it is the single sharpest place the holiday let showed
    through.

    So what refuses now is an actual overlap — two things at the same time,
    both with times on them. Two whole-day entries on one day are written
    without comment, and anything else on the day is named in the reply,
    because "you already have three things that afternoon" is worth knowing
    and is not a reason to refuse.

    The rest is unchanged and was already right: the filename and the UID
    come from the entry, so approving the same proposal twice replaces one
    file rather than leaving two, and it never says something was added to a
    calendar unless it was.
    """
    from core.connectors.ics_out import IcsDrop, _as_date
    import core.connectors as _C
    # Two readings of the same pair, and both are needed: the file and the
    # filename are keyed on the day, and whether this collides with anything
    # is a question about the time.
    s, e = _as_date(start), _as_date(end)
    near = _diary_around(store, _at(start), _at(end))
    clash = [b for b in near if _touching(b[0], b[1], _at(start), _at(end))]
    if clash:
        when = ", ".join(_span(b[0], b[1]) for b in clash[:4])
        more = f" and {len(clash) - 4} more" if len(clash) > 4 else ""
        raise Rejected(f"that runs over something already in your diary "
                       f"({when}{more}). Nothing was written. Move it, or "
                       f"take the other one out first.")
    drop = _C.wire(store).first("holds")
    if drop is None:
        # Unwired is the common case on day one, and the default folder is
        # a perfectly good answer — this is a file in the person's own home
        # directory, not a credential.
        drop = IcsDrop("local")
    out = drop.hold(title, _at(start), _at(end), note or "", where or "")
    span = _span(_at(start), _at(end))
    alongside = ""
    if near:
        # Named, never a refusal. A person putting something in a full day
        # usually knows it is full; a person who does not is better told
        # than blocked.
        alongside = (" You already have "
                     + ", ".join(_span(b[0], b[1]) for b in near[:3])
                     + " around then.")

    # The file is written first and always, whatever happens next. It is the
    # thing this machine can definitely do, and a Calendar that refuses must
    # not leave the person with nothing — the failure mode being avoided is
    # "it said it could not, and now there is no record of it anywhere".
    from core.connectors import calendar_app
    from core import permission
    into = None
    why = ""
    try:
        # Writing into Calendar.app is a separate permission from reading
        # the calendar files, and it is never granted by wiring a reader —
        # putting things in somebody's calendar is exactly the kind of act
        # the ledger exists for. Denied is not a failure here: the .ics
        # above is already written, which is the fallback this action has
        # always had, and the refusal is recorded where the permissions
        # panel will show it knocking.
        permission.require(store, permission.APP, "Calendar",
                           permission.WRITE,
                           why=f"the diary wanted to add “{title}”")
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
        added = calendar_app.add(title, s, e,
                                 calendar=_hold_calendar(store),
                                 note=note or "", where=where or "",
                                 uid=out["uid"])
        into = added.get("calendar")
    except permission.Denied as e_cal:
        why = str(e_cal)
    except calendar_app.CalendarError as e_cal:
        why = str(e_cal)
    except Exception as e_cal:                                   # noqa: BLE001
        why = f"{type(e_cal).__name__}: {e_cal}"

    if into:
        return {"ok": True, "uid": out["uid"], "file": out["file"],
                "folder": out["folder"], "replaced": out["replaced"],
                "calendar": into,
                "detail": (f"In your diary: \u201c{title}\u201d, {span}, in "
                           f"{into}.{alongside} The .ics is in "
                           f"{out['folder']} as well, in case you want it "
                           f"somewhere else.")}
    return {"ok": True, "uid": out["uid"], "file": out["file"],
            "folder": out["folder"], "replaced": out["replaced"],
            "calendar": None, "calendar_note": why,
            "detail": (f"{'Replaced' if out['replaced'] else 'Written'}: "
                       f"{out['file']} \u2014 \u201c{title}\u201d, {span}, in "
                       f"{out['folder']}.{alongside} Double-click it to "
                       f"put it in Calendar."
                       + (f" ({why})" if why else ""))}


def _hold_calendar(store) -> str:
    """Which calendar a hold goes in, when the person has said.

    The `only` on a wired ical source is the list they ticked in the picker,
    and the first of it is the one they meant — somebody who reads "Bookings"
    and "Dentist" wants the booking in Bookings. Empty means they ticked
    nothing, which means all of them, which is no answer to *where to write*,
    so Calendar's own default is used and named in the reply.
    """
    try:
        row = store.one("SELECT only FROM credential WHERE kind='ical' "
                        "ORDER BY id LIMIT 1")
        chosen = json.loads(row["only"] or "[]") if row else []
        return str(chosen[0]) if chosen else ""
    except (ValueError, TypeError, IndexError, KeyError):
        return ""


def _say_remind(a: dict) -> str:
    """The sentence somebody's thumb is over, in a day they recognise.

    "Remind you about the MOT on 2026-09-03" is accurate and makes a person
    count on their fingers. The weekday is the part they check it against.
    """
    from datetime import date as _d
    try:
        d = _d.fromisoformat(str(a.get("when", "")).strip()[:10])
        when = d.strftime("%A %-d %B")
    except ValueError:
        when = str(a.get("when") or "\u2026")
    what = a.get("note") or "\u2026"
    return f"Remind you about \u201c{what}\u201d on {when}."


def _say_diary(a: dict) -> str:
    """"Dentist, 3 Sep, 15:00–16:00" — the sentence somebody approves.

    Dates as a person writes them. A preview reading "put_in_diary
    start=2026-09-03" is accurate and is not a decision anybody can make
    with their thumb over a button.

    It used to end "3 nights, out on the morning of the 4th", which is a
    booking talking. Nobody checks out of the dentist.
    """
    try:
        span = _span(_at(a.get("start", "")), _at(a.get("end", "")))
    except Exception:                                            # noqa: BLE001
        gap = "\u2026"
        return (f"Put {a.get('title') or 'it'} in the diary, "
                f"{a.get('start') or gap} to {a.get('end') or gap}.")
    # What it will actually try, on this machine. Saying "writes a file; it
    # does not touch Calendar" was true everywhere until Calendar.app became
    # reachable, and is now a promise this would break on a Mac — in the
    # direction where somebody approves believing nothing will change and
    # their diary changes.
    from core.connectors import calendar_app
    can, _ = calendar_app.available()
    lands = ("Adds it to Calendar \u2014 if you have allowed that in "
             "Permissions, and macOS lets Blokk, which it asks you once. "
             "A .ics file is written either way."
             if can else
             "Writes a .ics file for you to open; this machine has no "
             "Calendar to add it to.")
    return (f"\u201c{a.get('title') or 'Something'}\u201d in your diary, "
            f"{span}. {lands}")


def _send_reply(store, approval, **_):
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
    # This used to check that the approval belonged to the workspace the
    # proposal named — the concrete form of invariant 5 on this path, and
    # the thing that stopped a model asking to send one business's draft
    # under another's name. There is one space now, so there is no line to
    # cross here and the check would be a tautology. What it was protecting
    # has not moved: the address is `recipient`, written when the draft was
    # made from the message that was read, and passed to the sender as
    # `expected` so the send itself refuses if anything has changed it. A
    # model still cannot choose who hears about it.
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
    # Which door the words leave by is a property of who they are addressed
    # to and where their message arrived — never a choice the model or this
    # action makes. The sweep records the channel on the row when the draft
    # is queued; a row from before that column infers it from the shape of
    # the recipient, which is right for every phone number and right for
    # almost every address.
    channel = _channel_of(row, to)
    from core.durable import now as _now
    if channel == "text":
        from core import permission
        from core.connectors import messages_out
        try:
            # Sending a text is Messages' write door, never granted by
            # wiring the reader. Denied is a Rejected with the panel named,
            # and the knock is recorded where the panel shows it.
            permission.require(store, permission.APP, "Messages",
                               permission.WRITE,
                               why="sending a reply you approved")
        except permission.Denied as e:
            raise Rejected(str(e)) from None
        try:
            out = messages_out.send(store, to, text, expected=to)
        except messages_out.TextRefused as e:
            raise Rejected(str(e)) from None
        store.x("UPDATE approval SET sent_at=? WHERE id=?",
                _now().isoformat(), approval)
        return {"ok": True, "sent": True, "to": out["to"],
                "detail": f"Handed to Messages for {out['to']} "
                          f"({out['via']}). {out['left_today']} left in "
                          f"today's cap. {out['note']}."}
    sender = _C.wire(store).first("send")
    if sender is None:
        raise Rejected(
            "there is no way to send mail. Sending is off until you wire "
            "it: python3 connect.py sending walks you through it, password "
            "straight into the keychain.")
    from core.connectors.smtp_mail import SendRefused
    try:
        out = sender.send(to, _subject_for(row), text, expected=to)
    except SendRefused as e:
        raise Rejected(str(e)) from None
    # Marked before anything is returned, and marked even though the send
    # already happened — the window between the two is the one where a
    # crash would let it go twice.
    store.x("UPDATE approval SET sent_at=? WHERE id=?",
            _now().isoformat(), approval)
    return {"ok": True, "sent": True, "to": out["to"],
            "detail": f"Sent to {out['to']} via {out['via']}. "
                      f"{out['left_today']} left in today's cap."}


def _channel_of(row, to: str) -> str:
    """"text" or "mail", read off the row, inferred only as a fallback.

    The evidence's `channel` is written by the sweep from which reader the
    message actually came through, which settles the one ambiguous case —
    an iMessage from an email-shaped handle. Absent (a row queued before
    the channel was recorded), the recipient's shape decides: a phone
    number cannot be mailed and an address is almost never a text.
    """
    try:
        ev = json.loads(row["evidence"] or "{}")
        if ev.get("channel") in ("text", "mail"):
            return ev["channel"]
    except (ValueError, TypeError):
        pass
    return "mail" if "@" in (to or "") else "text"


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
            f"leaves this Mac and reaches the person it is addressed to, by "
            f"the way their message arrived: mail as mail, a text through "
            f"Messages. Nothing else in Blokk reaches anybody.")


ACTIONS: dict[str, Action] = {a.name: a for a in (
    Action("sweep_now", "Read everything wired, now.",
           run=_sweep, category="blokk_run"),
    Action("backup_now", "Take a backup of blokk.db.",
           run=_backup, category="blokk_run"),
    Action("set_schedule", "Move the night shift to {at}.",
           args=("at",), run=_schedule, phrase=_say_schedule),
    Action("add_source", "Wire {kind}, reading {ref}.",
           args=("kind", "ref"), optional=("name",), run=_add_source,
           phrase=_say_add),
    # The only action that reaches another person. Pinned, permanently: a
    # category earns the right to act alone by being right twenty times, and
    # what that would buy here is mail going to a guest off the back of a
    # sentence in somebody else's email. There is no number of correct sends
    # that makes the twenty-first safe to skip.
    Action("send_reply",
           "Send the approved draft {approval}.",
           args=("approval",),
           pinned=True, category="send_mail",
           run=_send_reply, phrase=_say_send),
    # The only action that writes outside blokk.db, and pinned for it. A
    # category earns the right to act alone by being right twenty times;
    # what that would buy here is a file appearing in somebody's folder off
    # the back of a sentence in a guest's email, which is the shape of the
    # thing this whole design exists to stop.
    Action("put_in_diary",
           "Put {title} in the diary, {start} to {end}.",
           args=("title", "start", "end"),
           optional=("note", "where"),
           pinned=True, category="diary_write",
           run=_put_in_diary, phrase=_say_diary),
    # Not pinned, and the only write-shaped action that is not. Everything
    # else here either reaches outside blokk.db or removes something; a
    # reminder does neither. It is a row saying "put this in front of me on
    # Thursday", it is visible in the queue the moment it is made, and the
    # worst it can do when it is wrong is show somebody a card they did not
    # need. That is the one thing on this list where being right ninety
    # times genuinely should buy the ninety-first, which is what invariant 4
    # is for.
    # `when`, not `at`: validate() reads a field called `at` as a time of
    # day, because that is what set_schedule means by it. Two actions
    # sharing an argument name share its rules, and a reminder for the
    # 3rd of September was refused as "not a time of day" — by a check
    # written for a different action, naming a field this one does not
    # have.
    Action("remind_me", "Remind you about {note} on {when}.",
           args=("when", "note"), category="reminder",
           run=_remind, phrase=_say_remind),
    Action("remember", "Remember: {note}",
           args=("note",), run=_remember, category="blokk_memory"),
    # Pinned. Forgetting is the one memory operation that destroys something,
    # and a rule quietly retired is a rule you go looking for later and
    # cannot find.
    Action("forget", "Stop applying what it knows about {note}.",
           args=("note",), pinned=True, run=_forget,
           category="blokk_memory"),
    # Pinned. Each of these either opens a route out of the machine or
    # removes something that does not come back, and neither gets safer
    # because the last ninety were fine. More so now than before: the
    # allowlist is one list, so opening a host opens it for everything
    # wired here rather than for one business.
    Action("egress_allow", "Let Blokk reach {host}.",
           args=("host",), pinned=True, run=_egress_allow),
    Action("egress_deny", "Stop Blokk reaching {host}.",
           args=("host",), pinned=True, run=_egress_deny),
    # Pinned, both directions, and the pin on app_block is not a mistake:
    # a block proposed by a model and run without a person would be a way
    # for a sentence in somebody's email to switch your mail off. The
    # ledger is a person's book; the model only ever proposes entries.
    Action("app_allow", "Let Blokk {verb} {app}.",
           args=("app",), optional=("verb",), pinned=True,
           run=_app_allow, phrase=_say_app_allow),
    Action("app_block", "Stop Blokk touching {app}.",
           args=("app",), optional=("verb",), pinned=True,
           run=_app_block, phrase=_say_app_block),
    Action("remove_source", "Remove the source called {name}.",
           args=("name",), pinned=True, run=_remove_source,
           phrase=_say_remove),
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
        # Identifiers are identifiers. A source called "; DROP" is not one,
        # and neither is a kind that is not one of the kinds.
        if key == "name" and not ID.match(v):
            raise Rejected(f"{v!r} is not a source name")
        if key == "kind":
            from core import sources
            if v not in sources.KINDS:
                raise Rejected(f"{v!r} is not a kind. One of: "
                               + ", ".join(sources.KINDS))
        # The app has to be one Blokk knows how to touch, and it is written
        # back in the app's own name — the preview under the Approve button
        # says "Let Blokk read Mail", not whatever spelling arrived.
        if key == "app":
            from core import permission
            row = permission.known(v)
            if not row:
                raise Rejected(f"{v!r} is not an app Blokk knows how to "
                               f"touch. One of: "
                               + ", ".join(a["app"] for a in permission.APPS))
            v = row["app"]
        if key == "verb":
            if v and v.lower() not in ("read", "write"):
                raise Rejected(f"{v!r} is not a thing done to an app. It is "
                               f"read or write.")
            v = v.lower()
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
            # the file all agree about when is meant. A model that writes
            # 03/09/2026 is not making a mistake; leaving it as text until
            # the executor is.
            #
            # A time of day survives. This only ever held bookings, which
            # are counted in nights, so anything carrying a clock was
            # refused as "not a date" — and a diary is mostly things with
            # times on them. The whole-day form still normalises the same
            # way, so nothing that worked before changes.
            from datetime import datetime as _dt
            from core.connectors.ics_out import _as_date
            try:
                v = _dt.fromisoformat(v.replace(" ", "T")).isoformat(
                    timespec="minutes")
            except ValueError:
                try:
                    v = _as_date(v).isoformat()
                except ValueError as ex:
                    raise Rejected(str(ex)) from None
        if key == "when":
            # Normalised here so the sentence under the Approve button is a
            # real day, not whatever word the model wrote. "Thursday" is not
            # a mistake a person should meet as a ValueError three steps
            # later — and it is refused rather than resolved, because a
            # reminder that quietly picks its own Thursday is one you
            # approved for a different day.
            from datetime import datetime as _dtv
            from core.connectors.ics_out import _as_date as _adv
            try:
                v = _dtv.fromisoformat(v.replace(" ", "T")).date().isoformat()
            except ValueError:
                try:
                    v = _adv(v).isoformat()
                except ValueError:
                    raise Rejected(
                        f"{v!r} is not a day this can read. It wants a real "
                        f"date, like 2026-09-03.") from None
        if key == "approval" and not re.match(r"^a_[A-Za-z0-9_]{1,64}$", v):
            raise Rejected(f"{v!r} is not the id of a queued item")
        if key == "title" and len(v) < 2:
            raise Rejected("it needs something to call it")
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
    if "app" in clean and clean.get("verb"):
        from core import permission
        row = permission.known(clean["app"])
        if row and clean["verb"] not in row["verbs"]:
            raise Rejected(f"Blokk cannot {clean['verb']} {row['app']} at "
                           f"all — there is no such door to open or "
                           f"close.")
    if "start" in clean and "end" in clean:
        from datetime import date as _date, datetime as _dt
        w_s, w_e = _at(clean["start"]), _at(clean["end"])
        s_, e_ = _as_day(w_s), _as_day(w_e)
        # Two rules, because there are two kinds of entry and one rule
        # cannot cover both. A thing with a time on it has to end after it
        # starts. A whole-day thing runs to the morning after the last day,
        # so its end is exclusive and "the 3rd to the 3rd" is no days at
        # all — which is the mistake somebody actually makes.
        # A bare ISO date parses as midnight, so "2026-10-05" arrives here
        # as a datetime — and a midnight-to-midnight pair is a whole-day
        # entry wearing a clock, not a timed one. Splitting on the type
        # alone sent "the 5th to the 5th" into the timed rule, which
        # rejected it as "00:00 is not after 00:00" — true, and the wrong
        # lesson: the whole-day message is the one that says what to type
        # instead.
        timed = (isinstance(w_s, _dt) and isinstance(w_e, _dt)
                 and (w_s.hour, w_s.minute, w_e.hour, w_e.minute)
                     != (0, 0, 0, 0))
        if timed:
            if w_e <= w_s:
                raise Rejected(
                    f"{w_e:%H:%M} is not after {w_s:%H:%M} \u2014 an entry "
                    f"with a time on it has to end after it starts.")
        elif e_ <= s_:
            raise Rejected(
                f"{e_:%-d %b} is not after {s_:%-d %b} \u2014 a whole-day "
                f"entry runs to the morning after the last day. For the "
                f"{_ord(s_.day)} alone, that is {s_ + _day():%Y-%m-%d}. "
                f"For an hour of it, put a time on both ends.")
        if s_ < _date.today() - _day():
            raise Rejected(f"{s_:%-d %b %Y} is in the past")
        # An entry this long is a misread sentence far more often than it
        # is a real one. "The 5th to the 5th of March" is a thing somebody
        # types and it can be read as 28 days; better to say the number out
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

    The action's *name* is not editable. Changing "back up" into "remove a
    source" between the sentence somebody read and the thing that runs is
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
