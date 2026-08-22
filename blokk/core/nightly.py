"""The night shift.

Blokk's whole premise is that the queue is full when you wake up. Until this
existed, nothing ran the sweep — the launch agent kept the *server* alive and
the sweep happened when somebody pressed a button. The README said overnight;
the machine said when you ask.

Why a thread in the control plane rather than cron or a launchd calendar
interval: the control plane is already always-on under launchd, and a second
scheduler outside it would start a second process against the same database.
Two blokks writing to one file is the own-goal A22 exists to name.

The hard part is not the timer. It is that this runs on a laptop:

  * The lid is shut at 04:00. Timers do not fire while a Mac sleeps, and the
    one that was due does not fire on wake either — it fires late, or never.
    So this does not schedule anything. It asks, once a minute, a question
    with no memory in it: has today's window opened, and have we not swept
    today? At 09:14 when the lid opens, the answer is yes, and the sweep runs
    then. Late is the point. Never is the failure.

  * The Mac is awake at 04:00 and someone already pressed Sweep at 23:50.
    The day is the key, so it does not run twice. h_sweep enforces the same
    rule per workspace; this is the same rule one level up.

  * A day is missed entirely. Then the window since the last sweep is 48
    hours, not 12, and the sweep has to be told that rather than assuming.
    The `since` below is what the sweep reads from, and it comes from the
    last run that actually happened.
"""
from __future__ import annotations

import threading
import time as _time
from datetime import datetime, timedelta, timezone

DEFAULT_AT = "04:00"
FLOOR_DAYS = 7          # a first sweep reads a week, not the whole archive


def _hhmm(text: str) -> tuple[int, int] | None:
    """'04:00' -> (4, 0). Anything else -> None, which means off."""
    try:
        h, _, m = (text or "").strip().partition(":")
        hh, mm = int(h), int(m or 0)
        if 0 <= hh <= 23 and 0 <= mm <= 59:
            return hh, mm
    except (ValueError, AttributeError):
        pass
    return None


def due(now: datetime, at: str, last_swept: str | None) -> bool:
    """Should a sweep start right now?

    Deliberately has no memory and no notion of "missed". It compares three
    values, so the same inputs always give the same answer and a test can
    walk a laptop through a week of lids opening and closing.

    `last_swept` is a date string (YYYY-MM-DD) or None.
    """
    hm = _hhmm(at)
    if hm is None:
        return False                       # off
    if last_swept == now.date().isoformat():
        return False                       # already done today
    return (now.hour, now.minute) >= hm


def next_at(now: datetime, at: str, last_swept: str | None) -> str:
    """When the next one will run, as a plain sentence's worth of ISO.

    Not a countdown: on a laptop the honest answer is "when the window is
    open and the Mac is awake", and pretending to know the minute is how a
    dashboard ends up lying about a machine that was asleep.
    """
    hm = _hhmm(at)
    if hm is None:
        return ""
    if due(now, at, last_swept):
        return now.replace(second=0, microsecond=0).isoformat(timespec="minutes")
    day = now.date()
    if last_swept == day.isoformat() or (now.hour, now.minute) >= hm:
        day = day + timedelta(days=1)
    return datetime(day.year, day.month, day.day, hm[0], hm[1]).isoformat(
        timespec="minutes")


# ------------------------------------------------------------------ settings
def get_at(store) -> str:
    row = store.one("SELECT value FROM setting WHERE key='sweep_at'")
    return row["value"] if row else DEFAULT_AT


def set_at(store, at: str) -> str:
    """'' or 'off' turns it off. Anything unparseable is refused, not stored."""
    value = "" if at.strip().lower() in ("", "off", "never") else at.strip()
    if value and _hhmm(value) is None:
        raise ValueError(f"{at!r} is not a time of day like 04:00")
    store.x("INSERT INTO setting(key,value) VALUES('sweep_at',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", value)
    return value


