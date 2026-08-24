"""Putting a date in Calendar.app itself, rather than next to it.

`ics_out.py` writes a .ics file you double-click. That is honest and it is
still two steps, and the second step is the one somebody forgets — a folder
of holds nobody opened is a diary that is wrong in the direction that sells a
bed twice.

Writing into Calendar properly means EventKit, which means a signed app
bundle and an entitlement: a different kind of program from this one, and the
reason this was on the "not built yet" list. But Calendar.app is scriptable
and `osascript` is a system binary, so there is a third way. macOS still asks
the person, once, with its own dialog — Blokk does not and cannot grant
itself that permission, and the first attempt is the thing that triggers it.

Three rules hold this file up.

**A guest's name is data, and AppleScript has no placeholders.** There is no
parameterised query here — the script is a string, and a summary of

    Smith" & (do shell script "rm -rf ~") & "

is a command if it is pasted in and a name if it is not. So nothing is
pasted: every value goes in as an AppleScript string literal built by
`_lit()`, which escapes the two characters that can end one, and anything
with a control character in it is refused outright rather than escaped
cleverly. This is the injection surface of the whole file and it is one
function wide on purpose.

**It says what actually happened.** `add()` returns whether Calendar took it,
and the caller falls back to the file drop when it did not. Nothing in Blokk
may say a diary changed unless this returned ok.

**It is not available anywhere but a Mac with Calendar.** `available()` says
so before anything tries, so the answer to "why did nothing happen" is a
sentence rather than an osascript error code.
"""
from __future__ import annotations

import platform
import re
import shutil
import subprocess

from datetime import date, datetime

# A control character cannot appear in an AppleScript string literal at all,
# and a value carrying one is either corrupt or an attempt. Refused rather
# than stripped: quietly rewriting somebody's data to make it fit is how you
# end up with an event called something nobody typed.
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
TIMEOUT = 20            # osascript waiting on a consent dialog


class CalendarError(RuntimeError):
    """Calendar could not be asked, or said no. Always with a sentence."""


def available() -> tuple[bool, str]:
    """Whether this Mac can be asked at all, and why not if it cannot."""
    if platform.system() != "Darwin":
        return (False, "Calendar.app is macOS only — the .ics file in your "
                       "holds folder is what this machine can do.")
    if not shutil.which("osascript"):
        return (False, "osascript is missing, which should not happen on a "
                       "Mac. The .ics file is written either way.")
    return (True, "")


def _lit(value: str) -> str:
    r"""One AppleScript string literal, from arbitrary text.

    AppleScript strings end at an unescaped `"`, and `\` escapes. Those are
    the two characters that matter and both are escaped here. Everything else
    — including `&`, `(`, `do shell script` and every other frightening
    sequence — is inert *inside* a literal, which is why the whole defence is
    making sure the literal is never left.
    """
    text = str(value if value is not None else "")
    if CONTROL.search(text):
        raise CalendarError(
            "that text has a control character in it, which cannot go into a "
            "calendar entry. Retype it, or take the hold as a file instead.")
    # Backslash first, or it escapes its own escapes. Then the quote. Then
    # the three whitespace characters that are legal in the text and illegal
    # raw inside a literal: AppleScript strings do not span lines, so a note
    # with a newline in it is a compile error rather than a two-line note —
    # which fails at osascript with a syntax message about a file nobody
    # wrote, on a booking that had a paragraph break in it.
    return '"' + (text.replace("\\", "\\\\").replace('"', '\\"')
                  .replace("\r\n", "\\n").replace("\n", "\\n")
                  .replace("\r", "\\n").replace("\t", "\\t")) + '"'


def _as_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    return datetime.fromisoformat(str(value)[:19])


def calendars() -> list[str]:
    """Every calendar Calendar.app knows about, by name.

    So a hold can be put in "Bookings" rather than wherever Calendar happens
    to default to — which on a Mac with a work account and a personal one is
    a coin toss, and the wrong side of it puts a guest in somebody's private
    diary.
    """
    ok, why = available()
    if not ok:
        raise CalendarError(why)
    out = _run('tell application "Calendar" to get name of every calendar')
    return [n.strip() for n in out.split(",") if n.strip()]


