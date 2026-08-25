"""The checks that used to need somebody to know a command existed.

Everything diagnostic in this project has been a separate thing to run.
`./blokk doctor` says why the phone cannot reach the Mac; `./blokk listen`
says whether anything arrives; `./blokk autoupdate` says whether updating is
on. All three are useful and all three have the same defect: you have to
already suspect the problem to go looking, and the person who most needs
them is the person who does not know they exist. Four rounds of "still not
getting a connection over my LAN" went past with the answer sitting behind a
command nobody had been told to type.

So the run itself checks. Three rules make that bearable rather than noisy:

  * **Fast and local, or not here.** Every check in this file is
    milliseconds and none of them touch the network. A git fetch or a
    twelve-second mailbox probe belongs on a schedule or behind a command,
    not in front of somebody waiting for their app to start. `./blokk
    doctor` still exists for the slow half and this does not replace it.

  * **Silence is the normal output.** A wall of green on every start is how
    a terminal stops being a place anybody reads. Nothing is printed when
    nothing is wrong.

  * **A fault is named where you already are**, with the one line that
    fixes it — not a suggestion to go and run something else.

What it deliberately does not do is decide anything. It returns findings;
the caller prints them. That is what lets the banner and the doctor use the
same list and be unable to disagree about it.
"""
from __future__ import annotations

import json
import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# What a finding is. `level` is what the caller colours it by, `what` is the
# sentence, `fix` is the thing to do about it — never absent, because a
# fault with no next step is an alarm rather than a diagnosis.
STOP, WARN, NOTE = "stop", "warn", "note"


def _finding(level, what, fix=""):
    return {"level": level, "what": what, "fix": fix}


def firewall_finding(note: str) -> dict | None:
    """One firewall verdict turned into one finding, in one place.

    Four surfaces used to translate this themselves — the doctor's phone
    section, the start-up banner, `listen`'s verdict and this file — and
    they had already drifted apart: the banner knew only "python is NOT
    listed", so a Mac where somebody had clicked Deny, which is the verdict
    that actually blocks, started up saying nothing at all. Three copies
    agreeing and one not is worse than one copy, because the disagreement
    is invisible until the machine is in the state only the missing branch
    covers.
    """
    up = (note or "").upper()
    if "BLOCK ALL" in up:
        return _finding(
            STOP, "The firewall is set to block all incoming connections, so "
                  "nothing can reach this Mac.",
            "System Settings > Network > Firewall > Options, turn off 'Block "
            "all incoming connections'.")
    if "BLOCKED" in up:
        return _finding(
            STOP, "macOS is blocking python from accepting connections — the "
                  "Deny you clicked once, which it never asks about again.",
            "System Settings > Network > Firewall > Options, and allow "
            "python.")
    if "NOT LISTED" in up:
        return _finding(
            WARN, "python is not in the firewall's list yet, so macOS will "
                  "ask once and drop everything until it does.",
            "Open the link on your phone and answer Allow when macOS asks. "
            "If it never asks: System Settings > Network > Firewall > "
            "Options, and add python.")
    return None


def why_not_reaching(note: str = "", shown: bool = False) -> list[dict]:
    """Everything that stops a phone reaching this Mac, worst first.

    One list, rendered by four surfaces. It used to be four lists: the
    doctor's closing advice, `listen`'s "nothing arrived" verdict, the
    start-up banner and `phone_reach` below each carried their own wording
    of the same three causes, in the same order, maintained separately.

    The firewall goes first only when this Mac's own firewall is actually
    the problem — an ordered list whose first item is usually not the
    answer teaches people to skip the first item.

    `shown` is for a caller that has already printed the firewall verdict
    somewhere the eye reaches first — the doctor prints it directly under
    the link, because a blocked firewall is not a "if that still fails", it
    is a "that will not work". Without it, consolidating four copies into
    one produced the same two lines twice, four lines apart, which reads as
    a bug in exactly the output somebody has come to for answers.
    """
    out = []
    fw = None if shown else firewall_finding(note)
    if fw:
        out.append(fw)
    out.append(_finding(
        WARN, "The phone may be on a different network — a guest SSID, the "
              "other half of a split 2.4/5GHz pair, or wifi off and 5G on.",
        "Check the wifi name on the phone matches the Mac's."))
    # The iOS twin of the macOS firewall's Deny-you-clicked-once, and the
    # one cause nothing on this side can ever see: with it denied, the
    # phone kills the connection before it leaves, and Safari says "the
    # network connection was lost" — the same sentence as the missing
    # scheme, produced without a packet reaching this Mac. Four rounds of
    # Mac-side diagnosis missed it because every list like this one only
    # named causes on this side of the air.
    out.append(_finding(
        WARN, "The phone itself may be refusing. iOS asks once — “Safari "
              "would like to find and connect to devices on your local "
              "network” — and a Don’t Allow is kept for ever, "
              "silently. Refused this way, Safari says “the network "
              "connection was lost”, whatever this Mac does.",
        "On the iPhone: Settings > Privacy & Security > Local Network > "
        "Safari, on. Then reload."))
    out.append(_finding(
        WARN, "The router may be keeping its clients apart (AP or client "
              "isolation), which guest networks do by default.",
        "Try the main network rather than the guest one."))
    # Only when nothing has flagged the firewall at all. Saying "worth
    # ruling out" underneath a line that has just said it is blocking is
    # the kind of sentence that makes somebody stop reading the list.
    if not fw and not shown and not firewall_finding(note):
        out.append(_finding(
            NOTE, "This Mac's firewall reports nothing wrong, but it is worth "
                  "ruling out.",
            "Turning the firewall off for one minute settles whether it is "
            "that."))
    return out


