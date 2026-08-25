"""Writing a date into the diary, the only honest way this can from here.

Blokk can read your calendar and find the three free nights. Until now that
was where it stopped: somebody read "3rd to the 6th is free" off the screen
and typed it into Calendar themselves, which is the step where the wrong
month gets picked.

Writing *into* Calendar.app needs EventKit, a signed bundle and a consent
dialog — a different kind of program from this one. So this writes the
thing Calendar already knows how to swallow: a .ics file in a folder you
chose. Double-click it, or drag it in. Two seconds instead of thirty, and
nothing was asked for that this cannot honestly hold.

That is a halfway house and it is labelled as one. What it must not be is a
halfway house that *pretends*: nothing here says "added to your calendar",
because it was not. It says a file is waiting, and where.

Three properties this file exists to hold:

  * **A UID that comes from the booking, not from the clock.** Same hold,
    same UID, same filename — so a replayed sweep overwrites one file
    instead of leaving four, and dragging it in twice updates the event
    rather than duplicating it. Durable execution replays; a writer keyed on
    now() quietly turns every crash into a mess someone has to clean up.

  * **Real RFC 5545 on the way out.** Long lines folded, TEXT values
    escaped. The reader in ical.py already unfolds and unescapes, which is
    how we know both matter: an unescaped comma in a summary is a *list
    separator*, and Calendar will silently keep the half before it.

  * **DTEND is exclusive, and that is not a bug.** A cottage booked "the 3rd
    to the 6th" is three nights, out on the morning of the 6th. All-day
    DTEND means the first day *not* included, so the 6th is exactly right.
    It is also the single most-made mistake in this format, so it is spelled
    out here and pinned by a probe rather than left to be rediscovered.
"""
from __future__ import annotations

import hashlib
import os
import re

from datetime import date, datetime, timedelta
from pathlib import Path

# Where the files land. A folder, not a mailbox and not a database: the
# point is that a person can open it, see what is waiting, and delete one
# without asking Blokk's permission.
ROOT = Path(os.environ.get("BLOKK_ICS_OUT") or (Path.home() / "Blokk/Holds"))

MAX_TITLE = 200
MAX_NOTE = 2000
# A year out is already beyond what anyone is holding a cottage for, and it
# is the bound that stops a typo'd year writing a file dated 20260 or 3026.
MAX_AHEAD = timedelta(days=730)
SAFE = re.compile(r"[^A-Za-z0-9 _-]+")


def _esc(v: str) -> str:
    """Escape a TEXT value. Backslash first, or it escapes its own escapes."""
    return (str(v).replace("\\", "\\\\").replace(";", "\;")
            .replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n"))


def _fold(line: str) -> str:
    """RFC 5545: no content line over 75 octets. Counted in octets, not
    characters, because a folded UTF-8 sequence is a corrupt file and an
    accented name is enough to produce one."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        # 74 to leave room for the leading space every continuation carries.
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n ".join(out)


def _as_when(v):
    """A datetime if there is a time in it, a date if there is not.

    The distinction this file did not have. It only ever wrote bookings,
    which are counted in nights and start at whatever time the key box
    opens, so everything here was a whole-day event. A person's diary is
    mostly things with times on them, and "Dentist" written as an all-day
    entry is visibly the wrong thing in Calendar.
    """
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return v
    s = str(v or "").strip().replace(" ", "T")
    if "T" in s:
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            pass
    return _as_date(v)


def _timed(s, e) -> bool:
    """Both ends carry a clock, and it is not midnight to midnight."""
    return (isinstance(s, datetime) and isinstance(e, datetime)
            and (s.hour, s.minute, e.hour, e.minute) != (0, 0, 0, 0))


def _as_date(v) -> date:
    """A date from what a model or a person actually writes."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    if "T" in s or " " in s:
        try:
            return datetime.fromisoformat(s.replace(" ", "T")).date()
        except ValueError:
            pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"{v!r} is not a date. It wants something like "
                     f"2026-09-03.")


def uid_for(title: str, start: date, end: date) -> str:
    """The same booking, every time, from any run.

    Deliberately not random and deliberately not timestamped: this is the
    idempotency key, and a replay after a crash has to arrive at the same
    one or the journal's guarantee stops at this file.

    The workspace used to be the first thing in this hash. Taking it out
    changes every UID, which means a hold written before workspaces went
    away and re-proposed after it would land beside the old file rather
    than over it — the same booking, twice, in somebody's calendar. hold()
    sweeps the old one out; see the note there.
    """
    seed = f"{title.strip().lower()}|{start:%Y%m%d}|{end:%Y%m%d}"
    return "blokk-" + hashlib.sha256(seed.encode()).hexdigest()[:16] \
           + "@blokk.local"


def _stem(title: str) -> str:
    """The title, squeezed to characters a filename can hold.

    SAFE keeps letters, digits, space, underscore and hyphen and nothing
    else, which is also what makes it safe to put in a glob pattern below —
    a booking called "Smith * 3-6" cannot become a wildcard.
    """
    return " ".join(SAFE.sub(" ", title).split())[:40].strip() or "hold"


def _filename(title: str, start: date, uid: str) -> str:
    """Readable enough to recognise in Finder, unique enough not to collide.

    The title is squeezed to safe characters — a booking called "Smith/Jones
    3–6" must not write to a directory called Smith.
    """
    return f"{start:%Y-%m-%d} {_stem(title)} {uid[6:14]}.ics"


