"""./blokk doctor — the two questions that stop Blokk working.

**Can the phone reach this Mac?** Four things stop it, and from the phone they
all look identical: the server is not running, it is running on a different
address than the one you typed, the firewall is eating the connection, or you
are on a different network. Safari says "the network connection was lost" for
every one of them, which is the least useful sentence in computing.

**Can the agent reach a model?** A dead model server degrades by design —
the sweep finishes, and the run says "no model server at
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
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOLD, DIM, GREEN, AMBER, RED, OFF = (
    "\033[1m", "\033[2m", "\033[32m", "\033[33m", "\033[31m", "\033[0m")


def _c(s, colour):
    return f"{colour}{s}{OFF}" if sys.stdout.isatty() else s


def row(label, state, detail=""):
    # min-width, not fixed width. "georgefg/maildir" is exactly sixteen
    # characters and ran straight into its own status: "maildirreading".
    print(f"  {label:<16}" + (" " if len(label) >= 16 else "") + f"{state}"
          + (f"  {_c(detail, DIM)}" if detail else ""))


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
    """Is something listening on this address — asked from *this* machine.

    Read the name carefully, because it was read wrongly for a long time and
    the phone panel was built on the misreading. This opens a socket from the
    Mac to one of the Mac's own addresses. The server binds 0.0.0.0, so the
    connection never leaves the box and it succeeds for *every* address the
    machine holds: the VPN tunnel, the Docker bridge, the AirDrop link-local,
    the Parallels adapter, and — as this was written — a reserved TEST-NET
    address that is by definition unroutable.

    So this answers "am I bound to that port", which is worth knowing. It
    does not answer "can the phone get here", and nothing running on the Mac
    can: that is a question about the network between two devices, and only
    the other device can answer it. phone_addresses() below ranks by what a
    phone could plausibly route to and says so in those words.
    """
    s = socket.socket()
    s.settimeout(2.0)
    try:
        return s.connect_ex((ip, port)) == 0
    finally:
        s.close()


# Interfaces a phone on your wifi cannot use, whatever they answer when the
# Mac asks itself. Matched on the prefix, because they are all numbered.
#
#   utun/ipsec/ppp  a VPN tunnel. iCloud Private Relay, a work VPN and
#                   Tailscale all put one here, and the phone is not on it.
#   awdl/llw        AirDrop and low-latency wifi. Peer-to-peer, not a LAN.
#   anpi            Apple's own private interface to the co-processor.
#   bridge/vmenet   Docker, Parallels, UTM, Internet Sharing. Reachable from
#   vnic/vboxnet    the Mac and from the virtual machines on it, nobody else.
#   docker/veth     The same, on Linux.
#   gif/stf         Tunnel pseudo-interfaces.
#   ap              The hotspot interface, up even when nothing is shared.
NOT_A_LAN = ("utun", "ipsec", "ppp", "awdl", "llw", "anpi", "bridge",
             "vmenet", "vnic", "vboxnet", "docker", "veth", "gif", "stf",
             "ap")


def _kind(name: str, ip: str) -> tuple[str, bool, str]:
    """What this address is, whether a phone can use it, and why not."""
    n = (name or "").lower().rstrip("0123456789")
    parts = ip.split(".")
    try:
        a, b = int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        return "odd", False, "not an address this understands"

    # Address first: a bad address on a good interface is still bad.
    if (a, b) == (169, 254):
        return ("link-local", False,
                "the 169.254 range means this interface asked for an address "
                "and nothing answered — it is not on a working network")
    # RFC 5737, reserved for documentation and guaranteed unroutable.
    if (a, b) in ((192, 0), (198, 51), (203, 0)) and ip.startswith(
            ("192.0.2.", "198.51.100.", "203.0.113.")):
        return ("reserved", False,
                "this range is reserved for documentation and never routes")
    # This one range is judged by address *before* the interface,
    # deliberately. On macOS a Tailscale address lives on a utun, and
    # checking the interface first filed a working mesh address under "a
    # VPN tunnel the phone is not on" — the phone CAN be on this one, which
    # is the entire point of a mesh. It is also the address that gets
    # around every cause on the phone-reach list at once: it works from
    # anywhere (home wifi included), the router never sees it, and it is
    # not the local network, so iOS's Local Network permission does not
    # apply to it.
    if a == 100 and 64 <= b <= 127:
        return ("tailnet", True,
                "a private mesh — Tailscale numbers this range. Works from "
                "anywhere, home wifi included, when the phone runs Tailscale "
                "on the same account; iOS's Local Network permission does "
                "not apply to it")
    if n.startswith(NOT_A_LAN):
        why = f"{name} is not the network your phone is on"
        if n.startswith(("bridge", "vmenet", "vnic", "vboxnet")):
            why += " — unless you are sharing this Mac's connection to it"
        return (n or "?", False, why)

    private = (a == 10 or (a == 172 and 16 <= b <= 31) or (a, b) == (192, 168))
    if private:
        return ("lan", True, "a home or office network — this is the one to try")
    return ("public", True,
            "a public address; it will work only if your router lets the "
            "phone reach it")


def phone_addresses(port: int) -> list[dict]:
    """Every address, ranked by what a phone could actually route to.

    The panel used to take the first thing ifconfig printed that answered a
    connection from the Mac to itself, which is every address the Mac has.
    On a machine with a VPN or Docker running — which is most of them — the
    QR code pointed at a tunnel the phone has never heard of.

    Nothing here is a promise. The Mac cannot test the phone's side, so this
    ranks and explains rather than claiming, and hands back every candidate
    so somebody looking at the list can try the next one.
    """
    out = []
    for name, ip in interfaces():
        kind, usable, why = _kind(name, ip)
        out.append({"ip": ip, "interface": name, "kind": kind,
                    "usable": usable, "why": why,
                    # What the Mac *can* answer: is the server bound here.
                    "listening": reachable(ip, port)})
    # Usable first, then a LAN address before a public one, then the lower
    # interface number — en0 is the built-in wifi on every Mac.
    # The LAN first: on home wifi it is the shorter path, and it needs no
    # second app on the phone. The mesh next, ahead of a public address —
    # it is a link a phone can actually be sent to, wherever it is.
    order = {"lan": 0, "tailnet": 1, "public": 2}
    out.sort(key=lambda r: (not r["usable"], not r["listening"],
                            order.get(r["kind"], 9), r["interface"]))
    return out


def mesh_status() -> dict:
    """What Tailscale itself says, read and never touched.

    Recognised, never published — and until now, never *asked*. The mesh
    address was judged by its shape alone, so "unable to access via
    Tailscale" had no diagnosis at all: a stopped tailscaled, a logged-out
    Mac and a phone that simply is not on the tailnet all rendered as the
    same green link that does not work. The status command answers all
    three, read-only, and the Mac App Store build keeps its CLI inside the
    app bundle where `which` never looks.

    The findings this feeds are phrased around the split that matters:
    everything on the Mac's side (installed, running, logged in) versus
    the one thing only the phone can fix (its Tailscale app, signed into
    the same tailnet, switched on).
    """
    import json as _json
    import shutil as _sh
    ts = _sh.which("tailscale") or next(
        (p for p in ("/Applications/Tailscale.app/Contents/MacOS/Tailscale",
                     "/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale")
         if Path(p).exists()), "")
    if not ts:
        return {"installed": False}
    try:
        r = subprocess.run([ts, "status", "--json"], capture_output=True,
                           text=True, timeout=6)
        d = _json.loads(r.stdout or "{}")
    except (OSError, subprocess.SubprocessError, ValueError):
        return {"installed": True, "state": "unreadable"}
    peers = []
    for p in (d.get("Peer") or {}).values():
        peers.append({"name": str(p.get("HostName") or "?"),
                      "os": str(p.get("OS") or ""),
                      "online": bool(p.get("Online"))})
    out = {"installed": True,
           "state": str(d.get("BackendState") or "unknown"),
           "self": str(((d.get("Self") or {}).get("HostName")) or ""),
           "peers": peers}
    # Shields up — Tailscale's own "block incoming connections". The one
    # state where everything *looks* connected from both ends: the phone
    # lists this Mac, the Mac holds its mesh address, status says Running —
    # and every TCP attempt over the tailnet dies at this Mac's door. Read
    # from prefs, best-effort: the field is not in `status`, and a build
    # whose CLI will not answer `debug prefs` simply leaves the key out
    # rather than inventing an answer.
    try:
        pr = subprocess.run([ts, "debug", "prefs"], capture_output=True,
                            text=True, timeout=6)
        prefs = _json.loads(pr.stdout or "{}")
        if isinstance(prefs, dict) and "ShieldsUp" in prefs:
            out["shields_up"] = bool(prefs["ShieldsUp"])
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return out


def mesh_findings(ms: dict) -> list[dict]:
    """The mesh, as findings — worst first, empty when it is genuinely fine.

    Only ever *about* the mesh: a Mac with no Tailscale gets nothing here,
    because the LAN path is the primary one and a missing optional is not
    a fault. Everything else is the sentence that was missing when the
    green link did not work.
    """
    from core.preflight import _finding, NOTE, WARN
    if not ms.get("installed"):
        return []
    state = ms.get("state", "")
    if state == "unreadable":
        return [_finding(NOTE, "Tailscale is installed but would not say "
                               "how it is doing.",
                         "Open the Tailscale menu bar app and check it is "
                         "connected.")]
    if state == "NeedsLogin":
        return [_finding(WARN, "Tailscale is installed but this Mac is "
                               "logged out of it, so the mesh address "
                               "goes nowhere.",
                         "Open Tailscale and sign in; the address comes "
                         "back with it.")]
    if state != "Running":
        return [_finding(WARN, f"Tailscale is installed but not connected "
                               f"({state or 'stopped'}), so the mesh "
                               f"address goes nowhere.",
                         "Open the Tailscale menu bar app and switch it "
                         "on.")]
    if ms.get("shields_up"):
        return [_finding(WARN, "Tailscale on this Mac is set to block "
                               "incoming connections (shields up). The "
                               "phone can see this Mac and still nothing "
                               "gets in — every attempt over the mesh "
                               "dies at this door, looking exactly like "
                               "a lost connection.",
                         "Tailscale menu bar icon > untick “Block "
                         "incoming connections”. Nothing else needs "
                         "changing.")]
    phones = [p for p in ms.get("peers", [])
              if p["os"].lower() in ("ios", "android")]
    if not phones:
        return [_finding(WARN, "This Mac is on the tailnet, and no phone "
                               "is — the mesh link cannot work until the "
                               "phone joins.",
                         "Install the Tailscale app on the phone and sign "
                         "in with the same account. It appears here the "
                         "moment it joins.")]
    if not any(p["online"] for p in phones):
        names = ", ".join(p["name"] for p in phones[:3])
        return [_finding(WARN, f"The phone ({names}) is on the tailnet but "
                               f"offline right now — its Tailscale is "
                               f"switched off, and the mesh link will not "
                               f"work until it is on.",
                         "On the phone: open Tailscale and turn the "
                         "toggle on. The VPN icon in the status bar is "
                         "the tell.")]
    return []


def firewall() -> tuple[str, str]:
    """macOS blocks incoming connections per-binary, silently.

    Two things this used to get wrong, and both of them mattered on exactly
    the machine somebody is diagnosing.

    It asked whether the word "python" appeared anywhere in --listapps and
    called that "listed as allowed". socketfilterfw lists an app whether its
    verdict is Allow *or* Block, on the line after the path. So a Mac where
    somebody had clicked Deny on the "do you want python3 to accept incoming
    connections?" dialog — which macOS asks once and never asks again — was
    told python was allowed. That is the single most common way this fails
    and the doctor was pointing away from it.

    And it never asked about --getblockall. "Block all incoming connections"
    is a separate switch that overrides the per-app list entirely: every
    entry can say Allow and nothing gets in.
    """
    fw = "/usr/libexec/ApplicationFirewall/socketfilterfw"
    if not Path(fw).exists():
        return "not macOS", ""

    def ask(*args, timeout=15):
        try:
            return subprocess.run([fw, *args], capture_output=True, text=True,
                                  timeout=timeout).stdout
        except Exception:                                        # noqa: BLE001
            return ""

    state = ask("--getglobalstate", timeout=10).strip()
    if not state:
        return "could not ask", "socketfilterfw did not answer"
    if "disabled" in state.lower():
        return "off", "nothing blocked"

    # The override, before the list it overrides.
    if "enabled" in ask("--getblockall").lower():
        return "on", ("BLOCK ALL incoming is on — this blocks the phone "
                      "whatever the app list says. System Settings > Network "
                      "> Firewall > Options, turn off 'Block all incoming "
                      "connections'")

    verdict = _fw_verdict(ask("--listapps"))
    if verdict == "block":
        return "on", ("python is listed and BLOCKED — that is the Deny you "
                      "clicked once and macOS never asks again. This is very "
                      "likely your problem")
    if verdict == "allow":
        return "on", "python is listed as allowed"
    return "on", ("python is NOT listed — macOS will ask once and drop "
                  "everything until it does. This is very likely your problem")


def _fw_verdict(listing: str) -> str:
    """"allow", "block" or "" for a python entry in --listapps.

    The format puts the path and its verdict on separate lines:

        1 : /usr/bin/python3
             ( Allow incoming connections )

    so the verdict belongs to whichever path came last. Read as one blob and
    searched for the word "python", Allow and Block are the same answer.
    """
    seen = ""
    for line in (listing or "").splitlines():
        low = line.lower()
        if "python" in low and ("/" in line or ":" in line):
            seen = "pending"
        elif seen == "pending" and "incoming connections" in low:
            return "block" if "block" in low else "allow"
        elif seen == "pending" and line.strip() and ":" in line:
            seen = ""            # another app's entry before any verdict
    return "found" if seen else ""


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
                       f"Re-run setup: ./blokk, then Menu › Model."]
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


def sources_and_chat() -> list[str]:
    """Every wired source, and one real chat turn.

    Here because this is the command people run when something is not
    working, and until now it only looked at the network and the model
    server. The two questions it could not answer are the two people
    actually have: is it reading my mail, and does the chat box work.

    Returns what to do about whatever it found.
    """
    todo: list[str] = []
    try:
        from core.durable import Store
        from core import sources
        from core.connectors import wire
    except Exception as e:                                       # noqa: BLE001
        print(f"  {_c('could not load Blokk: ' + str(e)[:70], RED)}")
        return todo

    db = ROOT / "blokk.db"
    if not db.exists():
        print(f"\n  {_c('Is it reading your own data?', BOLD)}\n")
        row("database", _c("MISSING", RED), "run ./blokk once to create it")
        return ["Start Blokk once: ./blokk"]
    store = Store(db)

    print(f"\n  {_c('Is it reading your own data?', BOLD)}\n")
    wired = list(store.q("SELECT name, kind, keychain_ref FROM "
                         "credential ORDER BY id"))
    if not wired:
        row("sources", _c("none", AMBER),
            "everything is running on invented data")
        todo.append("Wire one real source — say \"what can I connect?\" in "
                    "the chat, or: python3 connect.py local")
    reg = wire(store)
    for c in wired:
        label, kind = c["name"] or c["kind"], c["kind"]
        conn = reg.get(label)
        if conn is None:
            row(label, _c("NOT WIRED", RED), "nothing built a reader for it")
            todo.append(f"{label}: added, but no reader — this is a bug, "
                        f"please say so")
            continue
        # Bounded, per source. One mail server that is not answering must not
        # be the reason a doctor never finishes.
        out: dict = {}

        def go(conn=conn, out=out):
            try:
                out["state"] = conn.check() if hasattr(conn, "check") else {"ok": True}
            except Exception as e:                               # noqa: BLE001
                out["err"] = f"{type(e).__name__}: {e}"

        t = threading.Thread(target=go, daemon=True)
        t.start()
        t.join(12)
        if t.is_alive():
            row(label, _c("no answer", AMBER), "still trying after 12s")
            todo.append(f"{label}: not answering — check it is reachable")
            continue
        if "err" in out:
            row(label, _c("CANNOT READ", RED), out["err"][:70])
            todo.append(f"{label}: {out['err'][:90]}")
            continue
        state = out.get("state") or {}
        ok = state.get("ok", True)
        # "reading" on the one connector that writes would be the wrong word
        # on the screen somebody opens to find out what Blokk is doing to
        # their machine.
        verb = ("sending" if kind == "smtp"
                else "writing" if kind in sources.WRITES
                else "reading")
        row(label, _c(verb, GREEN) if ok else _c("nothing there", AMBER),
            sources.describe(kind, state)[:70])
        if not ok:
            todo.append(f"{label}: {state.get('detail', 'nothing to read')[:90]}")

    # What the frozen examples said last time anyone looked. Not re-run
    # here: twenty-two calls to a 12B model is a minute of somebody's life
    # and this command should answer in seconds. The date is the point — a
    # baseline measured against weights you have since swapped is not a
    # baseline.
    try:
        rows = store.q("SELECT last_pass, last_run_at FROM regression")
        ran = [r for r in rows if r["last_run_at"]]
        if not rows:
            row("drafts", _c("no baseline", AMBER),
                "python3 regress.py seed")
            todo.append("Freeze a baseline so a model swap cannot quietly "
                        "make the drafts worse: python3 regress.py seed")
        elif not ran:
            row("drafts", _c("never measured", AMBER),
                f"{len(rows)} frozen — python3 regress.py")
            todo.append("Measure the frozen examples once: python3 regress.py")
        else:
            held = sum(1 for r in ran if r["last_pass"])
            when = (ran[0]["last_run_at"] or "")[:16].replace("T", " ")
            row("drafts", _c(f"{held}/{len(ran)} held", GREEN if held == len(ran)
                             else AMBER), f"last measured {when}")
            if held < len(ran):
                todo.append(f"{len(ran) - held} frozen example(s) stopped "
                            f"holding: python3 regress.py")
    except Exception as e:                                       # noqa: BLE001
        row("drafts", _c("unknown", AMBER), f"{type(e).__name__}: {e}"[:60])

    print(f"\n  {_c('Does the chat box work?', BOLD)}\n")
    try:
        from core import models
        from core.ask import ask as run_ask
        m = models._from_env().small
        said, tools, degraded = [], 0, ""
        for ev in run_ask(store, "what needs me?", m):
            if ev["type"] == "TEXT_MESSAGE_CONTENT":
                said.append(ev["delta"])
            elif ev["type"] == "TOOL_CALL_END":
                tools += 1
            elif ev["type"] == "DEGRADED":
                degraded = ev["detail"]
        text = "".join(said).strip()
        if not text:
            row("chat", _c("SAYS NOTHING", RED), "a turn produced no answer")
            todo.append("The chat answered with nothing. That is a bug — "
                        "python3 connect.py ask \"hi\" prints every step.")
        else:
            row("chat", _c("answering", GREEN),
                f"{tools} read{'' if tools == 1 else 's'}, "
                f"{len(text)} characters")
            print(f"    {_c(text[:96], DIM)}")
        if degraded:
            row("", _c("degraded", AMBER), degraded[:70])
    except Exception as e:                                       # noqa: BLE001
        row("chat", _c("RAISED", RED), f"{type(e).__name__}: {e}"[:70])
        todo.append(f"The chat raised {type(e).__name__}: {str(e)[:80]}")

    # ── what the week cost ───────────────────────────────────────────────
    # The journal answers "what happened in this run". This answers "what is
    # this costing me", which nobody could ask: the span table had been in
    # the schema with nothing writing to it, so the only way to know how
    # much of the night went to the model was to count journal rows by hand.
    print(f"\n  {_c('What the last week cost', BOLD)}\n")
    try:
        from core.durable import Engine
        sp = Engine(store).spend(days=7)
        if not sp["by_op"]:
            row("spend", _c("nothing recorded", AMBER),
                "no runs in the last 7 days")
        else:
            for part in sp["by_op"]:
                row(part["op"].replace("_", " "),
                    f"{part['tokens']:,} tokens",
                    f"{part['steps']} step(s), {part['ms'] / 1000:.1f}s")
            bad = sp["runs_bad"]
            row("runs", f"{sp['runs']}",
                _c(f"{bad} did not finish", AMBER) if bad
                else "all finished")
            if bad:
                todo.append(f"{bad} run(s) in the last week did not finish — "
                            f"./blokk doctor again after the next sweep, or "
                            f"look at logs/")
    except Exception as e:                                       # noqa: BLE001
        row("spend", _c("unreadable", AMBER), f"{type(e).__name__}: {e}"[:60])
    return todo


def _https_tries() -> dict:
    """How many times a browser tried HTTPS on the plain-HTTP port.

    Written by api/server.py when it turns a TLS ClientHello away. The
    doctor is a separate process and cannot ask the server anything, so
    the count goes through a file. Missing or unreadable means none —
    a diagnostic that raises about its own diagnostics is worse than one
    that says nothing.
    """
    import json
    try:
        d = json.loads((ROOT / "logs" / "https-on-http.json").read_text())
        return {"n": int(d.get("n", 0)), "last": float(d.get("last", 0.0))}
    except (OSError, ValueError, TypeError):
        return {"n": 0, "last": 0.0}


def _ago(ts: float) -> str:
    """"4 minutes ago", not an epoch. Nobody reads an epoch at 23:53."""
    import time
    if not ts:
        return "at some point"
    secs = max(0, int(time.time() - ts))
    for size, name in ((86400, "day"), (3600, "hour"), (60, "minute")):
        if secs >= size:
            n = secs // size
            return f"{n} {name}{'s' if n > 1 else ''} ago"
    return "just now"


def main(argv=None) -> int:
    # An explicit argv, defaulting to the process's. Three probes call this
    # in-process under the suite's single-probe filter, where sys.argv[1]
    # is a probe name — int("A107") took the doctor down before its first
    # line of output, which made every probe built on it unrunnable alone
    # and its gate entries vacuous. A main() that reads global argv is a
    # main() only a process can call.
    args = sys.argv[1:] if argv is None else list(argv)
    port = int(args[0]) if args else 8080
    print(f"\n  {_c('Can your phone reach this Mac?', BOLD)}\n")

    up = listening(port)
    row("control plane", _c("running", GREEN) if up else _c("NOT RUNNING", RED),
        f"port {port}" if up else "start it with ./blokk")

    found = phone_addresses(port)
    if not found:
        row("this mac", _c("no network", RED), "no non-loopback address")
    for i, r in enumerate(found):
        label = "this mac" if i == 0 else ""
        state = (_c("try this", GREEN) if r["usable"]
                 else _c(r["kind"], AMBER))
        row(label, f"{r['ip']:<16}{state}", f"{r['interface']}  — {r['why']}")

    state, note = firewall()
    colour = RED if "NOT listed" in note else (GREEN if state == "off" else AMBER)
    row("firewall", _c(state, colour), note)

    good = [r for r in found if r["usable"]] if up else []
    print()
    if not up:
        print(f"  {_c('Blokk is not running.', RED)} Start it: ./blokk")
    elif not good:
        print(f"  {_c('Running, but no address here is one a phone could use.', RED)}")
        print(f"  {_c('Everything above is a VPN tunnel, a virtual network or an', DIM)}")
        print(f"  {_c('interface with nothing behind it. Join wifi, or turn a VPN off.', DIM)}")
    else:
        # The whole address, port and token included. Every part of it is
        # load-bearing and the two people leave out — the :port and the ?t= —
        # are exactly the two that turn this into "it will not connect".
        # Typed without the port it goes to :80, where nothing is listening,
        # and Safari says "the network connection was lost", which names
        # neither the port nor anything else you could act on.
        #
        # The token is read off the file rather than imported from
        # api.server: importing that module opens the database and would
        # take the doctor down with it on exactly the machine the doctor
        # exists to diagnose.
        token = os.environ.get("BLOKK_TOKEN") or ""
        tf = ROOT / ".blokk-token"
        if not token and tf.exists():
            token = tf.read_text().strip()
        ip = good[0]["ip"]
        url = f"http://{ip}:{port}/?t={token}"
        # Bonjour lowercases the name and drops the domain; a Mac called
        # "George's MacBook Pro" is georges-macbook-pro.local, which
        # gethostname() already returns in that form.
        try:
            host = socket.gethostname().split(".")[0].lower()
        except Exception:                                        # noqa: BLE001
            host = ""
        print(f"  {_c('Open this on the phone, exactly as it is:', BOLD)}")
        print(f"      {_c(url, GREEN)}")
        print(f"  {_c(f'The :{port} matters. Typing {ip} on its own goes to port', DIM)}")
        print(f"  {_c('80, where nothing is listening, and Safari calls that', DIM)}")
        lost = "the network connection was lost"
        print(f"  {_c(chr(8220) + lost + chr(8221) + '.', DIM)}")
        print(f"  {_c('The http:// matters as much. Without it Safari upgrades', DIM)}")
        print(f"  {_c('the address and tries HTTPS, which this does not speak —', DIM)}")
        print(f"  {_c('and reports that with the same sentence. Scan the QR and', DIM)}")
        print(f"  {_c('none of this comes up.', DIM)}")

        # A mesh address is a different capability, not a spare copy of the
        # same one, so it gets its own line rather than a place in the
        # ranked list nobody reads past the first row of. It works from
        # anywhere, and it is the way around every cause on the list at
        # once — the router never carries it and iOS's Local Network
        # permission does not apply to it, because it is not the local
        # network.
        mesh = next((r for r in good if r["kind"] == "tailnet"
                     and r["ip"] != ip), None)
        if mesh:
            print()
            print(f"  {_c('And from anywhere, through your Tailscale:', BOLD)}")
            murl = f"http://{mesh['ip']}:{port}/?t={token}"
            print(f"      {_c(murl, GREEN)}")
            print(f"  {_c('Same Blokk, over the mesh — it also works at home, and', DIM)}")
            print(f"  {_c('it does not need the Local Network permission at all.', DIM)}")
        # And what Tailscale itself says — the diagnosis behind a mesh link
        # that does not work. Asked whether or not the address showed up,
        # because "logged out" is exactly the case where it does not.
        from core import preflight as _pf
        for line in _pf.render(mesh_findings(mesh_status()),
                               colour=sys.stdout.isatty()):
            print(line)

        # Has anything ever actually got here. This is the half of the
        # question no check on this side can measure — a probe from this Mac
        # to itself proves nothing about a phone — so it is read from what
        # the running server recorded. "The phone cannot reach this Mac" and
        # "nobody has opened it on a phone yet" look identical from here,
        # and the difference is the whole diagnosis.
        from core import preflight
        for line in preflight.render(preflight.arrivals(port),
                                     colour=sys.stdout.isatty()):
            print(line)

        # And whether it has actually happened, which is the difference
        # between a warning and a diagnosis. The server writes the count
        # because this runs as its own process and cannot ask it.
        tries = _https_tries()
        if tries["n"]:
            when, n = _ago(tries["last"]), tries["n"]
            print()
            print(f"  {_c('This has already happened:', AMBER)} something spoke "
                  f"HTTPS to")
            line = f"port {port} {n} time(s), last {when}. That is a browser"
            print(f"  {_c(line, DIM)}")
            print(f"  {_c('given the address without the http:// in front.', DIM)}")
        # Only on a terminal, and only if it fits: a QR wider than the
        # window wraps into noise no camera can read. A40 opens a pty
        # because every harness here redirects stdout.
        try:
            from core import qr
            import shutil
            if sys.stdout.isatty() and qr.width(url) <= shutil.get_terminal_size(
                    (80, 24)).columns - 6:
                print()
                for line in qr.render(url).splitlines():
                    print("      " + line)
        except Exception:                                        # noqa: BLE001
            pass
        if len(good) > 1:
            print()
            print(f"  {_c('If that one does nothing, this Mac is also on:', DIM)}")
            spare = f"http://{good[1]['ip']}:{port}/?t={token}"
            print(f"      {_c(spare, DIM)}")
        # The shared translation, which knows all three verdicts. This
        # block tested "NOT listed" only — the same gap the banner had, in
        # a second place, which is what four copies of one sentence buys
        # you. A Mac where somebody had clicked Deny got the link printed
        # in green with nothing to say the firewall would drop it.
        from core import preflight as _pre
        _fw = _pre.firewall_finding(note)
        if _fw:
            print()
            for line in _pre.render([_fw], colour=sys.stdout.isatty()):
                print(line)
        print()
        # This used to end with "check iCloud Private Relay is off", which
        # is folklore and costs somebody a privacy feature to no purpose.
        # Apple routes local-network connections around Private Relay —
        # WWDC21's own words are that connections over the local network
        # are unaffected by it — and there is no name in the numeric link
        # for it to resolve either. Its one real involvement in any of this
        # was that it puts a utun interface on the Mac, which is what the
        # old lan_ip() picked and printed, and phone_addresses now ranks
        # last. What is left is the network between the two devices.
        print(f"  {_c('If that link still fails it is the network between them,', DIM)}")
        print(f"  {_c('not a setting on the phone:', DIM)}")
        # One list, shared with ./blokk listen and the start-up banner.
        # This was a copy of the same three causes in the same order, and
        # keeping four copies in step by hand is how the banner came to
        # know one firewall verdict of the three.
        from core import preflight
        # shown=True: the verdict is already printed above, under the link,
        # because a blocked firewall is not a "if that still fails".
        for line in preflight.render(
                preflight.why_not_reaching(note, shown=bool(_fw)),
                colour=sys.stdout.isatty()):
            print(line)
        print()
        print(f"  {_c('iCloud Private Relay can stay on. It does not carry local', DIM)}")
        print(f"  {_c('network traffic and there is no name in that link to look up.', DIM)}")
        if host:
            print(f"  {_c('The one link it can cost you is the name: ', DIM)}"
                  f"{_c('http://' + host + f'.local:{port}/', DIM)}")
            print(f"  {_c('needs a lookup, and the numbers never do. If the name fails', DIM)}")
            print(f"  {_c('and the numbers work, that is the difference — use the numbers.', DIM)}")

    # Asked whatever the network said. The two faults are independent, and
    # answering only the first sends you back to run this twice.
    try:
        todo = models()
    except Exception as e:                                       # noqa: BLE001
        print(f"  {_c('could not check the model server: ' + str(e)[:60], AMBER)}")
        todo = []
    # Whatever the network and the model said. Somebody whose phone cannot
    # reach the Mac still wants to know whether their mail is being read.
    try:
        todo += sources_and_chat()
    except Exception as e:                                       # noqa: BLE001
        print(f"  {_c('could not check your sources: ' + str(e)[:60], AMBER)}")

    # One list, at the end, after everything has been asked. Printing the
    # model's half before running the source checks meant the source checks'
    # own answers were collected and never shown.
    if todo:
        print(f"\n  {_c('What to do about it:', BOLD)}")
        for item in todo:
            print(f"    • {item}")
    print()

    if not up or not good:
        return 1
    # Non-zero when anything above needs doing, including a model fault. A
    # doctor that exits 0 while printing "llama-server is not installed" is
    # the silent failure this whole file exists to stop.
    return 1 if todo else 0


if __name__ == "__main__":
    if __package__ in (None, ""):
        sys.path.insert(0, str(ROOT))
    raise SystemExit(main())
