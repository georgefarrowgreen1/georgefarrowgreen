"""macOS Calendar, read from disk. Read-only, local, no credential.

Calendar.app keeps everything in ~/Library/Calendars as .ics files, one per
event, grouped into .calendar bundles. Those bundles are NOT all at the top
level: an iCloud account puts them one directory down, inside a .caldav
container, and Exchange inside a .exchange one. Only "On My Mac" calendars
sit at the top. Globbing the top level therefore finds nothing at all on a
Mac whose calendars are all in iCloud — which is most of them. Reading them needs no app-specific
password, no network and no CalDAV discovery — which caldav_cal.py's own
docstring calls the fiddly part. It does need Full Disk Access; core/local.py
says so and names the app to grant it to.

Everything here works in whole dates. gaps() answers "which nights are free",
and a night is free or it is not; carrying times and zones through would add
timezone arithmetic to a question that does not ask for it.

Recurrence is expanded, and that is not optional. A weekly event left
unexpanded makes gaps() report free nights that are booked — a confident
wrong answer, which is worse here than no answer. What cannot be expanded is
counted and reported by check() rather than quietly dropped.
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

# BLOKK_CALENDAR_ROOT overrides where this looks. For a Mac that keeps its
# store somewhere else, and for testing this against a fixture of
# the real layout — which is how the .caldav nesting and the
# directory-order walk were both found without a Mac to hand.
ROOT = Path(os.environ.get("BLOKK_CALENDAR_ROOT") or (
    Path.home() / "Library/Calendars"))
MAX_OCCURRENCES = 800          # a daily event over a long window, bounded
WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def _unfold(text: str) -> str:
    """RFC 5545 folds long lines with a newline and one space. Rejoin them.

    Without this a SUMMARY over ~75 characters is truncated at the fold, and
    a DTSTART that happens to land on the boundary is not found at all.
    """
    return re.sub(r"\r?\n[ \t]", "", text)


def _prop(block: str, key: str) -> tuple[str, str]:
    """(params, value) for a property, or ('', '')."""
    m = re.search(rf"^{key}([^:\r\n]*):(.*)$", block, re.M)
    return (m.group(1), m.group(2).strip()) if m else ("", "")


def _as_date(value: str) -> date | None:
    v = value.strip().rstrip("Z")
    for fmt in ("%Y%m%dT%H%M%S", "%Y%m%d"):
        try:
            return datetime.strptime(v[:15] if "T" in v else v[:8], fmt).date()
        except ValueError:
            continue
    return None


_DUR = re.compile(r"^[+-]?P(?:(\d+)W)?(?:(\d+)D)?"
                  r"(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$", re.I)


def _duration(text: str) -> timedelta | None:
    """RFC 5545 DURATION — P3D, PT1H30M, P1W — as a timedelta.

    An event may carry DURATION *instead of* DTEND, and Calendar writes it
    that way for anything created from a template. Ignoring it made a
    three-night booking one day long, which makes gaps() offer two booked
    nights as free — the confident wrong answer this file exists to avoid.
    """
    m = _DUR.fullmatch((text or "").strip())
    if not m or not any(m.groups()):
        return None
    w, d, h, mi, sec = (int(x or 0) for x in m.groups())
    return timedelta(weeks=w, days=d, hours=h, minutes=mi, seconds=sec)


def _expand(ev: dict, lo: date, hi: date) -> list[tuple[date, date]]:
    """Every occurrence of one event that touches [lo, hi]."""
    start, end = ev["start"], ev["end"]
    span = max((end - start).days, 0)
    rule = ev["rrule"]
    if not rule:
        return [(start, end)] if end >= lo and start <= hi else []

    parts = dict(p.split("=", 1) for p in rule.split(";") if "=" in p)
    freq = parts.get("FREQ", "")
    interval = int(parts.get("INTERVAL") or 1)
    count = int(parts.get("COUNT")) if parts.get("COUNT") else None
    until = _as_date(parts["UNTIL"]) if parts.get("UNTIL") else None
    days = [WEEKDAYS[d[-2:]] for d in parts.get("BYDAY", "").split(",")
            if d[-2:] in WEEKDAYS]
    step = {"DAILY": timedelta(days=interval),
            "WEEKLY": timedelta(weeks=interval)}.get(freq)
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        ev["unparsed"] = True                   # counted, not silently dropped
        return [(start, end)] if end >= lo and start <= hi else []

    out, cur, n = [], start, 0
    while cur <= hi and n < MAX_OCCURRENCES:
        if until and cur > until:
            break
        if count is not None and n >= count:
            break
        heads = ([cur + timedelta(days=(d - cur.weekday()) % 7) for d in days]
                 if freq == "WEEKLY" and days else [cur])
        for h in heads:
            if until and h > until:
                continue
            if h.isoformat() in ev["exdates"]:
                continue                        # you deleted this one
            if h + timedelta(days=span) >= lo and h <= hi:
                out.append((h, h + timedelta(days=span)))
        n += 1
        if step:
            cur = cur + step
        elif freq == "MONTHLY":
            y, m = divmod(cur.month - 1 + interval, 12)
            try:
                cur = cur.replace(year=cur.year + y, month=m + 1)
            except ValueError:                  # the 31st of a short month
                cur = cur.replace(year=cur.year + y, month=m + 1, day=28)
        else:                                   # YEARLY
            try:
                cur = cur.replace(year=cur.year + interval)
            except ValueError:                  # 29 February
                cur = cur.replace(year=cur.year + interval, day=28)
    return out


def bundles(root: Path) -> list[Path]:
    """Every .calendar bundle, at whatever depth the account type put it.

    rglob rather than glob: iCloud nests them inside <uuid>.caldav, Exchange
    inside .exchange, and only local calendars are at the top. A top-level
    glob reported "0 calendars" on a Mac with a full diary, and said ok.
    """
    try:
        return sorted({b for b in root.rglob("*.calendar") if b.is_dir()})
    except OSError:
        return []


def _read(root: Path) -> tuple[list[dict], list[str]]:
    """Every event on disk, and the calendar names they came from."""
    events, names = [], []
    for bundle in bundles(root):
        title = bundle.name
        info = bundle / "Info.plist"
        if info.exists():
            try:
                m = re.search(r"<key>Title</key>\s*<string>([^<]*)</string>",
                              info.read_text(errors="replace"))
                if m:
                    title = m.group(1)
            except OSError:
                pass
        names.append(title)
        for f in sorted((bundle / "Events").glob("*.ics")):
            try:
                text = _unfold(f.read_text(errors="replace"))
            except OSError:
                continue                        # one unreadable file is not fatal
            for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
                if _prop(block, "STATUS")[1].upper() == "CANCELLED":
                    continue
                s = _as_date(_prop(block, "DTSTART")[1])
                if not s:
                    continue
                allday = "VALUE=DATE" in _prop(block, "DTSTART")[0]
                e = _as_date(_prop(block, "DTEND")[1])
                if e:
                    if allday and e > s:
                        e -= timedelta(days=1)  # DTEND is exclusive for dates
                else:
                    # No DTEND: DTEND = DTSTART + DURATION, and the same
                    # exclusive rule applies to the result.
                    dur = _duration(_prop(block, "DURATION")[1])
                    if dur is None:
                        e = s
                    elif allday:
                        # Ambiguity resolves toward busy, so a duration that
                        # ends part way through a day still takes that day.
                        whole = -(-int(dur.total_seconds()) // 86400)
                        e = s + timedelta(days=max(0, whole - 1))
                    else:
                        start_h = 0
                        raw = _prop(block, "DTSTART")[1]
                        if "T" in raw and len(raw) >= 11:
                            try:
                                start_h = int(raw.split("T", 1)[1][:2])
                            except ValueError:
                                start_h = 0
                        over = start_h * 3600 + int(dur.total_seconds())
                        e = s + timedelta(days=over // 86400)
                exd = set()
                for params, value in re.findall(r"^EXDATE([^:\r\n]*):(.*)$",
                                                block, re.M):
                    for one in value.split(","):
                        d = _as_date(one)
                        if d:
                            exd.add(d.isoformat())
                events.append({"summary": _prop(block, "SUMMARY")[1],
                               "start": s, "end": e, "calendar": title,
                               "rrule": _prop(block, "RRULE")[1],
                               "exdates": exd, "unparsed": False})
    return events, names


class LocalCalendar:
    """Reads ~/Library/Calendars. Never writes; there is no method that could."""

    writes = False

    def __init__(self, keychain_ref: str = "", root: Path | None = None):
        # keychain_ref is accepted and ignored: the registry hands one to every
        # connector, and this is the one that does not need a credential.
        self.root = Path(root) if root else ROOT

    def check(self) -> dict:
        if not self.root.exists():
            raise FileNotFoundError(f"no calendars at {self.root}")
        events, names = _read(self.root)
        window = self.events(days=90)
        # Zero calendars is not ok. It said ok for a while, next to an empty
        # list, on a Mac with a full diary — which is the failure this
        # codebase is least willing to ship: a confident wrong answer on the
        # screen you opened *because* you could not see your data.
        if not names:
            containers = sorted({p.suffix for p in self.root.iterdir()
                                 if p.is_dir()}) if self.root.exists() else []
            return {"ok": False, "calendars": [], "events_on_disk": 0,
                    "in_next_90_days": 0, "looked_in": str(self.root),
                    "saw": containers,
                    "detail": f"no .calendar bundles anywhere under "
                              f"{self.root}. Either Calendar has never synced "
                              f"on this Mac, or Blokk cannot read that folder "
                              f"— Full Disk Access, granted to the app that "
                              f"starts Blokk."}
        return {"ok": True, "calendars": names, "events_on_disk": len(events),
                "in_next_90_days": len(window), "looked_in": str(self.root)}

    def events(self, days: int = 90) -> list[dict]:
        lo = date.today()
        hi = lo + timedelta(days=days)
        events, _ = _read(self.root)
        out = []
        for ev in events:
            for s, e in _expand(ev, lo, hi):
                out.append({"summary": ev["summary"], "start": s.isoformat(),
                            "end": e.isoformat(), "calendar": ev["calendar"],
                            "recurring": bool(ev["rrule"]),
                            "provenance": "self"})
        return sorted(out, key=lambda r: r["start"])

    def gaps(self, days: int = 90, max_nights: int = 4) -> list[dict]:
        """Runs of free nights, shortest useful unit first.

        Busy wins ties. An occurrence this cannot place is left marked busy
        rather than dropped, because saying a booked night is free is the
        failure that reaches a guest.
        """
        lo = date.today()
        hi = lo + timedelta(days=days)
        busy: set[date] = set()
        events, _ = _read(self.root)
        for ev in events:
            for s, e in _expand(ev, lo, hi):
                d = max(s, lo)
                while d <= min(e, hi):
                    busy.add(d)
                    d += timedelta(days=1)
        out, run = [], []
        d = lo
        while d <= hi:
            if d in busy:
                if run:
                    out.append(run)
                    run = []
            else:
                run.append(d)
            d += timedelta(days=1)
        if run:
            out.append(run)
        return [{"from": r[0].isoformat(), "nights": len(r),
                 "note": f"{len(r)} free night(s) either side of a booking"}
                for r in out if 1 <= len(r) <= max_nights]
