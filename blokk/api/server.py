"""
Control plane. Standard library only — no pip install, nothing to break.

Holds every credential. The agents hold none; they ask this layer to act and
it checks policy first. The phone talks only to this, and it is a view rather
than a brain: lose the phone and you lose a screen.

    python3 -m api.server            → http://0.0.0.0:8080
"""
from __future__ import annotations

import errno
import json
import mimetypes
import re
import socket
import shutil
import signal
import sqlite3
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from core.durable import Engine, Store, now
from core.harness import Policy, consolidate, forget
from core.models import router, status as model_status
from core.ask import ask as run_ask
from core import servers as srv
from core.backends import BACKENDS, pick

import os
import secrets

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DB = ROOT / "blokk.db"

store = Store(DB)
engine = Engine(store)
policy = Policy(store)

# ── access ──────────────────────────────────────────────────────────────────
# The server binds 0.0.0.0 so the phone can reach it, which means everyone
# else on the wifi can too. Loopback is trusted (you are sitting at the Mac);
# everything else needs the token. Persisted so the phone's saved URL keeps
# working across restarts.
# Where update.sh looks to find a running control plane.
SERVING_PORT = {"n": 8080}   # set by serve(); h_phone builds the link
PIDFILE = ROOT / ".blokk.pid"

TOKEN_FILE = ROOT / ".blokk-token"
TOKEN = os.environ.get("BLOKK_TOKEN") or (
    TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None)
if not TOKEN:
    TOKEN = secrets.token_urlsafe(12)
    TOKEN_FILE.write_text(TOKEN)
    TOKEN_FILE.chmod(0o600)

# Origins allowed to read this API from a page they serve. Empty by default,
# and that default is load-bearing: loopback is trusted without a token
# because "you are sitting at the Mac", but a browser tab is also sitting at
# the Mac. With Access-Control-Allow-Origin: * every website you happen to
# have open could read the queue — guest names, message bodies, the journal —
# and POST decisions, because the preflight was allowed too. The dashboard is
# served by this process, so it is same-origin and needs no CORS at all.
#
# Set BLOKK_ALLOWED_ORIGINS to a comma-separated list only if you deliberately
# host the UI somewhere else, e.g. https://example.com. That page's JavaScript
# then handles your private data, so trust it as you would this file.
ALLOWED_ORIGINS = {o.strip() for o in
                   os.environ.get("BLOKK_ALLOWED_ORIGINS", "").split(",") if o.strip()}

BOLD, DIM, OFF = "\033[1m", "\033[2m", "\033[0m"
GREEN, AMBER, RED = "\033[32m", "\033[33m", "\033[31m"

MAX_BODY = 256 * 1024      # A3: rfile.read(Content-Length) allocates whatever
                           # it is told to. 256KB is generous for JSON.

from core import qr  # noqa: E402
from flows.morning_sweep import register  # noqa: E402
register(engine, store)

# Bumped on every mutation. The phone and the Mac both poll it, so approving
# on one shows up on the other without either holding a socket open.
VERSION = {"n": 0}
LOCK = threading.Lock()


def bump():
    with LOCK:
        VERSION["n"] += 1


def rows(rs):
    return [dict(r) for r in rs]


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


# ═══════════════════════════════════════════════════════════════════ handlers
def h_health(_q):
    open_appr = store.one("SELECT COUNT(*) c FROM approval WHERE decision IS NULL")["c"]
    return {
        "ok": True,
        "at": now().isoformat(),
        "version": VERSION["n"],
        "running": store.one("SELECT COUNT(*) c FROM run WHERE status='running'")["c"],
        "suspended": store.one("SELECT COUNT(*) c FROM waiting")["c"],
        "approvals_open": open_appr,
        "attention_budget": {"used": open_appr, "limit": 8},
        "handled": store.one("SELECT COUNT(*) c FROM journal WHERE side_effect=1")["c"],
        "spend": rows(store.q("SELECT * FROM budget WHERE day=?",
                              now().date().isoformat())),
    }


def h_workspaces(_q):
    out = []
    for w in store.q("SELECT * FROM workspace ORDER BY name"):
        t = rows(store.q("SELECT * FROM trust WHERE workspace_id=?", w["id"]))
        out.append({**dict(w), "egress_allow": json.loads(w["egress_allow"]),
                    "trust": t, "auto_categories": sum(1 for x in t if x["auto"])})
    return out


