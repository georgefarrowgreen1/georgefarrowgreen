"""Sending a text, through Messages.app itself. The second connector that
reaches another person, and it inherits every rule the first one earned.

`smtp_mail.py` is the template and its docstring is the doctrine: a mistake
here does not cost a wrong row on a screen, it costs somebody else's phone,
and you cannot take it back. So the same shape, restated for this channel:

**It is off unless you allowed it.** Sending is the `write` verb on
Messages in the permission ledger — never granted by wiring the reader,
asked at setup as its own unticked row, changeable any time. And macOS asks
once itself, with its own dialog, the first time Blokk drives Messages.

**It cannot choose who to text.** `send()` takes the recipient as an
argument and checks it against the one recorded on the approval row when
the draft was made. The words are the model's; the reader of them is not.

**It only ever runs from inside the approval queue.** `send_reply` is
pinned and routes here by the channel the message arrived on — there is no
send action a model can point at a fresh number.

**It refuses more than it accepts.** One recipient, one message, a length
cap sized for a text rather than a letter, and the same daily cap as mail —
one budget across both channels, counted off the sent approvals, because
"a runaway loop is the fear" does not care which door the loop found.

**A guest's words are data, and AppleScript has no placeholders.** The
same injection surface as calendar_app.py, held by the same one function:
every value enters the script as a string literal built by `_lit()`, and
anything with a control character is refused rather than escaped cleverly.

One honesty limit, stated because nothing here can fix it: AppleScript's
`send` hands the message to Messages.app and returns. Whether it was
*delivered* — the handle is real, the phone had signal — is Messages'
side of the wall. The result says "handed to Messages", never "delivered",
and the Messages window is where a red exclamation mark would be.
"""
from __future__ import annotations

import platform
import re
import shutil
import subprocess

# Same rule, same reason as calendar_app: a control character cannot appear
# in an AppleScript string literal at all, and a value carrying one is
# either corrupt or an attempt.
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
TIMEOUT = 30                  # osascript waiting on a consent dialog
MAX_BODY = 3000               # a text, not a letter
PER_DAY = 20                  # shared with mail — see sent_today()

# A handle Messages can address: an email (iMessage) or a phone number.
ADDRESS = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
PHONE = re.compile(r"^\+?[0-9]{7,15}$")


class TextRefused(RuntimeError):
    """Refused before anything left. Always names which rule and what to do."""


def available() -> tuple[bool, str]:
    """Whether this Mac can be asked at all, and why not if it cannot."""
    if platform.system() != "Darwin":
        return (False, "Messages.app is macOS only — there is no way to "
                       "send a text from this machine.")
    if not shutil.which("osascript"):
        return (False, "osascript is missing, which should not happen on a "
                       "Mac.")
    return (True, "")


def _lit(value: str) -> str:
    r"""One AppleScript string literal, from arbitrary text.

    AppleScript strings end at an unescaped `"`, and `\` escapes. Those are
    the two characters that matter and both are escaped here. Everything
    else — `&`, `(`, `do shell script`, every frightening sequence — is
    inert *inside* a literal, which is why the whole defence is making sure
    the literal is never left.
    """
    text = str(value if value is not None else "")
    if CONTROL.search(text):
        raise TextRefused(
            "that text has a control character in it, which cannot appear "
            "in a message. Refused rather than rewritten.")
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def handle(value: str, what: str = "recipient") -> str:
    """Exactly one handle Messages can address, or a sentence saying why not.

    The same posture as smtp's `_one_address`: checked raw first, so a
    smuggled line break is refused as itself and not as "too many".
    """
    raw = str(value or "")
    if any(c in raw for c in "\r\n\t\x00"):
        raise TextRefused(f"the {what} has a line break in it. Refused.")
    v = " ".join(raw.split())
    if not v:
        raise TextRefused(f"no {what} — nothing is sent without one")
    if "," in v or ";" in v:
        raise TextRefused(f"the {what} looks like more than one person "
                          f"({v[:60]!r}). Blokk texts one person at a "
                          f"time, on purpose.")
    if ADDRESS.match(v):
        return v.lower()
    # A phone number, as people and Messages both write them: digits with
    # freedom around them. Normalised to digits (and a leading +) so the
    # same person written two ways is the same handle.
    digits = re.sub(r"[^0-9+]", "", v)
    if digits.count("+") > 1 or "+" in digits[1:]:
        raise TextRefused(f"{v[:40]!r} is not one phone number")
    if PHONE.match(digits):
        return digits
    raise TextRefused(f"{v[:60]!r} is not a phone number or an iMessage "
                      f"address")


