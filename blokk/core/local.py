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
     "reads": "messages Mail.app has already downloaded"},
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
    except OSError as e:
        # sqlite files under TCC can come back as EPERM-shaped OSErrors that
        # are not PermissionError; treat an unreadable existing file as denied.
        return False, "denied" if p.exists() else "missing"


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
        out.append({
            "id": s["id"], "what": s["what"], "kind": s["kind"],
            "kind_local": s.get("kind_local"),
            "path": str(p).replace(str(HOME), "~"),
            "reads": s["reads"],
            "present": present, "readable": ok,
            "state": "ready" if ok else ("blocked" if why == "denied"
                                         else "not set up"),
            "detail": {
                "ready": "Blokk can read this now.",
                "blocked": "It is here, but macOS is not letting Blokk read "
                           "it. That is Full Disk Access.",
                "not set up": f"Nothing at {p.name} — this app has not stored "
                              f"anything locally on this Mac.",
            }["ready" if ok else ("blocked" if why == "denied" else "not set up")],
        })
    blocked = [s for s in out if s["state"] == "blocked"]
    return {"mac": True, "sources": out, "grant_to": granting_app(),
            "blocked": len(blocked),
            "how": ["Apple menu > System Settings > Privacy & Security",
                    "Full Disk Access",
                    f"Turn on {granting_app()}",
                    "Quit it completely and start Blokk again — the "
                    "permission is only picked up on launch"]}
