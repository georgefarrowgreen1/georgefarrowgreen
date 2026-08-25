"""`./blokk listen` — watch the port and say what arrives, if anything.

Four rounds of this have been diagnosed from the far side of a screenshot:
a phone says "the network connection was lost", and everything on the Mac
that could explain it — the address, the port, the scheme, the firewall —
had to be guessed at and fixed blind. Three of those guesses were right and
the phone still could not connect, which means the loop is the problem and
not any individual guess.

So: stop inferring. This binds the port, prints the link, and then reports
every TCP connection that arrives — where from, and what it said. That
splits the question in half, which is the whole point:

  * **Something arrives.** The network is fine. The phone reached this Mac,
    the router passed it, the firewall let it in. Whatever is wrong is in
    what happened next, and this says what: a TLS ClientHello (the address
    was typed without http://), a request with no token, a request for a
    path that does not exist.

  * **Nothing arrives, and the phone says the connection was lost.** Then
    nothing this program does can help, because nothing this program does
    ever ran. It is the firewall, the router, or the phone being on a
    different network — and this says which of the three to look at.

It is deliberately not the control plane. A separate listener on a separate
port means the answer does not depend on the database opening, the model
server, or any of the rest of it — and none of those can be the reason the
test came back negative. It answers every request with one small page so a
phone that gets through *sees* that it got through, rather than looking at
a spinner while the Mac quietly logs a success.
"""
from __future__ import annotations

import socket
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BOLD, DIM, GREEN, RED, AMBER, OFF = (
    "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[0m")

PAGE = (
    "<!doctype html><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>Blokk reached</title>"
    "<style>html{color-scheme:dark light}"
    "body{font:-apple-system-body,system-ui,sans-serif;margin:0;"
    "min-height:100svh;display:grid;place-items:center;text-align:center;"
    "padding:24px;background:#000;color:#fff}"
    "@media(prefers-color-scheme:light){body{background:#fff;color:#000}}"
    "h1{font-size:22px;margin:0 0 12px}p{opacity:.7;max-width:30ch;"
    "line-height:1.45;margin:0}</style>"
    "<div><h1>Your phone reached this Mac.</h1>"
    "<p>The network between them is fine. Go back to the terminal — it has "
    "printed what arrived.</p></div>")


def _describe(head: bytes) -> tuple[str, str]:
    """What the first bytes of a connection are, and what that means.

    Named rather than dumped: the raw bytes of a ClientHello tell somebody
    standing in a kitchen with a phone precisely nothing.
    """
    if not head:
        return ("opened and said nothing",
                "a preconnect, or something that gave up before asking. "
                "Harmless on its own; it is only a fault if nothing else "
                "arrives.")
    if head[:1] == b"\x16" and head[1:2] == b"\x03":
        return ("HTTPS (a TLS handshake)",
                "the address was typed without http:// in front, so the "
                "browser upgraded it. Type the http:// or scan the QR "
                "code — everything else about the connection is working.")
    try:
        line = head.split(b"\r\n", 1)[0].decode("ascii", "replace")[:80]
    except Exception:                                            # noqa: BLE001
        line = repr(head[:40])
    if line.split(" ", 1)[0] in ("GET", "POST", "HEAD", "PUT", "OPTIONS"):
        return (f"HTTP — {line}",
                "the phone reached this Mac and spoke plain HTTP. The "
                "network is not your problem.")
    return (f"something else — {line}",
            "not HTTP and not TLS. Something on the network is answering "
            "on this port, or rewriting what passes through it.")


