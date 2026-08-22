"""
Model server lifecycle.

Lifted out of run.sh so the setup GUI and the shell script drive the same
code. Two implementations of "start the model server" would drift within a
week, and the one you were not looking at would be the broken one.

Nothing here knows what a model is. It starts a process, waits for it to
answer, and streams its output — because the honest progress indicator for a
20GB download is the downloader's own log, not a bar we invent.
"""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
import queue
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Tier:
    name: str                 # SMALL | LARGE
    backend: str              # llama.cpp | mlx
    alias: str
    port: int
    repo: str | None = None   # HuggingFace repo to download from
    path: str | None = None   # a .gguf already on disk; wins over repo
    file: str | None = None   # GGUF filename; MLX repos have none
    slots: int = 4
    ctx: int = 32768

    def command(self) -> list[str]:
        if self.backend == "llama.cpp":
            # -cb continuous batching, -np slots, -fa flash attention.
            # Each slot carries its own KV cache, so -np scales memory
            # linearly — raise it only when bench.py says the cache can take it.
            # -m reads weights you already have; -hf downloads and caches
            # them. Anything in models/ is there because someone put it
            # there, so it wins over fetching five gigabytes again.
            src = ["-m", self.path] if self.path else \
                  ["-hf", f"{self.repo}:{self.file}"]
            return ["llama-server", *src,
                    "--alias", self.alias, "--port", str(self.port),
                    "-cb", "-np", str(self.slots), "-c", str(self.ctx), "-fa"]
        if self.backend == "mlx":
            return ["mlx_lm.server", "--model", self.repo,
                    "--port", str(self.port), "--max-tokens", "2048"]
        raise ValueError(f"unknown backend {self.backend}")

    @property
    def binary(self) -> str:
        return self.command()[0]


def installed(backend: str) -> bool:
    return shutil.which(
        {"llama.cpp": "llama-server", "mlx": "mlx_lm.server"}[backend]) is not None


def alive(port: int, timeout: float = 1.0) -> bool:
    """A server is up when it can list models.

    llama-server also has /health; mlx_lm.server does not, so /v1/models is
    the check that works for both.
    """
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/models", timeout=timeout)
        return True
    except Exception:                                            # noqa: BLE001
        return False


