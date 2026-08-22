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


def model_report() -> dict:
    """The model server's state, as data.

    Data rather than print() because two surfaces ask the same question and
    must not answer it differently: `./blokk doctor` in the terminal and the
    dashboard, which is where anyone actually notices that the prose has gone
    back to placeholder.

    Everything here is asked of the machine rather than assumed: the conf
    says what should be running, every field says what is.
    """
    from core import servers as srv

    conf = srv.read_conf()
    mode = conf.get("MODE")
    out: dict = {"mode": mode, "tiers": [], "todo": [], "ok": False}

    if not mode:
        out["todo"] = ["Nothing is configured yet. Run ./blokk and finish "
                       "the wizard."]
        return out
    if mode == "stubs":
        # Not a fault. Stubs are a supported way to run, and the wizard says
        # so; reporting them as a problem trains people to ignore this.
        out["ok"] = True
        return out

    tiers = srv.tiers_from_conf()
    if not tiers:
        out["todo"] = [f"blokk.conf says MODE={mode} but declares no tier. "
                       f"Re-run setup: ./blokk, then the ⚙ button."]
        return out

    for t in tiers:
        d = {"name": t.name, "backend": t.backend, "port": t.port,
             "alias": t.alias, "state": "", "detail": "", "log": []}
        out["tiers"].append(d)

        if not srv.installed(t.backend):
            d["state"], d["detail"] = "not installed", f"{t.binary} is not on PATH"
            out["todo"].append(
                f"{t.binary} is not installed. "
                + ("brew install llama.cpp" if t.backend == "llama.cpp"
                   else "python3 -m pip install mlx-lm"))
            continue

        # Answering first, and then stop. A tier that is serving was started
        # from something, whatever the conf now says; complaining about the
        # path at that point sends someone to fix a file that is not the
        # problem. The weights check earns its keep only when nothing is up.
        if srv.alive(t.port):
            d["state"], d["detail"] = "answering", f":{t.port}  {t.alias}"
            continue

        if t.path and not Path(t.path).exists():
            # A symlink into models/ outlives the file it points at, and what
            # llama-server says about it names the link, not the target.
            d["weights"], d["path"] = "missing", t.path
            out["todo"].append(f"{t.name} points at {t.path}, which is not "
                               f"there. Put the .gguf back, or pick another "
                               f"model in setup.")

        if listening(t.port):
            # Something is on the port but will not list models — an older
            # server, a different app, or one still loading weights.
            d["state"] = "wrong server"
            d["detail"] = (f"something is on :{t.port} but does not answer "
                           f"/v1/models")
            out["todo"].append(f"Port {t.port} is taken by something that is "
                               f"not a model server. Find it: "
                               f"lsof -nP -iTCP:{t.port}")
        else:
            d["state"] = "not running"
            d["detail"] = f"nothing is listening on :{t.port}"
            out["todo"].append(f"The {t.name.lower()} tier is not running. "
                               f"Start it: ./run.sh")
        d["log"] = [ln for ln in srv.log_tail(t.name, 8) if ln.strip()]

    # What the harness will actually dial. Usually the tier port; not always,
    # because the URLs are written once and the ports can be edited after.
    declared = {t.port for t in tiers}
    for pre in ("SMALL", "LARGE"):
        url = conf.get(f"BLOKK_{pre}_URL")
        if not url:
            continue
        try:
            u_port = int(url.rsplit(":", 1)[1].split("/")[0])
        except Exception:                                        # noqa: BLE001
            u_port = -1
        if u_port not in declared:
            out["todo"].append(f"BLOKK_{pre}_URL points at :{u_port}, which "
                               f"no tier serves. Fix it in blokk.conf.")
            out.setdefault("mismatch", []).append({"var": f"BLOKK_{pre}_URL",
                                                   "url": url})
    out["ok"] = not out["todo"]
    return out


def models() -> list[str]:
    """Render model_report() for the terminal. Returns what to do about it."""
    print(f"\n  {_c('Can the agent reach a model?', BOLD)}\n")
    r = model_report()

    if not r["mode"]:
        row("mode", _c("not configured", AMBER), "no blokk.conf — run ./blokk")
        return r["todo"]
    if r["mode"] == "stubs":
        row("mode", _c("stubs", GREEN), "no model server needed")
        print(f"\n  {_c('Every mechanism is real; only the prose is placeholder.', DIM)}")
        print(f"  {_c('Attach weights in the setup wizard when you want real text.', DIM)}")
        return []

    row("mode", r["mode"], "a model server is expected")
    if not r["tiers"]:
        row("tiers", _c("none declared", RED),
            f"MODE={r['mode']} but no SMALL_BACKEND in blokk.conf")
        return r["todo"]

    for d in r["tiers"]:
        low = d["name"].lower()
        if d.get("weights") == "missing":
            row(f"{low} weights", _c("MISSING", RED), d.get("path", ""))
        up = d["state"] == "answering"
        row(f"{low} tier",
            _c(d["state"] if up else d["state"].upper(), GREEN if up else RED),
            d["detail"])
        if d["state"] == "answering":
            continue
        if d["log"]:
            print(f"    {_c('last words, from logs/' + low + '.log:', DIM)}")
            for ln in d["log"]:
                print(f"      {_c(ln[:100], DIM)}")
        elif d["state"] != "not installed":
            print(f"    {_c('no log at logs/' + low + '.log — it has never started', DIM)}")

    for m in r.get("mismatch", []):
        row("mismatch", _c(m["var"], RED), m["url"])
    return r["todo"]


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
