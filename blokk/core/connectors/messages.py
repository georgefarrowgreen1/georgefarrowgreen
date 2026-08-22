"""
Apple Messages. Read-only, local, macOS only.

This is the one that surprised you earlier in the design: it works because
the Mac keeps the whole archive in a SQLite file. Nothing leaves the machine
and no credential is involved — which also means no API, no rate limit, and
no permission dialog you can point at later.

Setup:
  System Settings -> Privacy & Security -> Full Disk Access
  Add Terminal (or whatever runs Blokk). It will not work without it, and it
  fails with 'unable to open database file' rather than anything helpful.

Opened with mode=ro and immutable=1 so a sweep can never write to, lock, or
corrupt your message history. Messages holds this file open; immutable
avoids fighting it for the lock.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB = Path.home() / "Library" / "Messages" / "chat.db"

# Apple counts nanoseconds from 2001-01-01. Get this wrong and every
# timestamp lands in 2001 or 2050.
APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


def _apple_ts(hours_ago: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return int((cutoff - APPLE_EPOCH).total_seconds() * 1_000_000_000)


class AppleMessages:
    kind = "messages"
    writes = False              # AppleScript can send; this connector cannot.

    def __init__(self, path: Path | None = None):
        self.path = Path(path or DB)

    def _open(self) -> sqlite3.Connection:
        if not self.path.exists():
            raise FileNotFoundError(f"no chat.db at {self.path}")
        if not os.access(self.path, os.R_OK):
            raise PermissionError(
                "chat.db exists but is unreadable — grant Full Disk Access to "
                "the app running Blokk in System Settings > Privacy & Security")
        con = sqlite3.connect(
            f"file:{self.path}?mode=ro&immutable=1", uri=True, timeout=10)
        con.row_factory = sqlite3.Row
        return con

    def check(self) -> dict:
        con = self._open()
        try:
            n = con.execute("SELECT COUNT(*) c FROM message").fetchone()["c"]
            h = con.execute("SELECT COUNT(*) c FROM handle").fetchone()["c"]
            return {"ok": True, "messages": n, "contacts": h, "path": str(self.path)}
        finally:
            con.close()

    def since(self, hours: int = 12, limit: int = 40) -> list[dict]:
        con = self._open()
        try:
            rows = con.execute("""
                SELECT m.ROWID       AS id,
                       m.is_from_me  AS mine,
                       m.date        AS ts,
                       h.id          AS who,
                       COALESCE(m.text, '') AS body
                FROM message m
                LEFT JOIN handle h ON h.ROWID = m.handle_id
                WHERE m.date > ? AND m.text IS NOT NULL AND m.text != ''
                ORDER BY m.date DESC LIMIT ?""",
                (_apple_ts(hours), limit)).fetchall()
            return [{
                "id": f"msg-{r['id']}",
                "from": "you" if r["mine"] else (r["who"] or "unknown"),
                "at": (APPLE_EPOCH + timedelta(
                    seconds=r["ts"] / 1_000_000_000)).isoformat(),
                "body": r["body"][:4000],
                # A message from you is yours; anything inbound is a stranger's
                # text until proven otherwise.
                "provenance": "self" if r["mine"] else "untrusted",
            } for r in rows]
        finally:
            con.close()

    def thread_with(self, who: str, limit: int = 30) -> list[dict]:
        con = self._open()
        try:
            rows = con.execute("""
                SELECT m.is_from_me mine, m.date ts, COALESCE(m.text,'') body
                FROM message m JOIN handle h ON h.ROWID = m.handle_id
                WHERE h.id LIKE ? AND m.text IS NOT NULL
                ORDER BY m.date DESC LIMIT ?""", (f"%{who}%", limit)).fetchall()
            return [{"from": "you" if r["mine"] else who,
                     "body": r["body"][:2000],
                     "provenance": "self" if r["mine"] else "untrusted"}
                    for r in rows]
        finally:
            con.close()