@dataclass
class Supervisor:
    """Owns the model server processes. One per Blokk instance."""

    procs: dict[str, subprocess.Popen] = field(default_factory=dict)
    logs: dict[str, list[str]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def start(self, tier: Tier):
        """Start a tier, yielding its output line by line until it answers.

        Yields dicts rather than returning, because the first start downloads
        weights and the only truthful progress report is the downloader's own.
        """
        if alive(tier.port):
            yield {"type": "READY", "tier": tier.name, "port": tier.port,
                   "note": "already up"}
            return
        if not installed(tier.backend):
            yield {"type": "ERROR", "tier": tier.name,
                   "message": f"{tier.binary} is not installed"}
            return

        env = dict(os.environ, PYTHONUNBUFFERED="1")
        proc = subprocess.Popen(tier.command(), stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True,
                                bufsize=1, env=env)
        with self._lock:
            self.procs[tier.name] = proc
            self.logs[tier.name] = []

        yield {"type": "STARTED", "tier": tier.name,
               "command": " ".join(tier.command())}

        # Output is drained on its own thread. readline() blocks, and a quiet
        # server — which llama-server with --log-disable very much is — would
        # otherwise never let the loop reach the health check. It would start
        # fine and appear to hang forever.
        q: queue.Queue = queue.Queue()

        def drain():
            try:
                for ln in proc.stdout:                           # type: ignore[union-attr]
                    q.put(ln.rstrip())
            except Exception:                                    # noqa: BLE001
                pass
            finally:
                q.put(None)

        threading.Thread(target=drain, daemon=True).start()

        deadline = time.time() + 1800          # a cold 20GB pull is not quick
        last_poll = 0.0
        while time.time() < deadline:
            try:
                line = q.get(timeout=0.4)
                if line is not None:
                    with self._lock:
                        self.logs[tier.name].append(line)
                        self.logs[tier.name] = self.logs[tier.name][-400:]
                    yield {"type": "LOG", "tier": tier.name, "line": line}
            except queue.Empty:
                pass

            now_t = time.time()
            if now_t - last_poll >= 1.0:
                last_poll = now_t
                if alive(tier.port, timeout=0.5):
                    yield {"type": "READY", "tier": tier.name, "port": tier.port}
                    return
                if proc.poll() is not None:
                    tail = "\n".join(self.logs[tier.name][-6:])
                    yield {"type": "ERROR", "tier": tier.name,
                           "message": f"exited with code {proc.returncode}",
                           "log": tail}
                    return

        yield {"type": "ERROR", "tier": tier.name,
               "message": "did not answer within 30 minutes"}

    def stop_all(self) -> int:
        with self._lock:
            n = 0
            for name, p in list(self.procs.items()):
                if p.poll() is None:
                    p.send_signal(signal.SIGTERM)
                    n += 1
                self.procs.pop(name, None)
            return n

    def status(self, tiers: list[Tier]) -> list[dict]:
        return [{"tier": t.name, "backend": t.backend, "model": t.alias,
                 "port": t.port, "up": alive(t.port),
                 "managed": t.name in self.procs
                 and self.procs[t.name].poll() is None}
                for t in tiers]


SUPERVISOR = Supervisor()


# ---------------------------------------------------------------- config i/o
CONF = ROOT / "blokk.conf"


def read_conf() -> dict:
    if not CONF.exists():
        return {}
    out = {}
    for line in CONF.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def configured() -> bool:
    return read_conf().get("MODE") in ("stubs", "servers", "llamacpp")


def tiers_from_conf() -> list[Tier]:
    c = read_conf()
    out = []
    for name in ("SMALL", "LARGE"):
        if not c.get(f"{name}_BACKEND"):
            continue
        out.append(Tier(
            # REPO is absent when PATH is set, and vice versa; neither may
            # be required, or a local-weights config raises KeyError here and
            # run.sh starts nothing.
            name=name, backend=c[f"{name}_BACKEND"],
            repo=c.get(f"{name}_REPO"), path=c.get(f"{name}_PATH"),
            file=c.get(f"{name}_FILE"), alias=c[f"{name}_ALIAS"],
            port=int(c[f"{name}_PORT"]), slots=int(c.get("SLOTS", 4)),
            ctx=int(c.get("CTX", 32768))))
    # One server serving both tiers is the common case, not a special one.
    if len(out) == 2 and out[0].port == out[1].port:
        out = out[:1]
    return out


def write_conf(mode: str, tiers: list[dict], slots: int, ctx: int) -> str:
    lines = [f"# Written by the setup wizard on {time.strftime('%Y-%m-%d')}.",
             "# Edit freely; run.sh and the GUI both read it.",
             f"MODE={mode}", f"SLOTS={slots}", f"CTX={ctx}", ""]
    for t in tiers:
        lines.append(f"# {t['tier']} — {t.get('why','')}")
        lines.append(f"{t['tier']}_BACKEND={t['backend']}")
        lines.append(f"{t['tier']}_REPO={t['repo']}")
        if t.get("file") and t["file"] != "-":
            lines.append(f"{t['tier']}_FILE={t['file']}")
        lines.append(f"{t['tier']}_ALIAS={t['alias']}")
        lines.append(f"{t['tier']}_PORT={t['port']}")
        lines.append("")
    small = next((t for t in tiers if t["tier"] == "SMALL"), None)
    large = next((t for t in tiers if t["tier"] == "LARGE"), small)
    if small:
        lines += [f"BLOKK_SMALL_URL=http://127.0.0.1:{small['port']}/v1",
                  f"BLOKK_SMALL_MODEL={small['alias']}",
                  f"BLOKK_LARGE_URL=http://127.0.0.1:{large['port']}/v1",
                  f"BLOKK_LARGE_MODEL={large['alias']}"]
    CONF.write_text("\n".join(lines) + "\n")
    return CONF.read_text()


def install(backend: str):
    """Stream an installer. brew and pip both take a while and both fail in
    ways worth reading, so the output goes to the browser rather than /dev/null."""
    cmd = {"llama.cpp": ["brew", "install", "llama.cpp"],
           "mlx": ["python3", "-m", "pip", "install", "mlx-lm"]}[backend]
    if backend == "llama.cpp" and shutil.which("brew") is None:
        yield {"type": "ERROR",
               "message": "Homebrew is not installed. See https://brew.sh, "
                          "or pick MLX for both tiers instead."}
        return
    yield {"type": "STARTED", "command": " ".join(cmd)}
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, bufsize=1)
    for line in p.stdout:                                        # type: ignore[union-attr]
        yield {"type": "LOG", "line": line.rstrip()}
    p.wait()
    if p.returncode == 0:
        yield {"type": "READY", "backend": backend}
    else:
        yield {"type": "ERROR", "message": f"installer exited {p.returncode}"}
