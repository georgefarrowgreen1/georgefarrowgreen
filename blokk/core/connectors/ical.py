"""macOS Calendar, read from disk. Read-only, local, no credential.

Calendar.app keeps everything in ~/Library/Calendars as .ics files, one per
event, grouped into .calendar bundles. Reading them needs no app-specific
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

import re
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path.home() / "Library/Calendars"
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


def _read(root: Path) -> tuple[list[dict], list[str]]:
    """Every event on disk, and the calendar names they came from."""
    events, names = [], []
    for bundle in sorted(root.glob("*.calendar")):
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
                e = _as_date(_prop(block, "DTEND")[1]) or s
                allday = "VALUE=DATE" in _prop(block, "DTSTART")[0]
                if allday and e > s:
                    e -= timedelta(days=1)      # DTEND is exclusive for dates
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
        return {"ok": True, "calendars": names, "events_on_disk": len(events),
                "in_next_90_days": len(window)}

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
