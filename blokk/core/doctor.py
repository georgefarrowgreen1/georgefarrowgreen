"""./blokk doctor — why the phone cannot reach this Mac.

Four things stop it, and from the phone they all look identical: the server
is not running, it is running on a different address than the one you typed,
the firewall is eating the connection, or you are on a different network.
Safari says "the network connection was lost" for every one of them, which is
the least useful sentence in computing.

So check them here, where the answers exist.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOLD, DIM, GREEN, AMBER, RED, OFF = (
    "\033[1m", "\033[2m", "\033[32m", "\033[33m", "\033[31m", "\033[0m")


def _c(s, colour):
    return f"{colour}{s}{OFF}" if sys.stdout.isatty() else s


def row(label, state, detail=""):
    print(f"  {label:<16}{state}" + (f"  {_c(detail, DIM)}" if detail else ""))


def interfaces() -> list[tuple[str, str]]:
    """Every IPv4 this machine has, with its interface, not just one guess."""
    out = []
    try:
        txt = subprocess.run(["ifconfig"], capture_output=True, text=True,
                             timeout=10).stdout
        name = ""
        for line in txt.splitlines():
            if line and not line[0].isspace():
                name = line.split(":")[0]
            elif "inet " in line:
                ip = line.split("inet ")[1].split()[0]
                if not ip.startswith("127."):
                    out.append((name, ip))
    except Exception:
        pass                                  # no ifconfig; try the Linux tool
    if not out:
        try:
            txt = subprocess.run(["ip", "-4", "-o", "addr"], capture_output=True,
                                 text=True, timeout=10).stdout
            for line in txt.splitlines():
                f = line.split()
                if len(f) > 3 and not f[3].startswith("127."):
                    out.append((f[1], f[3].split("/")[0]))
        except Exception:
            pass
    if not out:
        # Last resort: ask the routing table which address leaves this box.
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("10.255.255.255", 1))
            out.append(("?", s.getsockname()[0]))
        except Exception:
            pass
        finally:
            s.close()
    return out


def listening(port: int) -> bool:
    """Can something already be reached on this port, from off-loopback?"""
    s = socket.socket()
    s.settimeout(1.5)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def reachable(ip: str, port: int) -> bool:
    s = socket.socket()
    s.settimeout(2.0)
    try:
        return s.connect_ex((ip, port)) == 0
    finally:
        s.close()


def firewall() -> tuple[str, str]:
    """macOS blocks incoming connections per-binary, silently."""
    fw = "/usr/libexec/ApplicationFirewall/socketfilterfw"
    if not Path(fw).exists():
        return "not macOS", ""
    try:
        state = subprocess.run([fw, "--getglobalstate"], capture_output=True,
                               text=True, timeout=10).stdout.strip()
    except Exception as e:
        return "could not ask", str(e)[:40]
    if "disabled" in state.lower():
        return "off", "nothing blocked"
    try:
        apps = subprocess.run([fw, "--listapps"], capture_output=True,
                              text=True, timeout=15).stdout
    except Exception:
        apps = ""
    allowed = "python" in apps.lower()
    return ("on", "python is listed as allowed" if allowed else
            "python is NOT listed — this is very likely your problem")


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"\n  {_c('Can your phone reach this Mac?', BOLD)}\n")

    up = listening(port)
    row("control plane", _c("running", GREEN) if up else _c("NOT RUNNING", RED),
        f"port {port}" if up else "start it with ./blokk")

    ips = interfaces()
    if not ips:
        row("this mac", _c("no network", RED), "no non-loopback address")
    for i, (name, ip) in enumerate(ips):
        ok = reachable(ip, port) if up else False
        label = "this mac" if i == 0 else ""
        row(label, f"{ip:<16}{_c('reachable', GREEN) if ok else _c('no answer', AMBER)}",
            f"{name}" + ("" if ok else "  — phone cannot use this one"))

    state, note = firewall()
    colour = RED if "NOT listed" in note else (GREEN if state == "off" else AMBER)
    row("firewall", _c(state, colour), note)

    good = [ip for n, ip in ips if up and reachable(ip, port)]
    print()
    if not up:
        print(f"  {_c('Blokk is not running.', RED)} Start it: ./blokk\n")
        return 1
    if not good:
        print(f"  {_c('Running, but unreachable from the network.', RED)}")
        print(f"  {_c('Allow python3 in System Settings > Network > Firewall,', DIM)}")
        print(f"  {_c('or turn the firewall off while you test.', DIM)}\n")
        return 1

    token = ""
    tf = ROOT / ".blokk-token"
    if tf.exists():
        token = tf.read_text().strip()
    token = os.environ.get("BLOKK_TOKEN") or token
    url = f"http://{good[0]}:{port}/?t={token}"
    print(f"  {_c('Open this on the phone', BOLD)} — same wifi as the Mac:\n")
    print(f"     {_c(url, GREEN)}\n")
    try:
        from core import qr
        import shutil
        if sys.stdout.isatty() and qr.width(url) <= shutil.get_terminal_size(
                (80, 24)).columns - 4:
            for line in qr.render(url).splitlines():
                print("     " + line)
            print()
    except Exception:
        pass
    print(f"  {_c('If it still fails: check the phone is on wifi and not', DIM)}")
    print(f"  {_c('a guest network, and that iCloud Private Relay is off.', DIM)}\n")
    return 0


if __name__ == "__main__":
    if __package__ in (None, ""):
        sys.path.insert(0, str(ROOT))
    raise SystemExit(main())
