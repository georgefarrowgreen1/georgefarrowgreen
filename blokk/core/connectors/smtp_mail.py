"""The one connector that reaches another person.

Everything else in Blokk reads, or writes a file on this Mac. This sends
mail, and a mistake here does not cost you a wrong row on a screen — it costs
somebody else's inbox, and you cannot take it back.

So the shape is different from every other connector, and the differences
are the point:

**It is off unless you turned it on.** No credential, no send. There is no
default host, no fallback to the mail source you already wired, and no
"helpfully" reusing an IMAP password. `connect.py add <ws> smtp <ref>` and a
keychain entry are both required, and until then `available()` says no.

**It cannot choose who to write to.** `send()` takes the recipient as an
argument and checks it against the one recorded on the approval row when the
draft was made. A model that has read a stranger's email can suggest any
words it likes; the address is not one of the things it can suggest. That is
the whole of the defence and it is deliberately not a filter on the body.

**It only ever runs from inside the approval queue.** The category is pinned,
so it never graduates however many you approve. `ctx.activity(...,
side_effect=True)` gives it an idempotency key, so a crash and a replay
cannot send twice — which is the failure that would otherwise be discovered
by the recipient.

**It refuses more than it accepts.** One recipient, no Bcc, no attachments,
no HTML, a size cap, a rate cap per workspace per day, and a hard refusal to
send to more than one address or to anything that does not look like an
address. Every refusal names itself.

Stdlib `smtplib`, over STARTTLS or implicit TLS with certificate checking on.
Not through core/egress.py: that gate speaks HTTP and this is SMTP, so the
allowlist here is the narrower thing — one host, from the credential, that no
data chooses.
"""
from __future__ import annotations

import re
import smtplib
import ssl

from email.message import EmailMessage

from core.connectors.keychain import account, secret

# Deliberately strict. This is not trying to be RFC 5322 — it is trying to
# make sure the thing being handed to a mail server is one address and not a
# header injection, a list, or a display name with a comma in it.
ADDRESS = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
MAX_BODY = 100_000            # a reply, not a newsletter
MAX_SUBJECT = 200
PER_DAY = 20                  # per workspace. A runaway loop is the fear.
TIMEOUT = 30


class SendRefused(RuntimeError):
    """Refused before anything left. Always names which rule and what to do."""


def _one_address(value: str, what: str) -> str:
    """Exactly one address, or a sentence saying why not."""
    raw = str(value or "")
    # Checked on the raw value, before whitespace is normalised. Collapsing
    # first turned "a@b.c\nBcc: evil@x.com" into "a@b.c Bcc: evil@x.com",
    # which is still refused — by the too-many-addresses rule, wearing the
    # wrong name. A refusal that reports the wrong reason is a refusal
    # nobody can act on, and the day the other rule is loosened this one is
    # gone with it.
    if any(c in raw for c in "\r\n\t\x00"):
        raise SendRefused(f"the {what} has a line break in it, which would "
                          f"add headers nobody wrote. Refused.")
    v = " ".join(raw.split())
    if not v:
        raise SendRefused(f"no {what} — nothing is sent without one")
    if "," in v or ";" in v or " " in v:
        raise SendRefused(f"the {what} looks like more than one address "
                          f"({v[:60]!r}). Blokk sends to one person at a "
                          f"time, on purpose.")
    if not ADDRESS.match(v):
        raise SendRefused(f"{v[:60]!r} is not an email address")
    return v


def _clean_subject(value: str) -> str:
    raw = str(value or "")
    if any(c in raw for c in "\r\n\x00"):
        raise SendRefused("the subject has a line break in it, which would "
                          "add headers nobody wrote. Refused.")
    return " ".join(raw.split())[:MAX_SUBJECT] or "(no subject)"


