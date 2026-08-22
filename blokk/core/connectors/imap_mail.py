"""
iCloud Mail over IMAP. Read-only.

Setup, once:
  1. appleid.apple.com -> Sign-In and Security -> App-Specific Passwords
     Generate one called "Blokk". Apple shows it once.
  2. security add-generic-password -s blokk-cottages-mail -a you@icloud.com -w
  3. python3 connect.py add cottages imap blokk-cottages-mail

Why IMAP and not a nicer API: iCloud doesn't have one. That means no labels
API, no push, and weaker threading than Gmail — worth knowing before you
build a workflow that assumes any of it.

This class cannot send. Sending is a separate connector you have to
deliberately add, because the whole architecture rests on there being one
write path and it running through the approval queue.
"""
from __future__ import annotations

import email
import imaplib
import re
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header

from core.connectors.keychain import account, secret

HOST, PORT = "imap.mail.me.com", 993


def _decode(v) -> str:
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:                                            # noqa: BLE001
        return v or ""


def _body(msg) -> str:
    """Plain text only. HTML mail is where injections hide in white-on-white."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    return part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", "replace")
                except Exception:                                # noqa: BLE001
                    continue
        return ""
    try:
        return msg.get_payload(decode=True).decode(
            msg.get_content_charset() or "utf-8", "replace")
    except Exception:                                            # noqa: BLE001
        return str(msg.get_payload())[:4000]


class IcloudMail:
    kind = "imap"
    writes = False                 # deliberately. see the module docstring.

    def __init__(self, keychain_ref: str, mailbox: str = "INBOX"):
        self.ref, self.mailbox = keychain_ref, mailbox

    def _open(self) -> imaplib.IMAP4_SSL:
        m = imaplib.IMAP4_SSL(HOST, PORT, timeout=30)
        m.login(account(self.ref), secret(self.ref))
        m.select(self.mailbox, readonly=True)     # readonly: never marks read
        return m

    def check(self) -> dict:
        m = self._open()
        try:
            _, data = m.search(None, "ALL")
            return {"ok": True, "mailbox": self.mailbox,
                    "messages": len(data[0].split()),
                    "account": account(self.ref)}
        finally:
            m.logout()

    def search_since(self, hours: int = 12, limit: int = 50,
                     unseen_only: bool = False) -> list[dict]:
        """Server-side filter, then fetch headers only for the shortlist.

        Fetching bodies for everything is how you spend a context window on
        339 messages you did not want.
        """
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%d-%b-%Y")
        crit = f'(SINCE {since}{" UNSEEN" if unseen_only else ""})'
        m = self._open()
        out = []
        try:
            _, data = m.search(None, crit)
            ids = data[0].split()[-limit:]
            for i in reversed(ids):
                _, raw = m.fetch(i, "(RFC822)")
                msg = email.message_from_bytes(raw[0][1])
                out.append({
                    "id": _decode(msg.get("Message-ID"))[:120],
                    "from": _decode(msg.get("From")),
                    "to": _decode(msg.get("To")),
                    "subject": _decode(msg.get("Subject")),
                    "at": _decode(msg.get("Date")),
                    "body": _body(msg)[:8000],
                    # provenance travels with the row. Everything downstream
                    # treats this as untrusted because of this field.
                    "provenance": "untrusted",
                })
        finally:
            m.logout()
        return out

    def search(self, term: str, limit: int = 20) -> list[dict]:
        m = self._open()
        try:
            safe = re.sub(r'[^\w @.\-]', "", term)[:60]
            _, data = m.search(None, f'(OR SUBJECT "{safe}" FROM "{safe}")')
            ids = data[0].split()[-limit:]
            out = []
            for i in reversed(ids):
                _, raw = m.fetch(i, "(BODY.PEEK[HEADER])")
                msg = email.message_from_bytes(raw[0][1])
                out.append({"from": _decode(msg.get("From")),
                            "subject": _decode(msg.get("Subject")),
                            "at": _decode(msg.get("Date")),
                            "provenance": "untrusted"})
            return out
        finally:
            m.logout()
