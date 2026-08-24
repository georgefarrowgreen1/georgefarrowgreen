"""The one place anything leaves this machine.

Blokk's first claim is that nothing does. Reading a web page breaks that, so
the claim is restated rather than quietly dropped:

    nothing leaves except requests you allowed, to hosts you named, and the
    log says exactly what left.

Your mail still never leaves. There is one allowlist, in `setting`, and
this file is what enforces it. It used to be per workspace, on the theory
that one business's sources should not be able to reach another's hosts —
which sounds right and bought nothing: the hosts were the same handful of
providers, the list had to be maintained four times, and the thing actually
keeping one business's mail out of another's replies is the read scope on
the credential, not the egress list. Collapsing four lists into one is a
widening, so `./blokk unify` names every host it opened up.

A web page is the most hostile input this system can be handed. Worse than
email: with a fetch tool an attacker chooses *which* page you read. Four
things stand between that and the model, and all four are load-bearing.

  * **The host is on the list.** Suffix matching is anchored to
    a dot, so allowing icloud.com allows imap.mail.icloud.com and does not
    allow evil-icloud.com — which is the mistake that makes an allowlist
    decorative.

  * **Every address the host resolves to is a public one.** Without this,
    "fetch a URL" is a way to read the router's admin page, a printer, or a
    cloud metadata endpoint from inside the network the Mac is sitting on.
    There is a residual window between resolving and connecting, and closing
    it properly means pinning the socket to the address that was checked.
    It is left open on purpose: exploiting it means controlling DNS for a
    host *you* put on the list, and at that point the host is theirs anyway.

  * **Redirects are re-checked, every hop.** An allowed host that answers 302
    to somewhere else is the allowlist's back door.

  * **Size and time are capped.** A reader with no limit is a way to fill the
    disk and stall the night's sweep with one slow response.

Then every request is written to logs/egress.log, whether it succeeded or
not. Inside a sweep it is journalled as well, because connectors are called
from ctx.activity — but the log is what answers "what has this thing been
talking to", and it answers it without a database.
"""
from __future__ import annotations

import ipaddress
import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "logs" / "egress.log"

MAX_BYTES = 512 * 1024     # a JSON API answering more than this is not one
TIMEOUT = 20               # seconds, per hop
MAX_HOPS = 3               # redirects, each re-checked


class Refused(Exception):
    """Carries a sentence naming the host and the rule. Never a traceback."""


# ------------------------------------------------------------------ the rules
def host_allowed(allowlist, host: str) -> bool:
    """Is this host covered by one of the allowlist's entries?

    Anchored to a dot on purpose. `host.endswith(entry)` — the obvious
    version — allows evil-icloud.com under an entry of icloud.com, which
    turns the whole list into decoration.
    """
    host = (host or "").strip().lower().rstrip(".")
    if not host:
        return False
    for raw in allowlist or []:
        entry = str(raw).strip().lower().lstrip("*.").rstrip(".")
        if not entry:
            continue
        if host == entry or host.endswith("." + entry):
            return True
    return False


def addresses(host: str) -> list[str]:
    """Every address this host resolves to, v4 and v6."""
    try:
        info = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except OSError:
        return []
    return sorted({i[4][0] for i in info})


def private(addr: str) -> bool:
    """Anything that is not a public address on the internet.

    Loopback, the LAN, link-local (which is where cloud metadata lives),
    multicast, and everything reserved. If in doubt it counts as private:
    an address this cannot parse is not one to connect to.
    """
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return True
    return not ip.is_global


def check(allowlist, url: str) -> str:
    """Everything that can be decided before opening a socket.

    Returns the host. Raises Refused with a sentence naming the rule.
    """
    u = urlparse(url or "")
    if u.scheme != "https":
        raise Refused(
            f"only https is allowed, and this is {u.scheme or 'not a URL'}. "
            f"Plain http would put the request, and anything in it, on the "
            f"wire in the clear.")
    host = (u.hostname or "").lower()
    if not host:
        raise Refused(f"{url!r} has no host in it")
    if not host_allowed(allowlist, host):
        have = ", ".join(str(a) for a in (allowlist or [])) or "nothing"
        raise Refused(
            f"{host} is not on the allowlist. It allows: {have}. "
            f"Add it with:  connect.py egress allow {host}")
    found = addresses(host)
    if not found:
        raise Refused(f"{host} does not resolve. Is this Mac online?")
    bad = [a for a in found if private(a)]
    if bad:
        raise Refused(
            f"{host} resolves to {bad[0]}, which is on this machine or this "
            f"network rather than the internet. Blokk will not fetch it — "
            f"that is how a fetch tool becomes a way to read your router.")
    return host


# ------------------------------------------------------------------- fetching
KEY = "egress_allow"


def allowlist(store) -> list[str]:
    """Every host anything on this Mac may reach. One list.

    A missing row is an empty list, which refuses everything — the safe way
    round for the only door out. It is never created implicitly: a host gets
    on here because somebody put it there.
    """
    row = store.one("SELECT value FROM setting WHERE key=?", KEY)
    if not row:
        return []
    try:
        return list(json.loads(row["value"] or "[]"))
    except (ValueError, TypeError):
        return []


def _save(store, hosts: list[str]) -> None:
    store.x("INSERT OR REPLACE INTO setting(key,value) VALUES(?,?)",
            KEY, json.dumps(sorted(set(hosts))))