def build(title: str, start, end, note: str = "",
          where: str = "", stamp: datetime | None = None) -> tuple[str, str]:
    """The file's text and the UID in it. No disk, so it can be shown first.

    Split out from write() on purpose: the preview under an Approve button
    should be able to say exactly what will be written without anything
    having been written.
    """
    title = str(title or "").strip()
    if not title:
        raise ValueError("it needs something to call it")
    if len(title) > MAX_TITLE:
        raise ValueError(f"that title is {len(title)} characters and the "
                         f"limit is {MAX_TITLE}")
    note = str(note or "")[:MAX_NOTE]
    w_s, w_e = _as_when(start), _as_when(end)
    timed = _timed(w_s, w_e)
    s, e = _as_date(start), _as_date(end)
    if timed:
        if w_e <= w_s:
            raise ValueError(f"{w_e:%H:%M} is not after {w_s:%H:%M} — an "
                             f"entry with a time on it needs to end after "
                             f"it starts.")
    elif e <= s:
        raise ValueError(f"{e:%-d %b} is not after {s:%-d %b} — a whole-day "
                         f"entry runs to the morning after the last day.")
    if s < date.today() - timedelta(days=1):
        raise ValueError(f"{s:%-d %b %Y} is in the past")
    if s > date.today() + MAX_AHEAD:
        raise ValueError(f"{s:%-d %b %Y} is over two years out — check the "
                         f"year.")
    uid = uid_for(title, w_s if timed else s, w_e if timed else e)
    when = (stamp or datetime.utcnow()).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Blokk//Hold//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{when}",
        # Timed, or whole-day with DTEND the morning after the last day.
        # The whole-day end is exclusive, on purpose, and pinned by a probe;
        # a timed end is just the end.
        *( [f"DTSTART:{w_s:%Y%m%dT%H%M%S}", f"DTEND:{w_e:%Y%m%dT%H%M%S}"]
           if timed else
           [f"DTSTART;VALUE=DATE:{s:%Y%m%d}", f"DTEND;VALUE=DATE:{e:%Y%m%d}"] ),
        f"SUMMARY:{_esc(title)}",
        # Held, not confirmed. The status is part of the honesty: nobody
        # has replied to anyone yet.
        "STATUS:TENTATIVE",
        "TRANSP:OPAQUE",
    ]
    if where:
        lines.append(f"LOCATION:{_esc(where)}")
    if note:
        lines.append(f"DESCRIPTION:{_esc(note)}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(_fold(ln) for ln in lines) + "\r\n", uid


class IcsDrop:
    """Writes a hold to a folder. The only connector in Blokk that writes.

    Held to the same contract as the readers: it is handed where to write
    at construction, it never reaches the network, and it says what it did
    in plain dicts.
    """

    kind = "ics_out"
    writes = True

    def __init__(self, keychain_ref: str = "local", root: Path | None = None):
        self.ref = keychain_ref
        self.root = Path(root) if root else (
            Path(keychain_ref).expanduser()
            if keychain_ref and keychain_ref.lower() not in ("local", "default")
            else ROOT)

    def check(self) -> dict:
        """Can it write there, and what is already waiting.

        Creates the folder — a writer that reports "ok" and fails on the
        first real write has told you nothing. The touch is removed again;
        an empty file left behind in somebody's folder is litter with
        Blokk's name on it.
        """
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            probe = self.root / ".blokk-write-test"
            probe.write_text("")
            probe.unlink()
        except OSError as e:
            raise PermissionError(
                f"cannot write to {self.root}: {e.strerror or e}. Pick a "
                f"folder you own — ~/Blokk/Holds is the default.") from None
        waiting = sorted(p.name for p in self.root.glob("*.ics"))
        return {"ok": True, "folder": str(self.root), "waiting": len(waiting),
                "files": waiting[:10],
                "note": "Files written here. Double-click one to put it in "
                        "Calendar — Blokk cannot put it there itself."}

    def hold(self, title: str, start, end, note: str = "",
             where: str = "", stamp: datetime | None = None) -> dict:
        """Write one hold. Same booking overwrites, never duplicates."""
        text, uid = build(title, start, end, note, where, stamp)
        self.root.mkdir(parents=True, exist_ok=True)
        day = _as_date(start)
        path = self.root / _filename(title, day, uid)
        existing = path.exists()
        # Written whole and moved into place: a half-written .ics that
        # Calendar reads mid-write is a worse outcome than no file.
        tmp = path.with_suffix(".ics.part")
        tmp.write_text(text, encoding="utf-8", newline="")
        tmp.replace(path)
        # The UID is a hash of the booking, and the workspace used to be the
        # first thing in it. Any file for this same day and title carrying a
        # different one is the same booking under the old scheme — leaving it
        # there is two entries in the calendar for one stay, which is exactly
        # what "never duplicates" promises not to do.
        stale = [p for p in self.root.glob(f"{day:%Y-%m-%d} {_stem(title)} *.ics")
                 if p.name != path.name]
        for p in stale:
            try:
                p.unlink()
            except OSError:
                pass
        return {"ok": True, "uid": uid, "path": str(path),
                "file": path.name, "replaced": existing,
                "superseded": [p.name for p in stale],
                "folder": str(self.root)}

    def drop(self, uid: str) -> dict:
        """Take a hold back out of the folder.

        Only removes what Blokk wrote — matched on the uid in the file, not
        on the filename, so a rename by hand cannot be turned into a way to
        delete something else in that folder.
        """
        for p in self.root.glob("*.ics"):
            try:
                if f"UID:{uid}" in p.read_text(encoding="utf-8",
                                               errors="replace"):
                    p.unlink()
                    return {"ok": True, "removed": p.name}
            except OSError:
                continue
        return {"ok": False, "detail": "no file here with that uid"}
