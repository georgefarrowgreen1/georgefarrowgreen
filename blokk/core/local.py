"""What this Mac already holds, and whether Blokk is allowed to read it.

Messages, Calendar and Mail all keep their data in your home folder. No
credential, no network, no API — but macOS puts them behind Full Disk
Access, and a process without it does not get "permission denied" anywhere
useful. It gets `unable to open database file`, or an empty directory, which
reads as "there is nothing there" rather than "you have not been let in".

So look, and say which of the two it is. The fix is a checkbox in System
Settings, and naming the app that needs ticking is most of the help.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

HOME = Path.home()

# id, what a person calls it, where it lives, and what reads it today
SOURCES = [
    {"id": "messages", "what": "Messages", "kind": "messages",
     "path": HOME / "Library/Messages/chat.db",
     "reads": "the whole archive, read-only, straight off disk"},
    {"id": "calendar", "what": "Calendar", "kind": "caldav",
     "path": HOME / "Library/Calendars",
     "kind_local": "ical",
     "reads": "events, without CalDAV or an app-specific password"},
    {"id": "mail", "what": "Mail", "kind": "imap",
     "path": HOME / "Library/Mail",
     "kind_local": "maildir",
     "reads": "messages Mail.app has already downloaded, without IMAP"},
]


def granting_app() -> str:
    """Which application needs the tick, not which binary.

    Full Disk Access is granted to the app that launched the process, so
    telling someone to allow "python3" sends them looking for something that
    is not in the list.
    """
    skip = {"python", "python3", "bash", "sh", "zsh", "-zsh", "-bash", "login",
            "run.sh", "blokk", "env"}
    try:
        pid = os.getppid()
        for _ in range(8):                       # up the tree, not far
            out = subprocess.run(["ps", "-o", "ppid=,comm=", "-p", str(pid)],
                                 capture_output=True, text=True, timeout=5).stdout
            if not out.strip():
                break
            parent, _, comm = out.strip().partition(" ")
            name = Path(comm.strip()).name
            if name and name not in skip:
                return name
            pid = int(parent)
    except Exception:
        pass
    return "the app you run Blokk from (Terminal, iTerm, or similar)"


# The Full Disk Access pane, addressed directly. This exact string is
# load-bearing: `open` on a System Settings URL with the wrong fragment
# lands somebody on the General pane with no idea why, which is worse than
# the four-step instructions it replaces.
FDA_PANE = ("x-apple.systempreferences:"
            "com.apple.preference.security?Privacy_AllFiles")


def open_settings() -> dict:
    """Open System Settings on the Full Disk Access pane, for the wizard's
    Grant button. The one step this cannot do is the tick itself — macOS
    reserves that for a person, which is the entire point of the pane — so
    the reply names the app to turn on and the caller watches for the
    grant to land rather than asking anybody to report back.
    """
    if os.uname().sysname != "Darwin":
        return {"error": "not macOS — Full Disk Access is a macOS setting"}
    try:
        subprocess.run(["open", FDA_PANE], timeout=10, check=True,
                       capture_output=True)
    except Exception as e:                                       # noqa: BLE001
        return {"error": f"could not open System Settings: "
                         f"{type(e).__name__}"}
    return {"ok": True, "grant_to": granting_app(),
            "note": f"System Settings is open at Full Disk Access. Turn on "
                    f"{granting_app()}, then come back — Blokk is watching "
                    f"for it."}


def _readable(p: Path) -> tuple[bool, str]:
    """Readable, and if not, whether that is absence or refusal."""
    try:
        if p.is_dir():
            next(iter(os.scandir(p)), None)      # a listing is the real test
        else:
            with open(p, "rb") as f:
                f.read(1)
        return True, ""
    except PermissionError:
        return False, "denied"
    except FileNotFoundError:
        return False, "missing"
    except OSError:
        # sqlite files under TCC can come back as EPERM-shaped OSErrors that
        # are not PermissionError; treat an unreadable existing file as denied.
        return False, "denied" if p.exists() else "missing"


def _contents(src: dict, root: Path) -> tuple[int, str]:
    """How much is actually there, cheaply.

    A readable folder is not the same as a folder with your data in it, and
    on this Mac the difference was the whole bug: ~/Library/Calendars listed
    fine, and every calendar in it was one level further down, inside a
    .caldav container that nothing was looking in.

    Bounded on purpose. This runs every time the panel opens, and a full walk
    of a large Mail folder is not a thing to do on a click.
    """
    try:
        if src["id"] == "calendar":
            from core.connectors.ical import bundles
            n = len(bundles(root))
            return n, f"{n} calendar(s)"
        if src["id"] == "mail":
            n = 0
            for f in root.rglob("*.emlx"):
                if f.name.endswith(".partial.emlx"):
                    continue
                n += 1
                if n >= 500:
                    return n, "500+ messages"
            return n, f"{n} message(s)"
        if src["id"] == "messages":
            size = root.stat().st_size if root.exists() else 0
            return (1 if size else 0), f"{size / 1024 / 1024:.0f} MB on disk"
    except Exception:                                            # noqa: BLE001
        return -1, ""                    # counting is a nicety, never a fault
    return -1, ""


def survey() -> dict:
    """Per source: is it here, and may we read it."""
    if os.uname().sysname != "Darwin":
        return {"mac": False, "sources": [], "grant_to": "",
                "note": "Local Apple sources are macOS only."}
    out = []
    for s in SOURCES:
        p: Path = s["path"]
        present = p.exists()
        ok, why = _readable(p) if present else (False, "missing")
        count, found = _contents(s, p) if ok else (-1, "")
        # Readable and empty is its own state. It reported "ready" while peek
        # showed nothing, which is the same screen disagreeing with itself.
        if ok and count == 0:
            ok, why = False, "empty"
        out.append({
            "found": found,
            "id": s["id"], "what": s["what"], "kind": s["kind"],
            "kind_local": s.get("kind_local"),
            "path": str(p).replace(str(HOME), "~"),
            "reads": s["reads"],
            "present": present, "readable": ok,
            "state": ("ready" if ok else
                      {"denied": "blocked", "empty": "empty"}.get(why,
                                                                 "not set up")),
            "detail": {
                "ready": f"Blokk can read this now — {found}."
                         if found else "Blokk can read this now.",
                "blocked": "It is here, but macOS is not letting Blokk read "
                           "it. That is Full Disk Access.",
                "empty": f"The folder opens and there is nothing in it. "
                         f"Either this app stores nothing on this Mac, or "
                         f"macOS is handing Blokk an empty listing because "
                         f"Full Disk Access is not granted — those look "
                         f"identical from here.",
                "not set up": f"Nothing at {p.name} — this app has not stored "
                              f"anything locally on this Mac.",
            }["ready" if ok else
              {"denied": "blocked", "empty": "empty"}.get(why, "not set up")],
        })
    blocked = [s for s in out if s["state"] in ("blocked", "empty")]
    return {"mac": True, "sources": out, "grant_to": granting_app(),
            "blocked": len(blocked),
            "how": ["Apple menu > System Settings > Privacy & Security",
                    "Full Disk Access",
                    f"Turn on {granting_app()}",
                    "Quit it completely and start Blokk again — the "
                    "permission is only picked up on launch"]}