def listen(port: int = 8080, seconds: int = 180) -> int:
    """Bind, print the link, and report what turns up. Returns an exit code."""
    from core import doctor

    found = doctor.phone_addresses(0)
    usable = [r for r in found if r["usable"]]
    if not usable:
        print(f"\n  {RED}No address on this Mac is one a phone could use.{OFF}")
        for r in found[:4]:
            print(f"    {r['ip']:<16}{r['interface']}  — {r['why']}")
        print(f"  {DIM}Join wifi, or turn a VPN off, then try again.{OFF}\n")
        return 1
    ip = usable[0]["ip"]

    # A port of its own. Binding the one the control plane uses would either
    # collide with it or, worse, quietly test a *different* program than the
    # one the phone is being sent to.
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(("0.0.0.0", port))
    except OSError as e:
        print(f"\n  {RED}Could not open port {port}: {e}{OFF}")
        print(f"  {DIM}Blokk is probably already running. Stop it, or pass "
              f"another port: ./blokk listen 8099{OFF}\n")
        return 1
    srv.listen(8)

    url = f"http://{ip}:{port}/"
    print(f"\n  {BOLD}Open this on the phone, exactly as it is:{OFF}")
    print(f"      {GREEN}{url}{OFF}")
    print(f"  {DIM}No token needed — this is only listening, it serves "
          f"nothing of yours.{OFF}")
    try:
        from core import qr
        import shutil
        if sys.stdout.isatty() and qr.width(url) <= shutil.get_terminal_size(
                (80, 24)).columns - 6:
            print()
            for line in qr.render(url).splitlines():
                print("      " + line)
    except Exception:                                            # noqa: BLE001
        pass

    state, note = doctor.firewall()
    if "BLOCK" in note or "BLOCKED" in note or "NOT listed" in note:
        print(f"\n  {AMBER}Before you do: {note}{OFF}")

    print(f"\n  {BOLD}Waiting {seconds}s.{OFF} Every connection that arrives "
          f"is printed below.")
    print(f"  {DIM}Ctrl-C when you have seen enough.{OFF}\n")

    seen: list[dict] = []
    stop = threading.Event()

    def serve(conn, addr):
        try:
            conn.settimeout(4)
            try:
                head = conn.recv(1024)
            except OSError:
                head = b""
            kind, meaning = _describe(head)
            seen.append({"from": addr[0], "kind": kind, "meaning": meaning})
            when = time.strftime("%H:%M:%S")
            print(f"  {GREEN}{when}  connection from {addr[0]}{OFF}")
            print(f"           {kind}")
            print(f"           {DIM}{meaning}{OFF}\n")
            body = PAGE.encode()
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: "
                         b"text/html; charset=utf-8\r\nContent-Length: "
                         + str(len(body)).encode()
                         + b"\r\nConnection: close\r\n\r\n" + body)
        except OSError:
            pass                    # it hung up; it is already recorded
        finally:
            try:
                conn.close()
            except OSError:
                pass

    srv.settimeout(1.0)
    end = time.time() + seconds
    try:
        while time.time() < end and not stop.is_set():
            try:
                conn, addr = srv.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=serve, args=(conn, addr),
                             daemon=True).start()
    except KeyboardInterrupt:
        print()
    finally:
        srv.close()

    return _verdict(seen, state, note, port)


def _verdict(seen: list, state: str, note: str, port: int) -> int:
    """The half of the question this answered, said plainly."""
    print(f"  {BOLD}{'─' * 58}{OFF}")
    if not seen:
        print(f"  {RED}Nothing arrived.{OFF} Not one connection, from "
              f"anything.")
        print()
        print(f"  {DIM}Whatever is wrong is between the phone and this Mac, "
              f"and it is{OFF}")
        print(f"  {DIM}one of these three. In the order worth checking:{OFF}")
        print()
        if state == "on" and ("BLOCK" in note or "NOT listed" in note):
            print(f"    1. {AMBER}The firewall on this Mac.{OFF} {note}")
        else:
            print(f"    1. The firewall on this Mac — System Settings > "
                  f"Network >")
            print(f"       Firewall. Turning it off for one minute settles "
                  f"whether it is this.")
        print(f"    2. The phone is on a different network — a guest SSID, "
              f"the other")
        print(f"       half of a split 2.4/5GHz pair, or wifi off and 5G on.")
        print(f"    3. The router is keeping its clients apart (AP or client")
        print(f"       isolation), which guest networks do by default.")
        print()
        return 1

    tls = [s for s in seen if "TLS" in s["kind"]]
    http = [s for s in seen if s["kind"].startswith("HTTP —")]
    who = sorted({s["from"] for s in seen})
    print(f"  {GREEN}{len(seen)} connection(s) arrived{OFF} from "
          f"{', '.join(who)}.")
    print()
    print(f"  {BOLD}The network between the phone and this Mac is fine.{OFF} "
          f"It reached")
    print(f"  the Mac, the router passed it, and the firewall let it in.")
    print()
    if http:
        print(f"  {DIM}Plain HTTP got through, which is what Blokk serves. "
              f"If the app{OFF}")
        print(f"  {DIM}itself will not load, the fault is in the app or the "
              f"token —{OFF}")
        print(f"  {DIM}not the network. ./blokk doctor covers that half.{OFF}")
    elif tls:
        print(f"  {AMBER}Every connection was HTTPS.{OFF} The address is "
              f"being typed without")
        print(f"  the http:// in front, so the browser upgrades it and this "
              f"port")
        print(f"  does not speak TLS. Type the http://, or scan the QR code.")
    else:
        print(f"  {DIM}Something connected and never asked for anything — a "
              f"preconnect,{OFF}")
        print(f"  {DIM}or a browser that gave up. Try again and load the "
              f"page properly.{OFF}")
    print()
    return 0


def _main(argv) -> int:
    port = 8080
    seconds = 180
    for a in argv:
        if a.isdigit():
            port = int(a)
        elif a.startswith("--for="):
            try:
                seconds = max(10, min(int(a[6:]), 1800))
            except ValueError:
                pass
    print(f"\n  {BOLD}Can your phone reach this Mac at all?{OFF}")
    print(f"  {DIM}This listens on port {port} and prints whatever arrives. "
          f"It serves{OFF}")
    print(f"  {DIM}nothing of yours and needs no token.{OFF}")
    return listen(port, seconds)


if __name__ == "__main__":
    if __package__ in (None, ""):
        sys.path.insert(0, str(ROOT))
    raise SystemExit(_main(sys.argv[1:]))