class Smtp:
    """Sends one plain-text message, to one person, when told to.

    Held to the connector contract: no secret stored on it, handed a keychain
    reference and resolving it at call time.
    """

    kind = "smtp"
    writes = True

    def __init__(self, keychain_ref: str, store=None, workspace_id: str = "",
                 host: str = "", port: int = 0):
        self.ref = keychain_ref
        self.store = store
        self.workspace_id = workspace_id
        # The host comes from the credential, not from anything a model or a
        # message can influence. `blokk-cottages-smtp@smtp.fastmail.com:465`
        # is the whole configuration.
        self.host, self.port = host, port
        if not host and keychain_ref and "@" in keychain_ref:
            _, _, tail = keychain_ref.partition("@")
            self.host, _, p = tail.partition(":")
            self.port = int(p) if p.isdigit() else 0
        self.port = self.port or 465

    # ------------------------------------------------------------- checks
    def available(self) -> tuple[bool, str]:
        if not self.host:
            return (False, "no SMTP host configured. The credential looks "
                           "like blokk-<ws>-smtp@smtp.example.com:465 — the "
                           "part after the @ is the server.")
        try:
            account(self.ref), secret(self.ref)
        except Exception as e:                                   # noqa: BLE001
            return (False, f"no password in the keychain under {self.ref!r}: "
                           f"{e}")
        return (True, "")

    def check(self) -> dict:
        """Prove the credential works without sending anything.

        Logs in and hangs up. A send path that is only ever exercised by
        sending is one nobody tests until it matters.
        """
        ok, why = self.available()
        if not ok:
            raise SendRefused(why)
        try:
            with self._connect() as smtp:
                pass
        except smtplib.SMTPAuthenticationError as e:
            raise SendRefused(
                f"{self.host} refused that password. If this is iCloud or "
                f"Gmail it wants an app-specific password, not your account "
                f"one. ({e.smtp_code})") from e
        except (OSError, smtplib.SMTPException) as e:
            raise SendRefused(f"could not reach {self.host}:{self.port} — "
                              f"{type(e).__name__}: {e}") from e
        return {"ok": True, "host": self.host, "port": self.port,
                "from": account(self.ref),
                "sent_today": self.sent_today(),
                "note": f"Logged in and hung up. Nothing was sent. "
                        f"{PER_DAY - self.sent_today()} left in today's cap."}

    def _connect(self):
        ctx = ssl.create_default_context()       # verifies. Do not turn off.
        if self.port == 465:
            smtp = smtplib.SMTP_SSL(self.host, self.port, timeout=TIMEOUT,
                                    context=ctx)
        else:
            smtp = smtplib.SMTP(self.host, self.port, timeout=TIMEOUT)
            smtp.starttls(context=ctx)
        try:
            smtp.login(account(self.ref), secret(self.ref))
        except Exception:
            # The caller's `with` never sees this object if login raises, so
            # nothing else would ever close it. A stale password plus a
            # doctor run on a timer is a slow file-descriptor leak.
            try:
                smtp.close()
            except Exception:                                    # noqa: BLE001
                pass
            raise
        return smtp

    # -------------------------------------------------------------- caps
    def sent_today(self) -> int:
        if self.store is None:
            return 0
        # Counted off sent_at, and compared in the same frame it is written
        # in. It was date(decided_at) — stored UTC — against date.today() —
        # local — so west of Greenwich the cap silently reset each evening
        # and handed out a fresh twenty. Whichever frame is chosen, both
        # sides have to be in it.
        row = self.store.one(
            "SELECT COUNT(*) n FROM approval WHERE workspace_id=? "
            "AND sent_at IS NOT NULL AND date(sent_at)=date('now','localtime')",
            self.workspace_id)
        return int(row["n"]) if row else 0

    # -------------------------------------------------------------- send
    def send(self, to: str, subject: str, body: str, *,
             expected: str = "", reply_to_id: str = "") -> dict:
        """Send one plain-text message. Everything here is a refusal first.

        `expected` is the address recorded on the approval row when the draft
        was made. If it is given and does not match `to`, nothing is sent —
        that comparison is what stops a model that has read a stranger's mail
        from choosing who hears about it.
        """
        ok, why = self.available()
        if not ok:
            raise SendRefused(why)
        to = _one_address(to, "recipient")
        if expected and _one_address(expected, "expected recipient") != to:
            raise SendRefused(
                f"this draft was written to {expected}, and the send asked "
                f"for {to}. Nothing was sent. The address is fixed when the "
                f"draft is made and cannot be changed on the way out.")
        subject = _clean_subject(subject)
        text = str(body or "")
        if not text.strip():
            raise SendRefused("an empty message is not sent")
        if len(text) > MAX_BODY:
            raise SendRefused(f"that is {len(text):,} characters and the "
                              f"limit is {MAX_BODY:,}")
        used = self.sent_today()
        if used >= PER_DAY:
            raise SendRefused(
                f"{self.workspace_id} has sent {used} today, which is the "
                f"cap. It resets at midnight. Raise it in core/connectors/"
                f"smtp_mail.py if you meant to.")

        sender = account(self.ref)
        msg = EmailMessage()
        msg["From"] = sender
        msg["To"] = to
        msg["Subject"] = subject
        if reply_to_id:
            # Threads it under the message it answers, so it lands in the
            # conversation rather than as a new one the guest has to match up.
            msg["In-Reply-To"] = reply_to_id
            msg["References"] = reply_to_id
        # Plain text only. No HTML part, no attachments: both are ways for
        # something to travel that nobody read on the screen that approved it.
        msg.set_content(text)
        try:
            with self._connect() as smtp:
                smtp.send_message(msg)
        except smtplib.SMTPRecipientsRefused as e:
            raise SendRefused(f"{self.host} would not accept {to}: "
                              f"{e.recipients}") from e
        except smtplib.SMTPAuthenticationError as e:
            raise SendRefused(f"{self.host} refused that password "
                              f"({e.smtp_code}). Nothing was sent.") from e
        except (OSError, smtplib.SMTPException) as e:
            # Deliberately not retried here. A send that failed part way
            # might have been delivered, and the caller has the idempotency
            # key — retrying blind is how one apology becomes two.
            raise SendRefused(
                f"{type(e).__name__} talking to {self.host}: {e}. Whether it "
                f"went is not known from here — check the sent folder before "
                f"trying again.") from e
        return {"ok": True, "sent": True, "to": to, "subject": subject,
                "chars": len(text), "via": self.host,
                "left_today": max(0, PER_DAY - used - 1)}