def phone_reach(port: int) -> list[dict]:
    """Whether a phone could reach this Mac, asked of the Mac only.

    Cannot answer "did the phone actually get here" — nothing on this side
    can. `arrivals()` below answers that from what has already happened.
    """
    from core import doctor
    out = []
    try:
        found = doctor.phone_addresses(0)
    except Exception as e:                                       # noqa: BLE001
        return [_finding(NOTE, f"could not read this Mac's addresses: "
                               f"{type(e).__name__}", "./blokk doctor")]
    usable = [r for r in found if r["usable"]]
    if not usable:
        why = found[0]["why"] if found else "no non-loopback address"
        out.append(_finding(
            STOP, "No address here is one a phone could use — " + why,
            "Join wifi, or turn a VPN off. ./blokk doctor lists what it saw."))
        return out

    try:
        state, note = doctor.firewall()
    except Exception:                                            # noqa: BLE001
        state, note = "", ""
    # Only a verdict that stops a connection. "on" with python allowed is
    # the normal state of a Mac and not worth a line at start-up.
    fw = firewall_finding(note)
    if fw:
        out.append(fw)
    return out


def arrivals(port: int) -> list[dict]:
    """What has actually reached this Mac from another device.

    The one question none of the other checks can answer, and the one that
    settles which half of "it will not connect" somebody is in. Read from
    what the running server recorded rather than measured now: a fresh probe
    from this machine to itself proves nothing about a phone.
    """
    out = []
    seen = _read(ROOT / "logs" / "peers.json")
    https = _read(ROOT / "logs" / "https-on-http.json")
    if https.get("n"):
        out.append(_finding(
            WARN, f"A phone reached this Mac and spoke HTTPS {https['n']} "
                  f"time(s). That is the whole problem, and it is good news: "
                  f"the network is fine. Safari upgraded an address typed "
                  f"without http:// to HTTPS, this port speaks plain HTTP, "
                  f"and Safari calls that “the network connection was "
                  f"lost.” It will not retry on its own.",
            "Scan the QR code (it carries the http://), or type the http:// "
            "in front of the address. The bare address cannot be made to "
            "work from here."))
    if not seen.get("n"):
        # Not a fault on its own: a Mac nobody has opened on a phone yet
        # looks exactly like one whose phone cannot get through. Say which
        # it is rather than implying.
        out.append(_finding(
            NOTE, "Nothing from another device has ever reached this Mac.",
            "If you are trying to: ./blokk listen watches the port and says "
            "what arrives."))
    return out


def _read(path: Path) -> dict:
    try:
        d = json.loads(path.read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def port_free(port: int) -> list[dict]:
    """Is something already on this port? Asked before binding, not after.

    "Address already in use" out of socketserver names the port and not the
    thing holding it, and the thing holding it is almost always a Blokk
    somebody forgot was running.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.4)
    try:
        s.connect(("127.0.0.1", port))
        return [_finding(
            WARN, f"Something is already listening on port {port}.",
            f"That is probably Blokk. Use it, stop it, or start this one on "
            f"another port: ./blokk {port + 1}")]
    except OSError:
        return []
    finally:
        s.close()


def checks(port: int, quick: bool = True) -> list[dict]:
    """Everything worth saying at start-up, worst first.

    `quick` is not a speed switch — everything here is quick. It is there so
    a caller that has just done its own address work can skip repeating it.
    """
    out: list[dict] = []
    out += port_free(port)
    if not quick:
        out += phone_reach(port)
    out += arrivals(port)
    rank = {STOP: 0, WARN: 1, NOTE: 2}
    return sorted(out, key=lambda f: rank.get(f["level"], 3))


def render(found: list[dict], colour=True) -> list[str]:
    """Findings as lines. Empty in, empty out — silence is the normal case."""
    if not found:
        return []
    B, D, R, A, O = ("\033[1m", "\033[2m", "\033[31m", "\033[33m", "\033[0m") \
        if colour else ("", "", "", "", "")
    mark = {STOP: (R, "!!"), WARN: (A, " !"), NOTE: (D, " ·")}
    lines = []
    for f in found:
        col, sign = mark.get(f["level"], (D, " ·"))
        lines.append(f"  {col}{sign}{O} {f['what']}")
        if f["fix"]:
            lines.append(f"     {D}{f['fix']}{O}")
    return lines