def _log(url: str, note: str) -> None:
    """Append-only, and never a reason for the fetch to fail.

    This is what answers "what has this thing been talking to" without a
    database and without the app running.
    """
    try:
        LOG.parent.mkdir(exist_ok=True)
        with LOG.open("a", errors="replace") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  "
                    f"{url}  {note}\n")
    except OSError:
        pass


# The methods this gate will make. GET and POST are the web; PROPFIND and
# REPORT are WebDAV, which is what CalDAV is built on — and not supporting
# them was the whole reason caldav_cal.py called urlopen itself and stayed
# outside the only place anything is supposed to leave. Deliberately a list
# rather than "whatever the caller passes": PUT and DELETE would make this a
# way to change somebody's calendar, and nothing in Blokk writes over the
# network.
METHODS = ("GET", "POST", "PROPFIND", "REPORT")


def fetch(store, url: str, *, data: bytes | None = None,
          headers: dict | None = None, timeout: int = TIMEOUT,
          max_bytes: int = MAX_BYTES, method: str | None = None) -> dict:
    """One request, through the gate. Returns the body as text.

    Never follows a redirect it has not re-checked, and never returns more
    than max_bytes. Raises Refused for anything the rules turn down, with a
    sentence that names the host and what to do.

    `method` is for WebDAV. It is checked against METHODS rather than passed
    through, because a gate that will make any request it is handed is a
    gate with a hole shaped like whatever the caller wants.
    """
    verb = (method or ("POST" if data else "GET")).upper()
    if verb not in METHODS:
        raise Refused(f"{verb} is not a method this gate makes. It does: "
                      + ", ".join(METHODS) + ".")
    allow = allowlist(store)
    seen = []
    for hop in range(MAX_HOPS + 1):
        try:
            check(allow, url)
        except Refused as e:
            _log(url, f"refused: {e}")
            raise
        seen.append(url)
        req = urllib.request.Request(url, data=data, method=verb)
        # A plain, honest agent. Some of these APIs ask for one, and a tool
        # that lies about what it is has no business reading your calendar.
        req.add_header("User-Agent", "Blokk/1 (local agent; one Mac)")
        req.add_header("Accept-Encoding", "identity")     # so max_bytes means bytes
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            # Redirects are handled here rather than by urllib, which would
            # follow one to anywhere without asking this file first.
            opener = urllib.request.build_opener(_NoRedirect)
            r = opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                nxt = e.headers.get("Location") or ""
                if not nxt:
                    _log(url, f"{e.code} with no Location")
                    raise Refused(f"{url} redirected to nowhere") from e
                url = urllib.parse.urljoin(url, nxt)
                _log(seen[-1], f"{e.code} -> {url}")
                continue
            body = e.read(2048).decode("utf-8", "replace")
            _log(url, f"HTTP {e.code}")
            raise Refused(f"{urlparse(url).hostname} answered "
                          f"{e.code} {e.reason}: {body[:200]}") from e
        except (urllib.error.URLError, OSError) as e:
            _log(url, f"failed: {type(e).__name__}")
            raise Refused(f"could not reach {urlparse(url).hostname}: "
                          f"{getattr(e, 'reason', e)}") from e

        with r:
            raw = r.read(max_bytes + 1)
        if len(raw) > max_bytes:
            _log(url, f"over {max_bytes} bytes")
            raise Refused(
                f"{urlparse(url).hostname} answered with more than "
                f"{max_bytes // 1024}KB. Blokk reads APIs, not documents.")
        _log(url, f"{r.status} {len(raw)}B")
        return {"ok": True, "status": r.status, "url": url,
                "bytes": len(raw), "hops": seen,
                "text": raw.decode("utf-8", "replace")}

    _log(url, "too many redirects")
    raise Refused(f"{seen[0]} redirected more than {MAX_HOPS} times")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Hands the redirect back so fetch() can re-check the destination.

    urllib follows them itself by default, which would walk straight off the
    allowlist on the first 302 an allowed host felt like sending.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_json(store, url: str, **kw) -> dict:
    """The same, for an endpoint that promised JSON."""
    out = fetch(store, url, **kw)
    try:
        return json.loads(out["text"])
    except ValueError as e:
        head = out["text"][:80].strip()
        raise Refused(f"{urlparse(out['url']).hostname} answered "
                      f"{out['bytes']} bytes that are not JSON: {head!r}") from e


# ------------------------------------------------------- managing the list
def allow(store, host: str) -> dict:
    host = (host or "").strip().lower().lstrip("*.").rstrip("./")
    if not host or "/" in host or " " in host:
        return {"error": f"{host!r} is not a hostname"}
    have = allowlist(store)
    if host in have:
        return {"ok": True, "allow": have, "detail": f"{host} was already on it"}
    have.append(host)
    _save(store, have)
    return {"ok": True, "allow": sorted(set(have)),
            "detail": f"anything wired here may now reach {host}"}


def disallow(store, host: str) -> dict:
    host = (host or "").strip().lower()
    have = allowlist(store)
    if not host:
        # Without this the sentence below comes out as " is not on the
        # list", which names neither what broke nor what to do about it.
        return {"error": "which host? The list has: "
                         + (", ".join(have) if have else "nothing on it")}
    if host not in have:
        return {"error": f"{host} is not on the list"}
    have.remove(host)
    _save(store, have)
    return {"ok": True, "allow": have,
            "detail": f"nothing here can reach {host} any more"}


def recent(n: int = 40) -> list[str]:
    """The tail of the log, for the panel that asks what has been leaving."""
    try:
        return LOG.read_text(errors="replace").splitlines()[-n:]
    except OSError:
        return []
