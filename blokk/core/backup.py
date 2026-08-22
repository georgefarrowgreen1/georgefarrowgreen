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

import sqlite3
from datetime import datetime
from pathlib import Path


def _stamp() -> str:
    # Seconds, not minutes. Two backups a minute apart is not a silly thing to
    # do — before and after something risky is exactly when you want them —
    # and at minute granularity the second silently replaced the first.
    return datetime.now().strftime("%Y-%m-%d-%H%M%S")


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

    pruned = prune(folder, keep)
    return {"ok": True, "path": str(out), "bytes": out.stat().st_size,
            "holds": held, "pruned": pruned, "kept": keep}


def prune(folder: str | Path, keep: int = 14) -> list[str]:
    old = sorted(Path(folder).glob("blokk-*.db"))
    gone = []
    for p in old[:-keep] if keep > 0 else []:
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
    for p in sorted(folder.glob("blokk-*.db"), reverse=True):
        st = p.stat()
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
