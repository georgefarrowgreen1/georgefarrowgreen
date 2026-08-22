"""./blokk doctor — the two questions that stop Blokk working.

**Can the phone reach this Mac?** Four things stop it, and from the phone they
all look identical: the server is not running, it is running on a different
address than the one you typed, the firewall is eating the connection, or you
are on a different network. Safari says "the network connection was lost" for
every one of them, which is the least useful sentence in computing.

**Can the agent reach a model?** A dead model server degrades per workspace by
design — the sweep finishes, and one workspace says "no model server at
http://127.0.0.1:8081/v1 (Connection refused)". Correct, and it leaves you
holding a port number. Whether the binary is installed, whether a tier is
configured at all, whether something *else* took the port, and what
llama-server said on its way out are four different faults behind that one
sentence.

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


def models() -> list[str]:
    """The model server, tier by tier. Returns what to do about it.

    Everything here is asked of the machine rather than assumed: the conf
    says what should be running, and every line below says what is.
    """
    from core import servers as srv

    print(f"\n  {_c('Can the agent reach a model?', BOLD)}\n")
    conf = srv.read_conf()
    mode = conf.get("MODE")
    todo: list[str] = []

    if not mode:
        row("mode", _c("not configured", AMBER), "no blokk.conf — run ./blokk")
        return ["Nothing is configured yet. Run ./blokk and finish the wizard."]
    if mode == "stubs":
        row("mode", _c("stubs", GREEN), "no model server needed")
        print(f"\n  {_c('Every mechanism is real; only the prose is placeholder.', DIM)}")
        print(f"  {_c('Attach weights in the setup wizard when you want real text.', DIM)}")
        return []

    row("mode", mode, "a model server is expected")
    tiers = srv.tiers_from_conf()
    if not tiers:
        row("tiers", _c("none declared", RED),
            f"MODE={mode} but no SMALL_BACKEND in blokk.conf")
        return ["blokk.conf says to use a model server but declares no tier. "
                "Re-run setup: ./blokk, then the ⚙ button."]

    for t in tiers:
        low = t.name.lower()
        if not srv.installed(t.backend):
            row(f"{low} tier", _c("NOT INSTALLED", RED), f"{t.binary} is not on PATH")
            todo.append(
                f"{t.binary} is not installed. "
                + ("brew install llama.cpp" if t.backend == "llama.cpp"
                   else "python3 -m pip install mlx-lm"))
            continue

        if t.path and not Path(t.path).exists():
            # A symlink into models/ outlives the file it points at, and the
            # error llama-server gives for it names the link, not the target.
            row(f"{low} weights", _c("MISSING", RED), t.path)
            todo.append(f"{t.name} points at {t.path}, which is not there. "
                        f"Put the .gguf back, or pick another model in setup.")

        if srv.alive(t.port):
            row(f"{low} tier", _c("answering", GREEN),
                f":{t.port}  {t.alias}")
            continue

        if listening(t.port):
            # Something is on the port but will not list models — an older
            # server, a different app, or one still loading weights.
            row(f"{low} tier", _c("WRONG SERVER", RED),
                f"something is on :{t.port} but does not answer /v1/models")
            todo.append(f"Port {t.port} is taken by something that is not a "
                        f"model server. Find it: lsof -nP -iTCP:{t.port}")
        else:
            row(f"{low} tier", _c("NOT RUNNING", RED),
                f"nothing is listening on :{t.port}")
            todo.append(f"The {low} tier is not running. Start it: ./run.sh")

        tail = [ln for ln in srv.log_tail(t.name, 8) if ln.strip()]
        if tail:
            print(f"    {_c('last words, from logs/' + low + '.log:', DIM)}")
            for ln in tail:
                print(f"      {_c(ln[:100], DIM)}")
        else:
            print(f"    {_c('no log at logs/' + low + '.log — it has never started', DIM)}")

    # What the harness will actually dial. Usually the tier port; not always,
    # because the URLs are written once and the ports can be edited after.
    for pre in ("SMALL", "LARGE"):
        url = conf.get(f"BLOKK_{pre}_URL")
        if not url:
            continue
        declared = {t.port for t in tiers}
        try:
            u_port = int(url.rsplit(":", 1)[1].split("/")[0])
        except Exception:                                        # noqa: BLE001
            u_port = -1
        if u_port not in declared:
            row("mismatch", _c("BLOKK_" + pre + "_URL", RED),
                f"{url} — no tier serves :{u_port}")
            todo.append(f"BLOKK_{pre}_URL points at :{u_port}, which no tier "
                        f"serves. Fix it in blokk.conf.")
    return todo


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
        print(f"  {_c('Blokk is not running.', RED)} Start it: ./blokk")
    elif not good:
        print(f"  {_c('Running, but unreachable from the network.', RED)}")
        print(f"  {_c('Allow python3 in System Settings > Network > Firewall,', DIM)}")
        print(f"  {_c('or turn the firewall off while you test.', DIM)}")

    # Asked whatever the network said. The two faults are independent, and
    # answering only the first sends you back to run this twice.
    try:
        todo = models()
    except Exception as e:                                       # noqa: BLE001
        print(f"  {_c('could not check the model server: ' + str(e)[:60], AMBER)}")
        todo = []
    if todo:
        print(f"\n  {_c('To get real text instead of placeholder:', BOLD)}")
        for item in todo:
            print(f"    • {item}")
    print()

    if not up or not good:
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
    # Non-zero when anything above needs doing, including a model fault. A
    # doctor that exits 0 while printing "llama-server is not installed" is
    # the silent failure this whole file exists to stop.
    return 1 if todo else 0


if __name__ == "__main__":
    if __package__ in (None, ""):
        sys.path.insert(0, str(ROOT))
    raise SystemExit(main())
