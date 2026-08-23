"""Copying the one file that matters, safely, while it is open.

blokk.db is the system: every approval, every correction you made, all the
trust that took weeks to earn. Losing it is not losing a cache, it is losing
the thing the product exists to accumulate. There was no way to copy it.

Not `cp`. SQLite in WAL mode keeps recent commits in a sidecar file, so a
plain copy of blokk.db taken while Blokk is running can be a database missing
its most recent writes — or torn mid-transaction. sqlite3's own backup API
copies a consistent snapshot of a live database, which is exactly this job.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path

# Both shapes: the millisecond names written now, and the second-granularity
# ones already sitting in somebody's backups folder.
_NAME = re.compile(r"blokk-(\d{4}-\d{2}-\d{2}-\d{6}(?:-\d{3})?)(?:-(\d+))?\.db")


def _stamp() -> str:
    # Milliseconds, not seconds, not minutes. Two backups a minute apart is
    # not a silly thing to do — before and after something risky is exactly
    # when you want them — and at each coarser granularity the fix was a -2
    # suffix, which then got recycled: after a prune freed the base name, the
    # next backup took it again, and the numbering stopped saying anything
    # about the order they were made in. A name nothing else can hold ends
    # the whole argument.
    return datetime.now().strftime("%Y-%m-%d-%H%M%S-%f")[:-3]


def make(db: str | Path, into: str | Path | None = None,
         keep: int = 14) -> dict:
    """Snapshot the database. Returns where it went and what it holds.

    Keeps the most recent `keep` and removes the rest, because a backup that
    fills the disk stops being a backup and starts being an outage.
    """
    db = Path(db)
    if not db.exists():
        return {"error": f"no database at {db}"}
    folder = Path(into) if into else db.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    # Never overwrite. Whatever the stamp's granularity, two backups can land
    # inside it — and the one you would lose is the older one, which is the
    # one you took before doing something risky.
    out = folder / f"blokk-{_stamp()}.db"
    n = 2
    while out.exists():
        out = folder / f"blokk-{_stamp()}-{n}.db"
        n += 1

    src = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    dst = sqlite3.connect(out)
    try:
        src.backup(dst)                 # consistent even while Blokk writes
    finally:
        dst.close()
        src.close()

    # Say what is in it. A backup you cannot tell apart from an empty one is
    # not reassuring, and "0 approvals" is the thing you want to notice now
    # rather than the day you need it.
    held = {}
    c = sqlite3.connect(f"file:{out}?mode=ro", uri=True)
    try:
        for t in ("workspace", "approval", "episode", "fact", "trust",
                  "journal", "run"):
            try:
                held[t] = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            except sqlite3.Error:
                held[t] = None
    finally:
        c.close()

    # Never the one just taken. Six backups inside one second and keep=3 had
    # prune delete this file and make() then fall over stat-ing it — the
    # backup you asked for, gone, and a traceback where the path should be.
    pruned = prune(folder, keep, spare=out)
    return {"ok": True, "path": str(out), "bytes": out.stat().st_size,
            "holds": held, "pruned": pruned, "kept": keep}


def _by_age(folder: Path) -> list[Path]:
    """Oldest first, by mtime.

    Not by name. Two backups inside one second are named blokk-X.db and
    blokk-X-2.db, and '-' sorts before '.', so the *newer* one came first in
    a lexicographic list — which had prune keeping the older of every pair
    and deleting the newer. mtime has sub-second resolution and no such
    argument with itself.
    """
    out = []
    for p in folder.glob("blokk-*.db"):
        try:
            mtime = p.stat().st_mtime
        except OSError:
            continue                      # vanished under us; nothing to sort
        # Within one mtime, order by the counter that made the name unique:
        # blokk-X.db came first, then -2, then -3. Comparing those as strings
        # puts -2 before the plain one, because '-' sorts before '.'.
        # blokk-YYYY-MM-DD-HHMMSS[-n].db, and the stamp has hyphens of its
        # own — splitting on the first or the last one reads a date part as
        # the counter and puts every file in the same bucket.
        m = _NAME.fullmatch(p.name)
        stamp = m.group(1) if m else p.name
        nth = int(m.group(2)) if m and m.group(2) else 1
        out.append((mtime, stamp, nth, p))
    out.sort()
    return [p for _, _, _, p in out]


def prune(folder: str | Path, keep: int = 14,
          spare: Path | None = None) -> list[str]:
    old = _by_age(Path(folder))
    gone = []
    for p in old[:-keep] if keep > 0 else []:
        if spare is not None and p == spare:
            continue
        try:
            p.unlink()
            gone.append(p.name)
        except OSError:
            pass
    return gone


def listing(folder: str | Path) -> list[dict]:
    folder = Path(folder)
    if not folder.exists():
        return []
    out = []
    for p in reversed(_by_age(folder)):     # newest first, by mtime
        try:
            st = p.stat()
        except OSError:
            continue
        out.append({"name": p.name, "bytes": st.st_size,
                    "at": datetime.fromtimestamp(st.st_mtime).isoformat(" ", "seconds")})
    return out


def verify(path: str | Path) -> dict:
    """Open it and ask SQLite whether it is intact.

    A backup nobody has opened is a hope. This is cheap and settles it.
    """
    p = Path(path)
    if not p.exists():
        return {"error": f"no backup at {p}"}
    try:
        c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
        try:
            state = c.execute("PRAGMA integrity_check").fetchone()[0]
            n = c.execute("SELECT COUNT(*) FROM workspace").fetchone()[0]
        finally:
            c.close()
    except sqlite3.Error as e:
        return {"ok": False, "detail": str(e)}
    return {"ok": state == "ok", "integrity": state, "workspaces": n}