def sent_today(store) -> int:
    """Sends so far today, across every channel.

    Deliberately the same count smtp keeps: one budget, however the words
    leave. Twenty texts after twenty emails is exactly the runaway this
    cap exists to stop, and two separate caps would allow it.
    """
    if store is None:
        return 0
    row = store.one(
        "SELECT COUNT(*) n FROM approval WHERE sent_at IS NOT NULL "
        "AND date(sent_at)=date('now','localtime')")
    return int(row["n"]) if row else 0


# iMessage first, and on error the SMS relay (the paired iPhone's Text
# Message Forwarding), which only makes sense for a phone number — an
# email handle that iMessage cannot reach is simply unreachable.
_SCRIPT = """\
on run
  tell application "Messages"
    set theBody to {body}
    set theTo to {to}
    try
      set svc to 1st account whose service type = iMessage
      send theBody to participant theTo of svc
      return "imessage"
    on error
      set svc to 1st account whose service type = SMS
      send theBody to participant theTo of svc
      return "sms"
    end try
  end tell
end run"""


def send(store, to: str, body: str, *, expected: str = "") -> dict:
    """Hand one text to Messages.app. Everything here is a refusal first.

    `expected` is the handle recorded on the approval row when the draft
    was made. Given and different, nothing is sent — the comparison that
    stops a model choosing who hears about it, same as mail.
    """
    ok, why = available()
    if not ok:
        raise TextRefused(why)
    to = handle(to)
    if expected and handle(expected, "expected recipient") != to:
        raise TextRefused(
            f"this draft was written to {expected}, and the send asked for "
            f"{to}. Nothing was sent. The recipient is fixed when the draft "
            f"is made and cannot be changed on the way out.")
    text = str(body or "")
    if not text.strip():
        raise TextRefused("an empty message is not sent")
    if len(text) > MAX_BODY:
        raise TextRefused(f"that is {len(text):,} characters and a text's "
                          f"limit is {MAX_BODY:,}")
    used = sent_today(store)
    if used >= PER_DAY:
        raise TextRefused(
            f"Blokk has sent {used} today across mail and texts, which is "
            f"the cap. It resets at midnight.")

    script = _SCRIPT.format(body=_lit(text), to=_lit(to))
    try:
        r = subprocess.run(["osascript", "-e", script],
                           capture_output=True, text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired as e:
        raise TextRefused(
            "Messages did not answer in time. If macOS is showing a "
            "permission dialog, answer it and approve the send again.") from e
    except OSError as e:
        raise TextRefused(f"could not run osascript: {e}") from e
    if r.returncode != 0:
        err = " ".join((r.stderr or "").split())[:200]
        raise TextRefused(
            f"Messages would not take it: {err or 'no reason given'}. "
            f"Nothing was sent. If macOS asked whether Blokk may control "
            f"Messages and you said no, that is Settings > Privacy & "
            f"Security > Automation.")
    via = (r.stdout or "").strip() or "imessage"
    return {"ok": True, "sent": True, "to": to,
            "via": {"imessage": "iMessage", "sms": "SMS"}.get(via, via),
            "chars": len(text), "left_today": max(0, PER_DAY - used - 1),
            "note": "handed to Messages.app — the Messages window is where "
                    "a delivery failure would show"}