def h_runs(q):
    sql, args = "SELECT * FROM run WHERE 1=1", []
    if q.get("workspace"):
        sql += " AND workspace_id=?"
        args.append(q["workspace"][0])
    sql += " ORDER BY started_at DESC LIMIT 30"
    return [{**dict(r), **engine.stats(r["id"])} for r in store.q(sql, *args)]


def h_run(run_id, _q):
    r = store.one("SELECT * FROM run WHERE id=?", run_id)
    if not r:
        return {"error": "no such run"}, 404
    return {**dict(r),
            "journal": rows(store.q(
                "SELECT step,kind,name,side_effect,idem_key,tokens_in,tokens_out,ms "
                "FROM journal WHERE run_id=? ORDER BY step", run_id)),
            "waiting": dict(store.one("SELECT * FROM waiting WHERE run_id=?", run_id) or {}),
            "stats": engine.stats(run_id)}


def _ev(a) -> dict:
    """Evidence, defensively. A row written by an older build — or corrupted —
    should cost you that row, not the entire queue."""
    try:
        v = json.loads(a["evidence"] or "{}")
        return v if isinstance(v, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {"unreadable": True}


def _stale(a) -> bool:
    """Time-of-check vs time-of-use. A quote true at 04:00 may be sold by 09:00."""
    ev = _ev(a)
    if not a["revalidate"] or not ev.get("checked_at"):
        return False
    return ev["checked_at"] < now().isoformat()[:13]


def h_approvals(_q):
    out = []
    for a in store.q(
        "SELECT a.*, w.name AS workspace FROM approval a "
        "JOIN workspace w ON w.id=a.workspace_id "
        "WHERE a.decision IS NULL ORDER BY a.created_at"
    ):
        d = dict(a)
        d["evidence"] = _ev(a)
        d["stale"] = _stale(a)
        pin = store.one(
            "SELECT pinned_manual FROM trust WHERE workspace_id=? AND category=?",
            a["workspace_id"], a["category"])
        d["pinned"] = bool(pin["pinned_manual"]) if pin else False
        out.append(d)
    return out


def h_handled(_q):
    """What didn't need you. The number that should grow."""
    return rows(store.q(
        "SELECT a.category, a.title, a.body, w.name AS workspace, w.id AS ws, "
        "a.decision, a.decided_at FROM approval a "
        "JOIN workspace w ON w.id=a.workspace_id "
        "WHERE a.decision IS NOT NULL ORDER BY a.decided_at DESC LIMIT 20"))


def h_decide(approval_id, body):
    a = store.one("SELECT * FROM approval WHERE id=?", approval_id)
    if not a:
        return {"error": "no such approval"}, 404
    if a["decision"]:
        return {"ok": True, "already": a["decision"]}      # taps get retried

    if body.get("decision") == "approve" and _stale(a):
        return {"ok": False, "blocked": "stale",
                "detail": "Facts changed since drafting. Re-checked at send, not at draft."}

    # Claim the approval in one statement. The check above is a fast path for
    # the common retry, not the guard: this is a threading server, so six taps
    # on a flaky phone connection all read decision IS NULL and all get here.
    # Deciding twice would call policy.record twice, and trust.clean moving by
    # six is autonomy granted by a race — exactly what the trust gate exists to
    # stop. Only the thread whose UPDATE matched a row may record.
    claimed = store.x(
        "UPDATE approval SET decision=?, edited_body=?, decided_at=? "
        "WHERE id=? AND decision IS NULL",
        body["decision"], body.get("edited_body"), now().isoformat(), approval_id)
    if not claimed:
        loser = store.one("SELECT decision FROM approval WHERE id=?", approval_id)
        return {"ok": True, "already": loser["decision"]}
    policy.record(a["workspace_id"], a["category"], body["decision"])

    # An edit is a diff between what the agent wrote and what you wanted.
    if body["decision"] in ("edit", "reject"):
        store.x("""INSERT OR REPLACE INTO episode
                   (id,workspace_id,kind,category,before,after)
                   VALUES(?,?,?,?,?,?)""",
                f"e_{approval_id}", a["workspace_id"], body["decision"],
                a["category"], a["body"], body.get("edited_body"))

    still = store.one(
        "SELECT COUNT(*) c FROM approval WHERE run_id=? AND decision IS NULL",
        a["run_id"])["c"]
    resumed = False
    if still == 0:
        try:
            engine.signal(a["run_id"], "approval", {"decision": body["decision"]})
            resumed = True
        except (ValueError, KeyError):
            pass                                   # already resumed, fine

    ok, why = policy.may_act(a["workspace_id"], a["category"])
    bump()
    return {"ok": True, "category": a["category"], "now_autonomous": ok,
            "trust": why, "run_resumed": resumed}


def h_recheck(approval_id, _body):
    """Re-run the evidence check on a stale approval.

    Before this, a quote that went stale could only be rejected — there was no
    way to say "check again, it may still be fine". A dead end in the one
    place the system is meant to be careful is a good way to teach someone to
    stop reading the queue.
    """
    a = store.one("SELECT * FROM approval WHERE id=?", approval_id)
    if not a:
        return {"error": "no such approval"}, 404
    if a["decision"]:
        return {"ok": False, "detail": "already decided"}
    ev = _ev(a)
    ev["checked_at"] = now().isoformat()[:13]
    ev["rechecked"] = True
    store.x("UPDATE approval SET evidence=? WHERE id=?", json.dumps(ev), approval_id)
    bump()
    # A real deployment re-runs the named check here (a["revalidate"]) against
    # live data. The stub confirms, because the fake world has not moved.
    return {"ok": True, "still_valid": True, "checked_at": ev["checked_at"]}


def h_memory(ws, _q):
    return {
        "episodes": store.one("SELECT COUNT(*) c FROM episode WHERE workspace_id=?", ws)["c"],
        "unconsolidated": store.one(
            "SELECT COUNT(*) c FROM episode WHERE workspace_id=? AND consolidated=0", ws)["c"],
        "facts": rows(store.q(
            "SELECT id,text,confidence,source_episodes FROM fact "
            "WHERE workspace_id=? AND retired_at IS NULL ORDER BY confidence DESC", ws)),
        "skills": rows(store.q(
            "SELECT name,description,runs,failures,status FROM skill "
            "WHERE workspace_id IS NULL OR workspace_id=? ORDER BY runs DESC", ws)),
    }


def h_sweep(body):
    """Idempotent per workspace per day.

    Without this, the Mac and the phone both pressing sweep at 04:00 starts
    two runs per workspace and every guest gets two replies. A sweep is a
    daily event, so the day is the key. force=true is the manual override.
    """
    day = now().date().isoformat()
    started, skipped, failed = [], [], []
    for w in store.q("SELECT id FROM workspace WHERE active=1"):
        existing = store.one(
            "SELECT id FROM run WHERE workspace_id=? AND workflow='morning_sweep' "
            "AND date(started_at)=? AND status IN ('running','suspended','done')",
            w["id"], day)
        if existing and not body.get("force"):
            skipped.append(existing["id"])
            continue
        try:
            started.append(engine.start("morning_sweep", w["id"]))
        except Exception as e:                                   # noqa: BLE001
            # The run is already marked failed and journalled, so it is
            # resumable once whatever broke is fixed. Losing three good
            # workspaces because the fourth could not reach the model server
            # is the wrong trade.
            failed.append({"workspace": w["id"], "error": str(e)[:200]})
    bump()
    out = {"started": started, "already_swept_today": skipped}
    if failed:
        out["failed"] = failed
    return out


def h_reset(_body):
    """Wipe runs and approvals, keep what was learned.

    Deliberate: the point of a prototype is running the sweep twenty times,
    and trust and facts should survive that or you can never watch them move.

    Episodes survive too, and outlive the approvals they came from. That is
    intended, not an oversight — an episode stores the before and after text
    inline, so it is self-contained. The correction is the thing worth keeping;
    the row that prompted it is not.
    """
    for t in ("journal", "waiting", "approval", "run", "span", "budget"):
        store.x(f"DELETE FROM {t}")
    bump()
    return {"reset": True, "kept": ["trust", "fact", "skill", "episode"]}


def h_kill(_body):
    n = store.one("SELECT COUNT(*) c FROM run WHERE status='running'")["c"]
    store.x("UPDATE run SET status='killed', ended_at=? WHERE status='running'",
            now().isoformat())
    bump()
    return {"stopped": n, "queue_held": True}


def _ask_stream(q, workspace):
    """Wraps the ask generator so a PROPOSAL lands in the approval queue.

    This is the only place the chat surface touches the database, and it
    writes exactly one kind of row: an undecided approval. It cannot send, and
    it cannot mark anything decided.
    """
    ws = workspace or "cottages"
    run_id = None
    for ev in run_ask(store, q, router.small, workspace):
        if ev["type"] == "PROPOSAL":
            # A chat turn is a run. Giving it a real row keeps the foreign key
            # honest and means a proposal can be traced back like any other
            # queued item, rather than appearing from nowhere.
            if run_id is None:
                run_id = f"r_ask{abs(hash(q)) % 10**8}"
                store.x("""INSERT OR REPLACE INTO run
                           (id,workspace_id,workflow,status,input,ended_at)
                           VALUES(?,?,'ask','done',?,?)""",
                        run_id, ws, json.dumps({"q": q}), now().isoformat())
            aid = f"a_ask_{abs(hash(ev['text'])) % 10**8}"
            store.x("""INSERT OR REPLACE INTO approval
                       (id,run_id,workspace_id,category,title,body,evidence)
                       VALUES(?,?,?,?,?,?,?)""",
                    aid, run_id, ws, "asked_for",
                    "You asked for this in chat", ev["text"],
                    json.dumps({"sources": ["you"], "via": "ask"}))
            bump()
            ev = {**ev, "approval_id": aid}
        yield ev


# ═══════════════════════════════════════════════════════════════════ setup
# The wizard runs before there is a config, so these must work with nothing
# on disk. They are the only endpoints that do.

_KV_CACHE: dict = {}      # (path, size, mtime) -> MB per token


def _local_models(ram_gb: float) -> list[dict]:
    """Whatever is sitting in models/, sized against this machine.

    The terminal setup has offered these since they were addable; the wizard
    did not, so a file you had already downloaded was invisible in the GUI and
    the only route was to download another copy.
    """
    import bench
    out = []
    for f in sorted((ROOT / "models").glob("*.gguf"))[:40]:
        try:
            st = f.stat()
        except OSError:
            continue                  # vanished, or a link to nothing
        gb = st.st_size / (1024 ** 3)
        # The file states its own geometry. Fall back to 0.55 GB per billion
        # parameters only when the header cannot be read — that guess is what
        # made a mixture-of-experts look like a dense model twice its size.
        from core import gguf
        # Cached on size and mtime. This endpoint is fetched every time the
        # wizard opens, and re-reading every header each time is unbounded
        # work inside a request handler — the page has nothing to show until
        # it finishes.
        ck = (str(f), st.st_size, int(st.st_mtime))
        if ck in _KV_CACHE:
            kv_mb = _KV_CACHE[ck]
        else:
            try:
                kv_mb = gguf.kv_mb_per_token(f)
            except Exception:
                kv_mb = None          # fall back to guessing from the size
            _KV_CACHE[ck] = kv_mb
        slots, ctx_k = bench.fit(max(0.5, gb / 0.55), gb, ram_gb, kv_mb=kv_mb)
        out.append({"path": f"models/{f.name}", "name": f.name,
                    "stem": f.stem, "gb": round(gb, 1),
                    "slots": slots, "ctx_k": ctx_k, "fits": slots > 0,
                    "strains": bench.strains(gb, ram_gb)})
    return out


def h_sources(_q):
    from core import sources
    return {"workspaces": sources.workspaces(store),
            "sources": sources.listing(store),
            "kinds": [{"id": k, "reads": v,
                       "keychain": k in sources.NEEDS_KEYCHAIN}
                      for k, v in sources.KINDS.items()]}


def h_sources_add(body):
    from core import sources
    out = sources.add(store, (body.get("workspace") or "").strip(),
                      (body.get("kind") or "").strip(),
                      (body.get("ref") or "").strip())
    if out.get("error"):
        return out, 400
    bump()
    return out


def h_sources_remove(body):
    from core import sources
    out = sources.remove(store, body.get("workspace", ""), body.get("kind", ""))
    bump()
    return out


def h_sources_test(_body):
    from core import sources
    return sources.test(store)


def h_sources_peek(body):
    """Reads nothing into the system — it shows you what a connector sees.

    The bodies coming back are untrusted text from outside, carrying the
    quarantine verdict with them. Whatever renders this escapes it.
    """
    from core import sources
    out = sources.peek(store, body.get("workspace", ""), body.get("name", ""),
                       min(int(body.get("n", 5) or 5), 20))
    return (out, 404) if out.get("error") else out


def h_phone(_q):
    """Everything needed to get this onto a phone, and why it might not work.

    The terminal has had this since ./blokk doctor; the dashboard had not, so
    the answer lived in a window you had probably closed.
    """
    from core import doctor, qr
    port = SERVING_PORT["n"]
    ips = doctor.interfaces()
    reachable = [{"ip": ip, "interface": name, "answers": doctor.reachable(ip, port)}
                 for name, ip in ips]
    live = [r for r in reachable if r["answers"]]
    url = f"http://{live[0]['ip']}:{port}/?t={TOKEN}" if live else ""
    state, note = doctor.firewall()
    out = {"url": url, "addresses": reachable,
           "firewall": {"state": state, "note": note}}
    if url:
        try:
            out["qr"] = qr.svg(url)
        except Exception:
            pass                       # a missing picture is not a failure
    return out


def h_setup_state(_q):
    from core.plan import SHAPES
    import bench
    m = bench.machine()
    if m["ram_gb"] == 0:                      # dev box, not a Mac
        m = {"brand": "not a Mac (showing an assumed 96 GB M3 Ultra)",
             "chip": "M3 Ultra", "ram_gb": 96, "bandwidth": 819, "cores": 28}
    usable = bench.usable_gb(m["ram_gb"])
    rows = []
    for name, size, active, role, note in bench.MODELS:
        params = int("".join(c for c in name.split("-")[1] if c.isdigit()) or 8)
        cache = bench.kv_gb(params, 40, 5)
        one = bench.decode_tps(active, m["bandwidth"])
        many = bench.batched(one, 5) / 5
        rows.append({"name": name, "weights": size, "kv": round(cache, 1),
                     "total": round(size + cache, 1), "tps": round(one),
                     "batched": round(many), "note": note,
                     "fits": size + cache <= usable and many >= 8})
    # Size every shape to this Mac here, so the wizard has no reason to
    # invent 4 slots at 32k the way it used to. A shape that cannot fit at
    # any context says so instead of being offered and then dying.
    shapes = []
    for sh in SHAPES:
        slots, ctx_k = bench.fit(sh["params"], sh["gb"], m["ram_gb"])
        shapes.append({**sh, "slots": slots, "ctx_k": ctx_k,
                       "fits": slots > 0,
                       "strains": bench.strains(sh["gb"], m["ram_gb"])})
    return {"machine": {**m, "usable_gb": round(usable, 1)}, "models": rows,
            "shapes": shapes, "local": _local_models(m["ram_gb"]),
            "configured": srv.configured(), "conf": srv.read_conf(),
            "installed": {b: srv.installed(b) for b in BACKENDS}}


def h_setup_plan(body):
    """Which backend for which tier, and why. The rule lives in backends.py."""
    from core.plan import build
    shape = body.get("shape", "small")
    if shape.startswith("local:"):
        # No backend choice to make: MLX cannot read GGUF, so a file on disk
        # is always llama.cpp. backends.py is skipped rather than consulted.
        rel = shape.split(":", 1)[1]
        f = (ROOT / rel).resolve()
        if not f.is_file() or ROOT / "models" not in f.parents:
            return {"error": "no such model"}, 404
        return {"tiers": [{"tier": "SMALL", "backend": "llama.cpp",
                           "repo": None, "file": None, "path": f"models/{f.name}",
                           "alias": f.stem, "port": 8081, "model": f.name,
                           "why": "weights already on this Mac — nothing to "
                                  "download, and llama.cpp is the only thing "
                                  "that reads GGUF"}]}
    return {"tiers": build(shape,
                           int(body.get("slots", 4)),
                           int(body.get("ctx", 32768)) // 1000)}


def h_setup_write(body):
    conf = srv.write_conf(body.get("mode", "servers"), body.get("tiers", []),
                          int(body.get("slots", 4)), int(body.get("ctx", 32768)))
    bump()
    return {"ok": True, "conf": conf, "path": str(srv.CONF)}


def h_setup_status(_q):
    # status lives on the supervisor, not the module — it needs to know which
    # processes this instance owns.
    return {"configured": srv.configured(),
            "tiers": srv.SUPERVISOR.status(srv.tiers_from_conf())}


def h_setup_stop(_body):
    return {"stopped": srv.SUPERVISOR.stop_all()}


ROUTES_GET = [
    (r"^/api/v1/phone$", h_phone),
    (r"^/api/v1/sources$", h_sources),
    (r"^/api/v1/setup/state$", h_setup_state),
    (r"^/api/v1/setup/status$", h_setup_status),
    (r"^/api/v1/health$", h_health),
    (r"^/api/v1/workspaces$", h_workspaces),
    (r"^/api/v1/runs$", h_runs),
    (r"^/api/v1/runs/([\w]+)$", h_run),
    (r"^/api/v1/approvals$", h_approvals),
    (r"^/api/v1/handled$", h_handled),
    (r"^/api/v1/memory/([\w]+)$", h_memory),
]
ROUTES_POST = [
    (r"^/api/v1/sources/add$", h_sources_add),
    (r"^/api/v1/sources/remove$", h_sources_remove),
    (r"^/api/v1/sources/test$", h_sources_test),
    (r"^/api/v1/sources/peek$", h_sources_peek),
    (r"^/api/v1/setup/plan$", h_setup_plan),
    (r"^/api/v1/setup/write$", h_setup_write),
    (r"^/api/v1/setup/stop$", h_setup_stop),
    (r"^/api/v1/approvals/([\w]+)/decide$", h_decide),
    (r"^/api/v1/approvals/([\w]+)/recheck$", h_recheck),
    (r"^/api/v1/sweep$", h_sweep),
    (r"^/api/v1/reset$", h_reset),
    (r"^/api/v1/kill$", h_kill),
    (r"^/api/v1/memory/([\w]+)/consolidate$",
     lambda ws, _b: {"new_facts": consolidate(store, ws, router.small)}),
    (r"^/api/v1/memory/([\w]+)/forget$",
     lambda ws, b: forget(store, ws, b.get("episode_ids", []))),
]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):                      # quiet; real logs are spans
        pass

    def _send(self, code, payload, ctype="application/json"):
        body = payload if isinstance(payload, (bytes, bytearray)) else \
            json.dumps(payload, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    # ---------------------------------------------------------------- access
    def _cors(self):
        """Echo the origin only if it was allowed. No header at all is the
        right answer for an origin we do not know: the browser then refuses
        to hand the response to that page's script."""
        origin = self.headers.get("Origin")
        if not origin or origin not in ALLOWED_ORIGINS:
            return
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")          # or a cache serves one
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def _same_site(self) -> bool:
        """A page you happen to have open must not be able to drive this.

        Loopback is trusted without a token because you are sitting at the
        Mac — but a browser tab is also sitting at the Mac. A form-style POST
        (text/plain, no custom headers) needs no preflight, so until this
        existed any website could fire a sweep, rewrite blokk.conf or start a
        process here. CORS stopped it reading the answer, which made it
        silent rather than harmless.

        Two independent checks, because neither covers everyone. Browsers
        that send Sec-Fetch-Site say outright where the request came from.
        Requiring a JSON content type covers the rest: it is not a
        simple request, so anything cross-origin must preflight first, and
        the allowlist above answers preflights from unknown origins with
        nothing.
        """
        site = self.headers.get("Sec-Fetch-Site")
        if site and site not in ("same-origin", "none"):
            return False
        ctype = (self.headers.get("Content-Type") or "").split(";")[0]
        return ctype.strip().lower() == "application/json"

    def _authorised(self) -> bool:
        host = self.client_address[0]
        if host in ("127.0.0.1", "::1"):
            return True                       # you are at the Mac
        supplied = self.headers.get("X-Blokk-Token") or \
            parse_qs(urlparse(self.path).query).get("t", [""])[0]
        # constant time: a token check that leaks timing is not a token check
        return secrets.compare_digest(supplied or "", TOKEN)

    def _read_body(self) -> dict | None:
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            # Drain before answering. Replying without reading leaves the
            # client mid-write and it sees a broken pipe rather than the 413
            # that explains what happened.
            remaining = n
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            self.close_connection = True
            self._send(413, {"error": f"body over {MAX_BODY} bytes"})
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except (json.JSONDecodeError, ValueError):
            self._send(400, {"error": "malformed JSON"})
            return None

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        u = urlparse(self.path)
        if not self._authorised():
            return self._send(401, {"error": "token required",
                                    "hint": "open the link run.sh printed"})
        q = parse_qs(u.query)
        for pat, fn in ROUTES_GET:
            m = re.match(pat, u.path)
            if m:
                try:
                    out = fn(*m.groups(), q)
                except Exception as e:                           # noqa: BLE001
                    # Any handler bug used to drop the connection, which the
                    # client reads as "the Mac is offline" — the least useful
                    # possible diagnosis. Say what actually broke.
                    return self._send(500, {"error": f"{type(e).__name__}: {e}",
                                            "endpoint": u.path})
                code = 200
                if isinstance(out, tuple):
                    out, code = out
                return self._send(code, out)
        return self._static(u.path)

    def _sse(self, gen):
        """Stream AG-UI events. No Content-Length, connection closed at the end —
        ThreadingHTTPServer has no chunked helper and a short-lived turn does
        not need keep-alive."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.send_header("Connection", "close")
        self.end_headers()
        i = 0
        try:
            for ev in gen:
                self.wfile.write(f"id: {i}\nevent: {ev['type']}\n"
                                 f"data: {json.dumps(ev)}\n\n".encode())
                self.wfile.flush()
                i += 1
        except (BrokenPipeError, ConnectionResetError):
            return        # the phone locked, or Stop was pressed. Not an error.
        except Exception as e:                                   # noqa: BLE001
            # Never truncate silently. A stream that just stops looks to the
            # client like a finished answer that happens to be short.
            err = {"type": "RUN_ERROR", "message": str(e)}
            try:
                self.wfile.write(f"id: {i}\nevent: RUN_ERROR\n"
                                 f"data: {json.dumps(err)}\n\n".encode())
                self.wfile.flush()
            except Exception:                                    # noqa: BLE001
                pass

    def do_POST(self):
        u = urlparse(self.path)
        if not self._same_site():
            return self._send(403, {
                "error": "cross-site request refused",
                "detail": "This endpoint changes something, so it only "
                          "accepts requests from Blokk's own pages. Send "
                          "Content-Type: application/json."})
        if not self._authorised():
            return self._send(401, {"error": "token required"})
        if u.path == "/api/v1/setup/install":
            body = self._read_body()
            if body is None:
                return
            return self._sse(srv.install(body.get("backend", "llama.cpp")))
        if u.path == "/api/v1/setup/start":
            body = self._read_body()
            if body is None:
                return
            t = body.get("tier", {})
            tier = srv.Tier(name=t["tier"], backend=t["backend"], repo=t["repo"],
                            file=t.get("file"), alias=t["alias"],
                            port=int(t["port"]), slots=int(body.get("slots", 4)),
                            ctx=int(body.get("ctx", 32768)))
            return self._sse(srv.SUPERVISOR.start(tier))
        if u.path == "/api/v1/ask":
            body = self._read_body()
            if body is None:
                return
            q = (body.get("q") or "").strip()[:500]
            if not q:
                return self._send(400, {"error": "empty question"})
            return self._sse(_ask_stream(q, body.get("workspace")))
        body = self._read_body()
        if body is None:
            return
        for pat, fn in ROUTES_POST:
            m = re.match(pat, u.path)
            if m:
                try:
                    out = fn(*m.groups(), body)
                except Exception as e:              # noqa: BLE001
                    return self._send(500, {"error": str(e)})
                code = 200
                if isinstance(out, tuple):
                    out, code = out
                return self._send(code, out)
        self._send(404, {"error": "no route"})

    def _static(self, path):
        # Unconfigured installs land on the wizard, not an empty dashboard.
        # Same URL, same tab — the handoff is a redirect the browser does not
        # notice.
        if path in ("/", ""):
            rel = "index.html" if srv.configured() else "setup.html"
        else:
            rel = path.lstrip("/")
        f = (WEB / rel).resolve()
        if not str(f).startswith(str(WEB.resolve())) or not f.is_file():
            return self._send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        self._send(200, f.read_bytes(), ctype)


class Server(ThreadingHTTPServer):
    """ThreadingHTTPServer that does not shout about peers who walked away.

    A phone opens speculative connections and drops them: Safari preconnects,
    the poll reconnecting after the screen sleeps, wifi handing over. Each one
    raises inside handle_one_request, at readline() — before any handler here
    runs, so the try/except around a response cannot catch it — and
    socketserver's default handle_error prints a full traceback per drop. On a
    phone that is a screen full of them a minute.

    That is not "fail loudly", it is the thing that stops loud failures being
    read: a real traceback scrolls past among hundreds of these. So drop the
    ones that mean "the other end went away" and print everything else exactly
    as before. Nothing is swallowed except a socket that was never going to
    deliver a request.
    """

    # ENOTCONN is what macOS raises here; Linux says ECONNRESET for the same
    # thing, and ConnectionError covers the reset/abort/pipe family on both.
    QUIET = {errno.ENOTCONN, errno.ECONNRESET, errno.EPIPE, errno.ETIMEDOUT}

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionError, TimeoutError)):
            return
        if isinstance(exc, OSError) and exc.errno in self.QUIET:
            return
        super().handle_error(request, client_address)


def serve(port=8080):
    resumed = engine.resume_all()
    expired = engine.sweep_deadlines()
    ip, host = lan_ip(), socket.gethostname().split(".")[0].lower()
    phone = f"http://{ip}:{port}/?t={TOKEN}"

    # Under launchd, stdout is a log file: no colour, no QR, nobody watching.
    tty = sys.stdout.isatty()
    cols = shutil.get_terminal_size((80, 24)).columns
    B, D, G, Y, R, O = ((BOLD, DIM, GREEN, AMBER, RED, OFF) if tty
                        else ("", "", "", "", "", ""))

    print(f"\n  {B}Blokk is up{O}\n")
    print(f"  {B}1{O}  On this Mac      {G}http://localhost:{port}{O}")
    print(f"  {B}2{O}  On your phone    same wifi, then Add to Home Screen\n")

    # The whole point: nobody types a token off a screen correctly, and the
    # two things people leave out — the :port and the ?t= — are exactly the
    # two that turn this into "it doesn't connect".
    if tty and qr.width(phone) <= cols - 4:
        for line in qr.render(phone).splitlines():
            print("     " + line)
        print()
    print(f"     {G}{phone}{O}")
    print(f"     {D}or http://{host}.local:{port}/?t={TOKEN}{O}\n")

    ms = model_status(probe=True)
    if ms["live"] and ms.get("reachable"):
        model = f"{G}ready{O}    {ms['small']}"
        if ms["large"] != ms["small"]:
            model += f" / {ms['large']}"
    elif ms["live"]:
        model = (f"{R}not answering{O}    {ms['small']} is configured but the "
                 f"server is not up.\n                                    {D}Sweeps will fail and be "
                 f"marked resumable rather than quietly\n                                    degrading. "
                 f"Start it, or ./setup.sh --stubs to work without one.{O}")
    else:
        model = (f"{Y}stubs{O}    no weights loaded. Every mechanism is real; only "
                 f"the prose\n                            {D}is invented. ./setup.sh attaches a "
                 f"model.{O}")

    print(f"  {B}Status{O}")
    print(f"     model         {model}")
    print(f"     overnight     {len(resumed)} run(s) resumed, {expired} wait(s) expired")
    print(f"     update        ./blokk update")
    print(f"     stop          Ctrl-C\n")
    SERVING_PORT["n"] = port
    httpd = Server(("0.0.0.0", port), Handler)

    # Update while running. `./blokk update` pulls, then signals here; the
    # process exits 75 and run.sh starts it again with the new code. A signal
    # rather than an endpoint on purpose: nothing reachable over HTTP should
    # be able to replace the code this machine is running, and loopback is
    # trusted without a token.
    #
    # SIGUSR1, not SIGHUP: closing the terminal sends HUP, and "the window
    # shut" must not read as "restart yourself".
    #
    # The model servers are not touched. They were started detached and are
    # reused on the way back up, so this costs a second rather than a reload.
    restart = {"asked": False}

    def _restart(_sig, _frame):
        restart["asked"] = True
        # shutdown() blocks until serve_forever returns, so it cannot be
        # called from the thread that is inside serve_forever.
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    def _stop(_sig, _frame):
        # Python's default SIGTERM handler exits without unwinding, so the
        # finally below never runs and a stale pid is left behind pointing at
        # nothing. update.sh checks the pid is alive before trusting it, but
        # leaving litter that says "Blokk is running" is its own small lie.
        raise SystemExit(0)

    signal.signal(signal.SIGUSR1, _restart)
    signal.signal(signal.SIGTERM, _stop)
    PIDFILE.write_text(str(os.getpid()))
    try:
        httpd.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        pass                                   # Ctrl-C and SIGTERM are normal
    finally:
        httpd.server_close()
        if PIDFILE.exists() and PIDFILE.read_text().strip() == str(os.getpid()):
            PIDFILE.unlink()
    if restart["asked"]:
        print("\n  Restarting with the new code...\n")
        raise SystemExit(75)        # run.sh reads 75 as "start me again"


if __name__ == "__main__":
    import sys
    serve(int(sys.argv[1]) if len(sys.argv) > 1 else 8080)