def _run(script: str) -> str:
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True,
                           text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired as e:
        raise CalendarError(
            "Calendar did not answer within 20 seconds. macOS asks for "
            "permission the first time and it may be waiting behind another "
            "window — allow it and try again.") from e
    except OSError as e:
        raise CalendarError(f"could not run osascript: {e}") from e
    if r.returncode != 0:
        err = (r.stderr or "").strip()
        # The two that have a real fix, said as the fix rather than as the
        # error code somebody would otherwise go and search for.
        if "-1743" in err or "not allowed" in err.lower():
            raise CalendarError(
                "macOS has not been given permission to let Blokk talk to "
                "Calendar. System Settings > Privacy & Security > Automation, "
                "tick Calendar under whatever starts Blokk, and try again.")
        if "-1728" in err:
            raise CalendarError(
                "Calendar has no calendar by that name. Ask for the list "
                "first — connect.py calendars — and use one of those.")
        raise CalendarError(f"Calendar refused: {err[:200] or r.returncode}")
    return (r.stdout or "").strip()


def add(title: str, start, end, *, calendar: str = "", note: str = "",
        where: str = "", all_day: bool = True, uid: str = "",
        dry_run: bool = False) -> dict:
    """Put one event in Calendar.app. Returns what actually happened.

    `end` is exclusive, the same as the .ics path and for the same reason: a
    cottage booked the 3rd to the 6th is three nights, out on the morning of
    the 6th. Calendar's own model is inclusive-of-the-instant, so an all-day
    event ending at 00:00 on the 6th is exactly right and the arithmetic is
    left alone rather than adjusted twice.
    """
    ok, why = available()
    if not ok and not dry_run:
        raise CalendarError(why)
    s, e = _as_dt(start), _as_dt(end)
    if e <= s:
        raise CalendarError(f"{e:%-d %b} is not after {s:%-d %b}")
    if not str(title or "").strip():
        raise CalendarError("an event needs something to call it")

    # Dates are built from numbers, never from a formatted string: a date
    # string is parsed by whatever the Mac's locale says, and 03/09 is two
    # different days either side of the Atlantic.
    def stamp(d: datetime, name: str) -> str:
        # `day` first, and to 1. AppleScript dates are mutated field by
        # field and each assignment normalises: run this on the 31st and
        # `set month to 2` is 31 February, which rolls forward to 3 March,
        # and the day set afterwards lands in the wrong month. Going to the
        # 1st first means every intermediate state is a real date.
        return (f'set {name} to (current date)\n'
                f'set day of {name} to 1\n'
                f'set year of {name} to {d.year}\n'
                f'set month of {name} to {d.month}\n'
                f'set day of {name} to {d.day}\n'
                f'set time of {name} to {d.hour * 3600 + d.minute * 60}\n')

    target = (f'calendar {_lit(calendar)}' if calendar
              else 'first calendar whose writable is true')
    # Calendar will not accept a uid on creation, so the hold's own id goes
    # in the description — one line, at the end. That is what makes a second
    # attempt at the same booking findable rather than a duplicate, and it is
    # built once here rather than appended to a props list twice.
    description = note or ""
    if uid:
        description = (description + "\n" if description else "") + \
                      f"blokk-uid: {uid}"
    props = [f'summary:{_lit(title)}', 'start date:d1', 'end date:d2',
             f'allday event:{"true" if all_day else "false"}']
    if description:
        props.append(f'description:{_lit(description)}')
    if where:
        props.append(f'location:{_lit(where)}')
    script = (stamp(s, "d1") + stamp(e, "d2")
              + f'tell application "Calendar"\n'
              + f'  tell {target}\n'
              + f'    make new event at end with properties '
              + '{' + ", ".join(props) + '}\n'
              + '    return name of it\n'
              + '  end tell\n'
              + 'end tell')
    if dry_run:
        # The script, unrun. This exists because the interesting half of this
        # file cannot be tested on anything but a Mac with Calendar, and the
        # dangerous half — whether a guest's name can stop being a string —
        # is entirely in the text that comes out of here. A probe can read
        # that on any machine.
        return {"ok": False, "dry_run": True, "script": script}
    name = _run(script)
    return {"ok": True, "calendar": name or calendar or "your default calendar",
            "detail": f"added to {name or calendar or 'your calendar'}"}


def find(uid: str, days: int = 800) -> list[str]:
    """Summaries of events carrying this hold's uid. For not duplicating."""
    ok, why = available()
    if not ok:
        raise CalendarError(why)
    out = _run(
        'tell application "Calendar"\n'
        '  set found to {}\n'
        '  repeat with c in every calendar\n'
        f'    set matches to (every event of c whose description contains '
        f'{_lit("blokk-uid: " + uid)})\n'
        '    repeat with m in matches\n'
        '      set end of found to summary of m\n'
        '    end repeat\n'
        '  end repeat\n'
        '  return found\n'
        'end tell')
    return [n.strip() for n in out.split(",") if n.strip()]
