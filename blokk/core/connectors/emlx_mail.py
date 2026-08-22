"""Mail.app's own store, read from disk. Read-only, local, no credential.

Mail keeps every message it has downloaded as a .emlx file under
~/Library/Mail. Reading them needs no app-specific password and no network,
which also means nothing to revoke and nothing to leak. It does need Full
Disk Access; core/local.py checks for it and names the app to grant it to.

An .emlx is a plain RFC 822 message with a byte count on the first line and
an Apple plist stapled to the end. The email module in the stdlib does the
hard part — headers, encodings, multipart — so this is mostly about finding
the right files and not reading 40,000 of them.

Search, don't list, same as every other connector. Mail sorts nothing for
you, so the filter here is the file's own mtime: newest first, stop early.
Reading the whole archive to answer one question spends the context another
worker needed.
"""
from __future__ import annotations

import email
import email.policy
import re
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path.home() / "Library/Mail"
SCAN_CAP = 4000            # files stat-ed before giving up on "recent"


def _mailbox(path: Path) -> str:
    """The name a person would recognise.

    The layout is <Account>.mbox/<uuid>/Data/.../Messages/x.emlx, and the
    directory immediately above is always "Messages" — so walk up to the
    nearest .mbox rather than counting parents.
    """
    for parent in path.parents:
        if parent.suffix == ".mbox":
            return parent.stem
    return path.parent.name


def _emlx(path: Path) -> email.message.Message | None:
    """Strip the length prefix and the trailing plist, parse the rest."""
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    nl = raw.find(b"\n")
    if nl == -1:
        return None
    try:
        length = int(raw[:nl].strip())
    except ValueError:
        length = len(raw)                  # not prefixed; take it as a message
    body = raw[nl + 1:nl + 1 + length]
    try:
        return email.message_from_bytes(body, policy=email.policy.default)
    except Exception:                      # noqa: BLE001
        return None


def _text(msg) -> str:
    """The readable part. Prefers text/plain; never returns HTML soup."""
    try:
        part = msg.get_body(preferencelist=("plain", "html"))
        if part is None:
            return ""
        s = part.get_content()
    except Exception:                      # noqa: BLE001
        return ""
    if part.get_content_type() == "text/html":
        s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"[ \t]*\n[ \t]*", "\n", re.sub(r"[ \t]{2,}", " ", s)).strip()


class LocalMail:
    """Reads ~/Library/Mail. Cannot send — there is no method that could."""

    writes = False

    def __init__(self, keychain_ref: str = "", root: Path | None = None):
        # Accepted and ignored: the registry hands every connector a
        # credential, and this is one of the two that does not need one.
        self.root = Path(root) if root else ROOT

    def _files(self) -> list[Path]:
        """Every .emlx, newest first, bounded.

        A long-lived mailbox holds tens of thousands. Sorting them all by
        mtime is one stat each and no reads, which is cheap; opening them is
        not, so the caller's limit does the rest.
        """
        found = []
        for p in self.root.rglob("*.emlx"):
            if p.name.endswith(".partial.emlx"):
                continue                   # a body Mail has not downloaded
            try:
                found.append((p.stat().st_mtime, p))
            except OSError:
                continue
            if len(found) >= SCAN_CAP:
                break
        found.sort(reverse=True)
        return [p for _, p in found]

    def check(self) -> dict:
        if not self.root.exists():
            raise FileNotFoundError(f"no Mail data at {self.root}")
        files = self._files()
        boxes = sorted({_mailbox(p) for p in files[:200]})
        return {"ok": True, "messages_seen": len(files),
                "capped": len(files) >= SCAN_CAP, "mailboxes": boxes[:12]}

    def search_since(self, hour: str = "", limit: int = 50) -> list[dict]:
        """Messages since `hour` (an ISO prefix, as the flow passes it).

        An unparseable or empty hour means "recent" rather than "everything":
        the alternative is a connector that reads an entire archive because a
        caller passed a blank string.
        """
        cutoff = None
        if hour:
            for fmt in ("%Y-%m-%dT%H", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
                try:
                    cutoff = datetime.strptime(hour[:len(datetime.now().strftime(fmt))], fmt)
                    break
                except ValueError:
                    continue
        if cutoff is None:
            cutoff = datetime.now() - timedelta(days=1)

        out = []
        for p in self._files():
            if datetime.fromtimestamp(p.stat().st_mtime) < cutoff:
                break                      # newest first, so nothing older follows
            msg = _emlx(p)
            if msg is None:
                continue
            out.append({
                "id": p.stem,
                "from": str(msg.get("From", "")),
                "subject": str(msg.get("Subject", "")),
                "at": str(msg.get("Date", "")),
                "body": _text(msg)[:4000],
                "mailbox": _mailbox(p),
                # Everything here came from outside. quarantine_read decides
                # what a model is allowed to see of it; this only labels it.
                "provenance": "external",
            })
            if len(out) >= limit:
                break
        return out