def _as_local(ts) -> datetime | None:
    """A run's started_at — UTC, SQLite's space-separated shape — as local time.

    Two clocks meet here and they are not the same clock. "04:00" means four
    in the morning where the Mac is; the journal is UTC because a journal
    that is not is unreadable the day the clocks change. Comparing a UTC date
    against a local one is fine for most of the day and wrong for exactly the
    hours around midnight, which is when a nightly sweep lives.
    """
    try:
        d = datetime.fromisoformat(str(ts).replace(" ", "T")[:19])
    except (ValueError, TypeError):
        return None
    return d.replace(tzinfo=timezone.utc).astimezone()


def last_sweep(store) -> dict:
    """The last sweep that actually started, whatever became of it.

    Read from the run table rather than kept as a separate marker: a marker
    that says a sweep happened and a run table that disagrees is a bug you
    find at 04:00, and the run table is the one holding the journal.
    """
    row = store.one(
        "SELECT started_at, status FROM run WHERE workflow='morning_sweep' "
        "AND status IN ('running','suspended','done','failed') "
        "ORDER BY started_at DESC LIMIT 1")
    if not row:
        return {"at": "", "date": None, "status": "", "utc": ""}
    local = _as_local(row["started_at"])
    return {"at": local.isoformat(timespec="minutes") if local
                  else str(row["started_at"]),
            "date": local.date().isoformat() if local else None,
            "utc": str(row["started_at"]),
            "status": row["status"]}


def since_for(store, now: datetime) -> str:
    """The window the next sweep should read.

    The last sweep's start, floored a week back. A fixed twelve hours meant
    that a night the Mac spent asleep was a night of mail nobody read — the
    sweep ran late and still only looked back twelve hours from *then*.
    """
    # Returned with an explicit offset. The workflow subtracts this from
    # ctx.now(), which is timezone-aware, and Python refuses to subtract a
    # naive datetime from an aware one — a sweep that failed with
    # "can't subtract offset-naive and offset-aware datetimes" and journalled
    # exactly nothing about the mail it was there to read.
    floor = (now.astimezone() - timedelta(days=FLOOR_DAYS))
    last = _as_local(last_sweep(store)["utc"])
    start = max(last, floor) if last else floor
    return start.isoformat(timespec="seconds")


# ----------------------------------------------------------------- the thread
class Nightly:
    """Asks once a minute. Owns no state beyond the thread itself."""

    def __init__(self, store, sweep, expire, clock=datetime.now, tick=60.0):
        self.store, self.sweep, self.expire = store, sweep, expire
        self.clock, self.tick = clock, tick
        self.last_error = ""
        self.fired = 0
        self._stop = threading.Event()

    def state(self) -> dict:
        now = self.clock()
        at = get_at(self.store)
        last = last_sweep(self.store)
        return {"at": at, "on": bool(_hhmm(at)),
                "last": last["at"], "last_status": last["status"],
                # "due" rather than leaving the caller to compare a timestamp
                # against its own clock — the phone's clock is not this Mac's.
                "due": due(now, at, last["date"]),
                "next": next_at(now, at, last["date"]),
                "error": self.last_error}

    def once(self) -> bool:
        """One question, one possible sweep. Returns whether it swept."""
        now = self.clock()
        try:
            self.expire()
        except Exception as e:                                   # noqa: BLE001
            # Expiring stale approvals must never be what stops the sweep.
            self.last_error = f"expire: {e}"[:200]
        if not due(now, get_at(self.store), last_sweep(self.store)["date"]):
            return False
        try:
            self.sweep(since_for(self.store, now))
            self.fired += 1
            self.last_error = ""
            return True
        except Exception as e:                                   # noqa: BLE001
            # Loudly, in the state the dashboard reads — and it will try
            # again on the next tick, because `last_swept` did not move.
            self.last_error = f"{type(e).__name__}: {e}"[:200]
            return False

    def start(self) -> threading.Thread:
        def loop():
            while not self._stop.wait(self.tick):
                self.once()
        t = threading.Thread(target=loop, daemon=True, name="nightly")
        t.start()
        return t

    def stop(self) -> None:
        self._stop.set()
