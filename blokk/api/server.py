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
from core.ask import (ask as run_ask, history as ask_history,
                      scope_for as ask_scope, _thread_id as ask_thread_id)
from core import actions, nightly, servers as srv
from core.backends import BACKENDS, pick

import os
import secrets

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DB = ROOT / "blokk.db"

store = Store(DB)
engine = Engine(store)
policy = Policy(store)

# Built here, started in serve(). Handlers read its state, and a module that
# is imported by a test or by hunt.py must not quietly start sweeping.
NIGHTLY = nightly.Nightly(
    store,
    sweep=lambda since: sweep_all(since=since),
    # A lambda, not the function: NIGHTLY is built here at import time and
    # expire_waits is defined several hundred lines below it.
    expire=lambda: expire_waits())

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
# ── reading a request body ──────────────────────────────────────────────────
# Everything below arrives as JSON from a phone, a browser, or curl, and none
# of the three is obliged to send what the handler expects. A field read
# straight out of a dict and used as though it were a string turns a typo into
# a 500 with a Python message in it, which tells the person holding the phone
# nothing at all. These do the reading, and say what was wrong with it.
class BadField(Exception):
    """Carries a sentence for the caller, not a traceback."""


def text(body: dict, key: str, default: str = "", limit: int = 400) -> str:
    v = body.get(key, default)
    if v is None:
        v = default
    if not isinstance(v, str):
        raise BadField(f"'{key}' should be text, not {type(v).__name__}")
    if len(v) > limit:
        raise BadField(f"'{key}' is {len(v)} characters; the limit is {limit}")
    return v.strip()


def number(body: dict, key: str, default: int, lo: int, hi: int) -> int:
    v = body.get(key, default)
    if v is None or v == "":
        return default
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise BadField(f"'{key}' should be a number, not {v!r}") from None
    return max(lo, min(hi, n))


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
        # On health rather than its own endpoint: it changes once a day, and
        # the row that shows it is repainted on every tick anyway.
        "schedule": NIGHTLY.state(),
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
    except (IndexError, KeyError):
        # The column is not in this SELECT. A caller that forgot it should
        # get a card without its citation, not a 500 that takes the whole
        # transcript with it — invariant 6, and the reason it is worth a
        # line here is that a sqlite3.Row raises IndexError for a missing
        # key rather than the KeyError anybody would guess.
        return {}


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
        "a.decision, a.decided_at, a.action, a.result FROM approval a "
        "JOIN workspace w ON w.id=a.workspace_id "
        "WHERE a.decision IS NOT NULL ORDER BY a.decided_at DESC LIMIT 20"))


def h_thread(q):
    """The chat, as it was. What a reload redraws from.

    A conversation that vanishes when the phone locks is not a conversation,
    and rebuilding it from the client's memory would mean the transcript on
    the phone and the transcript on the Mac could disagree about what was
    said. One copy, and it is the one on the machine that holds the data.

    Proposal turns come back with the queue row attached, so a card that was
    approved an hour ago redraws as approved and what it did, not as a live
    button waiting to be pressed twice.
    """
    ws = ask_scope(store, (q.get("workspace") or [None])[0])
    tid = ask_thread_id((q.get("thread") or [None])[0], ws)
    out = []
    for m in ask_history(store, tid):
        row = dict(m)
        if row.get("approval_id"):
            a = store.one("SELECT id,title,body,category,decision,decided_at,"
                          "action,edited_body,result,evidence "
                          "FROM approval WHERE id=?", row["approval_id"])
            # evidence was not selected, so a proposal redrawn after a reload
            # lost the list of what the turn had read — the citation was on
            # the card while the tab stayed open and gone the moment it did
            # not, which is the worst of both.
            if a:
                row["approval"] = dict(a)
                row["approval"]["evidence"] = _ev(a)
        out.append(row)
    return {"thread": tid, "workspace": ws, "messages": out}


DECISIONS = ("approve", "edit", "reject")


def h_decide(approval_id, body):
    a = store.one("SELECT * FROM approval WHERE id=?", approval_id)
    if not a:
        return {"error": "no such approval"}, 404
    if a["decision"]:
        return {"ok": True, "already": a["decision"]}      # taps get retried

    # Before the claim, not after it. An unrecognised decision used to be
    # written into the row and *then* raise on the way to recording trust:
    # the approval left the queue marked "delete", never sent, with no
    # episode and no trust behind it, and the run holding it never woke. A
    # decision this endpoint cannot carry out must not be recorded as one.
    decision = body.get("decision")
    if decision not in DECISIONS:
        return {"error": f"decision must be one of {', '.join(DECISIONS)}, "
                         f"not {decision!r}"}, 400

    if decision == "approve" and _stale(a):
        return {"ok": False, "blocked": "stale",
                "detail": "Facts changed since drafting. Re-checked at send, not at draft."}

    # Before the claim, for the same reason the check above it is: a decision
    # this endpoint cannot carry out must not be recorded as one. The first
    # version validated the correction *after* claiming, so a typo in the
    # edit field consumed the decision — the row came back "already edited",
    # the retry hit the fast path, and the corrected version never ran while
    # the screen still showed a form waiting to be fixed.
    corrected = None
    if decision == "edit" and a["action"]:
        try:
            corrected = actions.edited(a["action"], body.get("edited_body"))
        except actions.Rejected as e:
            return {"error": str(e), "undecided": True}, 400

    # Claim the approval in one statement. The check above is a fast path for
    # the common retry, not the guard: this is a threading server, so six taps
    # on a flaky phone connection all read decision IS NULL and all get here.
    # Deciding twice would call policy.record twice, and trust.clean moving by
    # six is autonomy granted by a race — exactly what the trust gate exists to
    # stop. Only the thread whose UPDATE matched a row may record.
    claimed = store.x(
        "UPDATE approval SET decision=?, edited_body=?, decided_at=? "
        "WHERE id=? AND decision IS NULL",
        decision, body.get("edited_body"), now().isoformat(), approval_id)
    if not claimed:
        loser = store.one("SELECT decision FROM approval WHERE id=?", approval_id)
        return {"ok": True, "already": loser["decision"]}
    policy.record(a["workspace_id"], a["category"], decision)

    # ── the only place an action runs ───────────────────────────────────────
    # Not in core/ask.py, which has no executor in it; not on the way into the
    # queue; not on reject. Here, after a person has tapped Approve, once —
    # the UPDATE above is the mutex, so six taps on a flaky connection claim
    # once and five find the row already decided and never reach this.
    #
    # The trust ledger is not consulted and not corrected. It records what the
    # person decided, and they did decide to approve; an action that then
    # fails is a failure of the action, not of the judgement.
    ran = None
    if decision in ("approve", "edit") and a["action"]:
        # An edit is an approve with the arguments corrected. The alternative
        # was reject-and-retype, which is a strange thing to ask of somebody
        # who can see the sentence and knows exactly which word is wrong —
        # and it throws away the correction, which is the most useful thing
        # they just told the system.
        #
        # The trust ledger already treats an edit as not-clean, and that
        # stands: it needed correcting. What changes is that the corrected
        # version runs, rather than nothing running at all.
        todo = corrected or a["action"]
        try:
            ran = actions.run(store, todo)
        except actions.Rejected as e:
            ran = {"ok": False, "error": str(e)}
        except Exception as e:                               # noqa: BLE001
            # Loud, and on the row. An approved action that quietly did
            # nothing is the exact shape invariant 6 exists to forbid: the
            # queue would show it handled and the world would disagree.
            ran = {"ok": False, "error": f"{type(e).__name__}: {e}"[:400]}
        store.x("UPDATE approval SET result=? WHERE id=?",
                json.dumps(ran), approval_id)
        if corrected:
            # What actually ran, on the row. The original stays in `action`
            # and the correction in `edited_body`, so the row reads: this was
            # proposed, you changed it to that, and here is what happened.
            store.x("UPDATE approval SET edited_body=? WHERE id=?",
                    json.dumps(corrected), approval_id)

    # An edit is a diff between what the agent wrote and what you wanted.
    if decision in ("edit", "reject"):
        store.x("""INSERT OR REPLACE INTO episode
                   (id,workspace_id,kind,category,before,after)
                   VALUES(?,?,?,?,?,?)""",
                f"e_{approval_id}", a["workspace_id"], decision,
                a["category"], a["body"], body.get("edited_body"))

    still = store.one(
        "SELECT COUNT(*) c FROM approval WHERE run_id=? AND decision IS NULL",
        a["run_id"])["c"]
    resumed, resume_error = False, None
    if still == 0:
        try:
            engine.signal(a["run_id"], "approval", {"decision": decision})
            resumed = True
        except (ValueError, KeyError):
            pass                                   # already resumed, fine
        except Exception as e:                               # noqa: BLE001
            # The decision is already recorded and it stands — the tap
            # happened and the person is owed that. What failed is the run
            # picking up where it left off, and _drive has already marked it
            # so. Answering 500 here would report a write that succeeded as
            # one that did not, which is invariant 6 backwards.
            resume_error = f"{type(e).__name__}: {e}"

    ok, why = policy.may_act(a["workspace_id"], a["category"])
    bump()
    out = {"ok": True, "category": a["category"], "now_autonomous": ok,
           "trust": why, "run_resumed": resumed}
    if corrected:
        # So the card can show what it now says rather than what it said.
        out["preview"] = corrected.get("preview")
    if ran is not None:
        # Reported, not just stored. The person who tapped Approve is the one
        # owed the answer to "and then what happened".
        out["ran"] = ran
        out["ok"] = bool(ran.get("ok"))

    if resume_error:
        out["run_error"] = resume_error
    return out


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


def sweep_all(force: bool = False, since: str = "") -> dict:
    """Idempotent per workspace per day.

    Without this, the Mac and the phone both pressing sweep at 04:00 starts
    two runs per workspace and every guest gets two replies. A sweep is a
    daily event, so the day is the key. force=true is the manual override.

    Shared with the night shift rather than reimplemented for it: a scheduler
    with its own copy of "have we already swept" is a scheduler that
    eventually disagrees with the button.
    """
    day = now().date().isoformat()
    started, skipped, failed = [], [], []
    for w in store.q("SELECT id FROM workspace WHERE active=1"):
        existing = store.one(
            "SELECT id FROM run WHERE workspace_id=? AND workflow='morning_sweep' "
            "AND date(started_at)=? AND status IN ('running','suspended','done')",
            w["id"], day)
        if existing and not force:
            skipped.append(existing["id"])
            continue
        try:
            # Started, not finished. The workflow runs every workspace's
            # sweep, which with real weights is minutes — holding the request
            # open for that made the page give up and call it a failure. The
            # runs are journalled and resumable, and the poll shows them.
            started.append(engine.start_background(
                "morning_sweep", w["id"], payload={"since": since} if since
                else None, on_done=bump))
        except Exception as e:                                   # noqa: BLE001
            # The run is already marked failed and journalled, so it is
            # resumable once whatever broke is fixed. Losing three good
            # workspaces because the fourth could not reach the model server
            # is the wrong trade.
            failed.append({"workspace": w["id"], "error": str(e)[:200]})
    bump()
    out = {"started": started, "already_swept_today": skipped,
           "running": True}
    if failed:
        out["failed"] = failed
    return out


def h_sweep(body):
    return sweep_all(force=bool(body.get("force")))


def h_schedule(_q):
    return NIGHTLY.state()


def h_schedule_set(body):
    """Change the hour, or turn the night shift off.

    Refuses what it cannot parse rather than storing it: a schedule that
    silently means "never" is the failure this whole file was written to fix.
    """
    try:
        at = nightly.set_at(store, text(body, "at", limit=16))
    except ValueError as e:
        return {"error": str(e)}, 400
    bump()
    return {"ok": True, "at": at, **NIGHTLY.state()}


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


def _ask_stream(q, workspace, thread=None):
    """Wraps the ask generator so a PROPOSAL lands in the approval queue.

    This is the only place the chat surface touches the database, and it
    writes exactly one kind of row: an undecided approval. It cannot send, and
    it cannot mark anything decided.
    """
    # The same resolution ask() does, so the approval row and the transcript
    # cannot end up scoped to different workspaces.
    ws = ask_scope(store, workspace)
    run_id = None
    tid = ask_thread_id(thread, ws)
    for ev in run_ask(store, q, router.small, workspace, thread=thread):
        if ev["type"] == "RUN_STARTED":
            tid = ev.get("thread") or tid
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
            # A fresh id every time, deliberately. The first version keyed
            # the row on hash(text), so asking for the same thing twice did
            # an INSERT OR REPLACE over the earlier row — and if that row had
            # already been approved and run, the replace wiped its decision
            # and its result and put it back in the queue as undecided. A
            # decision that has been made is a fact; nothing in the chat box
            # gets to un-make it.
            aid = f"a_ask_{secrets.token_hex(6)}"
            act = ev.get("action")
            store.x("""INSERT INTO approval
                       (id,run_id,workspace_id,category,title,body,evidence,
                        action)
                       VALUES(?,?,?,?,?,?,?,?)""",
                    aid, run_id, ws,
                    # The trust ledger buckets by category, so a proposal to
                    # act counts toward the bucket that action belongs to,
                    # not toward "you asked for something in chat".
                    (act or {}).get("category") or "asked_for",
                    "You asked for this in chat", ev["text"],
                    # What the turn read before it proposed. It said
                    # {"sources": ["you"]}, which describes the request and
                    # nothing about the answer — so a card offering to wire
                    # a source or hold some dates gave no way to tell
                    # whether it had looked at anything at all.
                    #
                    # read_flagged is the one that matters most: it says a
                    # message that reads like an instruction was in the
                    # context window when this was proposed. Nothing is
                    # allowed to act on it either way, but somebody
                    # approving this should be told.
                    json.dumps({"sources": ["you"], "via": "ask",
                                "drawn_from": ev.get("drawn_from") or [],
                                "read_flagged": bool(ev.get("read_flagged"))}),
                    json.dumps(act) if act else None)
            # The transcript row for this turn was written inside ask(),
            # before the queue had an id for it, and the event carries that
            # row's id. Point it at the queue row now, so a reload redraws the
            # proposal card attached to the sentence that proposed it rather
            # than as a loose paragraph.
            if ev.get("message_id"):
                store.x("UPDATE message SET approval_id=? WHERE id=?",
                        aid, ev["message_id"])
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


def h_models_add(body):
    from core import weights
    out = weights.add(ROOT, text(body, "path", limit=1024))
    if out.get("error"):
        return out, 400
    _KV_CACHE.clear()                 # a new file to read the geometry from
    bump()
    return out


def h_models_remove(body):
    from core import weights
    out = weights.remove(ROOT, text(body, "name", limit=255))
    if out.get("error"):
        return out, 400
    _KV_CACHE.clear()
    bump()
    return out


def h_sources(_q):
    from core import egress, local, sources
    return {"workspaces": [{**w, "sample": w["id"] in sources.SAMPLE,
                            "egress": egress.allowlist_for(store, w["id"])}
                           for w in sources.workspaces(store)],
            "sample": sources.is_sample(store),
            "egress_log": egress.recent(12),
            "sources": sources.listing(store),
            "local": local.survey(),
            # `writes` so the picker can say "writes holds" rather than
            # "reads holds", which is the opposite of what ics_out does and
            # the only claim in that list anybody checks.
            "kinds": [{"id": k, "reads": v,
                       "writes": k in sources.WRITES,
                       "keychain": k in sources.NEEDS_KEYCHAIN}
                      for k, v in sources.KINDS.items()]}


def h_inside(q):
    """What is in a source, for a picker, before anything is wired.

    A GET because it changes nothing and a person may open and close the
    list three times while deciding.
    """
    from core import sources
    kind = (q.get("kind") or [""])[0]
    ref = (q.get("ref") or ["local"])[0]
    return sources.inside(kind, ref)


def h_workspace_add(body):
    from core import sources
    r = sources.workspace_add(store, text(body, "id", limit=64),
                              text(body, "name", limit=200))
    if not r.get("error"):
        bump()
    return r


def h_workspace_remove(body):
    """Removing a workspace takes everything in it. Say what, and mean it.

    Two-step by construction: without confirm it reports what would go, and
    the caller sends the same request again with the counts it was shown.
    A dialog that deletes six months of decisions on one tap is a dialog
    someone taps by accident.
    """
    from core import sources
    wid = text(body, "id", limit=64)
    if not store.one("SELECT 1 FROM workspace WHERE id=?", wid):
        return {"error": f"no workspace '{wid}'"}
    counts = {t: store.one(f"SELECT COUNT(*) c FROM {t} WHERE workspace_id=?",
                           wid)["c"]
              for t in ("credential", "run", "approval", "trust", "episode",
                        "fact")}
    if not body.get("confirm"):
        return {"confirm": True, "id": wid, "holds": counts}
    r = sources.workspace_remove(store, wid)
    if not r.get("error"):
        bump()
    return r


def h_workspace_clean(body):
    """Remove the sample world — four invented businesses with invented guests.

    Useful until you have your own workspace; actively misleading after, and
    the fake connectors fill gaps by workspace id, so leaving them wired means
    invented data sitting next to real data.
    """
    from core import sources
    sample = sources.is_sample(store)
    if not sample:
        return {"ok": True, "removed": [], "detail":
                "No sample workspaces left — this is your own data."}
    if not body.get("confirm"):
        holds = {w: {t: store.one(
            f"SELECT COUNT(*) c FROM {t} WHERE workspace_id=?", w)["c"]
            for t in ("run", "approval", "episode", "fact")} for w in sample}
        return {"confirm": True, "sample": sample, "holds": holds}
    out = [sources.workspace_remove(store, w) for w in sample]
    bump()
    return {"ok": True, "removed": [r["id"] for r in out if r.get("ok")],
            "left": sources.workspaces(store)}


def h_sources_add(body):
    from core import sources
    only = body.get("only")
    if not isinstance(only, list):
        only = []
    out = sources.add(store, (body.get("workspace") or "").strip(),
                      (body.get("kind") or "").strip(),
                      (body.get("ref") or "").strip(),
                      only=[str(o)[:200] for o in only[:64]])
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


def h_egress_allow(body):
    from core import egress
    r = egress.allow(store, text(body, "workspace", limit=64),
                     text(body, "host", limit=253))
    if not r.get("error"):
        bump()
    return (r, 400) if r.get("error") else r


def h_egress_deny(body):
    from core import egress
    r = egress.disallow(store, text(body, "workspace", limit=64),
                        text(body, "host", limit=253))
    if not r.get("error"):
        bump()
    return (r, 400) if r.get("error") else r


def h_sources_peek(body):
    """Reads nothing into the system — it shows you what a connector sees.

    The bodies coming back are untrusted text from outside, carrying the
    quarantine verdict with them. Whatever renders this escapes it.
    """
    from core import sources
    out = sources.peek(store, text(body, "workspace", limit=64),
                       text(body, "name", limit=64),
                       number(body, "n", 5, 1, 20))
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
    shape = text(body, "shape", "small", limit=300)
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
                           number(body, "slots", 4, 1, 64),
                           number(body, "ctx", 32768, 1024, 1_000_000) // 1000)}


def h_setup_write(body):
    tiers = body.get("tiers", [])
    if not isinstance(tiers, list) or not all(isinstance(t, dict) for t in tiers):
        raise BadField("'tiers' should be a list of tier objects")
    for t in tiers:
        missing = [k for k in ("tier", "backend", "alias", "port") if not t.get(k)]
        if missing:
            raise BadField(f"a tier is missing {', '.join(missing)}")
    conf = srv.write_conf(text(body, "mode", "servers", limit=32), tiers,
                          number(body, "slots", 4, 1, 64),
                          number(body, "ctx", 32768, 1024, 1_000_000))
    bump()
    return {"ok": True, "conf": conf, "path": str(srv.CONF)}


def expire_waits() -> int:
    """Expire parked runs, and take their approvals out of the queue with them.

    A run whose 48 hours ran out is finished. The approvals it was holding
    stayed in the queue with no decision, so the phone kept offering a draft
    that nothing would ever send — approving it recorded trust, resumed
    nothing, and said nothing about why. The schema has named this decision
    since the beginning; nothing ever wrote it.
    """
    woken = engine.sweep_deadlines()
    if woken:
        marks = ",".join("?" * len(woken))
        store.x(f"UPDATE approval SET decision='expired', decided_at=? "
                f"WHERE decision IS NULL AND run_id IN ({marks})",
                now().isoformat(), *woken)
        bump()
    return len(woken)


_DOCTOR: dict = {"at": 0.0, "report": None}


def h_doctor(_q):
    """Why the agent cannot reach a model, for the dashboard.

    Cached for fifteen seconds. Each call opens sockets to the tier ports,
    and when nothing is listening that is a connect timeout per tier — on
    the phone, on a poll, that is a page that stutters every few seconds
    for news that changes about twice a day.
    """
    import time as _t
    if _DOCTOR["report"] is None or _t.time() - _DOCTOR["at"] > 15:
        from core import doctor
        _DOCTOR["report"] = doctor.model_report()
        _DOCTOR["at"] = _t.time()
    return _DOCTOR["report"]


# ------------------------------------------------------------------- update
_ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _git(*args, timeout=60, where=None) -> tuple[int, str]:
    # `where` so the branch listing below can be pointed at a fixture repo and
    # actually tested; everything in production leaves it alone.
    import subprocess
    try:
        r = subprocess.run(["git", *args], cwd=str(where or ROOT), timeout=timeout,
                           capture_output=True, text=True)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:                                       # noqa: BLE001
        return 1, str(e)


def _elsewhere(branch: str, where=None) -> list[dict]:
    """Branches on origin carrying work this one does not have.

    "Up to date" is only a useful sentence if it can also say that the code
    you are looking for is on another branch. Told plainly: on this repo the
    answer is usually yes, and the old message sent you looking for a feature
    that was never in the clone.
    """
    _, refs = _git("for-each-ref", "--format=%(refname:short)",
                   "refs/remotes/origin/", where=where)
    out = []
    for ref in refs.split():
        # refs/remotes/origin/HEAD shortens to the bare word "origin", which
        # is not a branch anyone can check out.
        if ref == "origin" or ref == f"origin/{branch}":
            continue
        code, n = _git("rev-list", "--count", f"HEAD..{ref}", "--", ".",
                       where=where)
        try:
            ahead = int(n.strip()) if not code else 0
        except ValueError:
            ahead = 0
        if ahead:
            _, subject = _git("log", "-1", "--format=%s", ref, where=where)
            out.append({"branch": ref[len("origin/"):], "ahead": ahead,
                        "at": subject.strip()[:80]})
    return sorted(out, key=lambda r: -r["ahead"])[:4]


def h_update_check(_body):
    """Is there anything to pull? Asked, never volunteered.

    Nothing here phones home on startup — a machine that quietly fetches code
    is one whose behaviour you cannot pin to a moment. This runs git fetch,
    which is a network call, and it runs it because somebody pressed a button.
    """
    code, _ = _git("rev-parse", "--show-toplevel")
    if code:
        return {"clone": False, "detail":
                "This is a copy, not a clone, so there is nothing to pull."}
    _, branch = _git("rev-parse", "--abbrev-ref", "HEAD")
    branch = branch.strip()
    if branch == "HEAD":
        return {"clone": True, "error": "Detached HEAD — git checkout main first."}
    _, dirty = _git("status", "--porcelain", "--", ".")
    # Every branch, not just this one, so "up to date" can also say that the
    # work is somewhere else.
    code, out = _git("fetch", "--quiet", "origin", timeout=120)
    if code:
        return {"clone": True, "error": f"Could not reach GitHub: {out.strip()[:200]}"}
    # "Nothing to pull", not "the same commit". A clone sitting one commit
    # ahead of origin has nothing to pull either, and comparing hashes sent
    # it down the path that reports what is coming — which was nothing.
    _, log = _git("log", "--oneline", "--no-decorate",
                  f"HEAD..origin/{branch}", "--", ".")
    commits = [ln for ln in log.splitlines() if ln.strip()]
    other = _elsewhere(branch)
    if not commits:
        _, at = _git("log", "-1", "--format=%h %s")
        return {"clone": True, "behind": 0, "branch": branch, "at": at.strip(),
                "elsewhere": other}
    schema = _git("diff", "--quiet", f"HEAD..origin/{branch}",
                  "--", "core/schema.sql")[0] != 0
    return {"clone": True, "branch": branch, "behind": len(commits),
            "commits": commits[:20], "schema": schema, "elsewhere": other,
            "dirty": [ln for ln in dirty.splitlines() if ln.strip()][:20]}


def _update_stream():
    """Run the same update.sh the terminal runs, line by line.

    The same script rather than a reimplementation: two ways to update would
    drift, and the one you were not looking at would be the one that ate an
    uncommitted change. --no-restart because the browser restarts separately,
    through an endpoint that says whether anything will start it again.
    """
    import subprocess
    yield {"type": "STARTED", "command": "./update.sh --no-restart"}
    proc = subprocess.Popen(["./update.sh", "--no-restart"], cwd=str(ROOT),
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1)
    for line in proc.stdout:                                     # type: ignore[union-attr]
        yield {"type": "LOG", "line": _ANSI.sub("", line.rstrip())}
    proc.wait()
    if proc.returncode == 0:
        yield {"type": "READY", "code": 0}
    else:
        # update.sh exits non-zero for reasons that are not failures — "you
        # have local edits", "not a clone" — and it has already said which.
        yield {"type": "ERROR", "message": f"update.sh exited {proc.returncode}",
               "code": proc.returncode}


def h_restart(body):
    """Restart into the code that is now on disk.

    This used to be signal-only, on the grounds that nothing reachable over
    HTTP should be able to replace the code the machine is running. What
    changed: POSTs are same-site checked now, so a page you happen to be
    visiting cannot reach this, and update.sh will only fast-forward to the
    branch this clone already tracks — it cannot be pointed somewhere else,
    and it refuses outright if you have edits. What it still will not do is
    run on an unsupervised process: exiting 75 with nothing watching is not a
    restart, it is a stop, and from a phone on the sofa that is unrecoverable.
    """
    if not body.get("confirm"):
        return {"confirm": True, "supervised": bool(os.environ.get("BLOKK_SUPERVISED"))}
    if not os.environ.get("BLOKK_SUPERVISED"):
        return {"error": "This Blokk was not started by run.sh, so nothing "
                         "would start it again. Restart it yourself: ./blokk"}
    import time as _t

    def later():
        _t.sleep(0.4)          # let this response reach the browser first
        os.kill(os.getpid(), signal.SIGUSR1)
    threading.Thread(target=later, daemon=True).start()
    return {"ok": True, "restarting": True}


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
    (r"^/api/v1/sources/inside$", h_inside),
    (r"^/api/v1/setup/state$", h_setup_state),
    (r"^/api/v1/setup/status$", h_setup_status),
    (r"^/api/v1/health$", h_health),
    (r"^/api/v1/doctor$", h_doctor),
    (r"^/api/v1/schedule$", h_schedule),
    (r"^/api/v1/workspaces$", h_workspaces),
    (r"^/api/v1/runs$", h_runs),
    (r"^/api/v1/runs/([\w]+)$", h_run),
    (r"^/api/v1/approvals$", h_approvals),
    (r"^/api/v1/thread$", h_thread),
    (r"^/api/v1/handled$", h_handled),
    (r"^/api/v1/memory/([\w]+)$", h_memory),
]
ROUTES_POST = [
    (r"^/api/v1/models/add$", h_models_add),
    (r"^/api/v1/models/remove$", h_models_remove),
    (r"^/api/v1/workspaces/add$", h_workspace_add),
    (r"^/api/v1/workspaces/remove$", h_workspace_remove),
    (r"^/api/v1/workspaces/clean$", h_workspace_clean),
    (r"^/api/v1/sources/add$", h_sources_add),
    (r"^/api/v1/sources/remove$", h_sources_remove),
    (r"^/api/v1/sources/test$", h_sources_test),
    (r"^/api/v1/sources/peek$", h_sources_peek),
    (r"^/api/v1/egress/allow$", h_egress_allow),
    (r"^/api/v1/egress/deny$", h_egress_deny),
    (r"^/api/v1/update/check$", h_update_check),
    (r"^/api/v1/restart$", h_restart),
    (r"^/api/v1/setup/plan$", h_setup_plan),
    (r"^/api/v1/setup/write$", h_setup_write),
    (r"^/api/v1/setup/stop$", h_setup_stop),
    (r"^/api/v1/approvals/([\w]+)/decide$", h_decide),
    (r"^/api/v1/approvals/([\w]+)/recheck$", h_recheck),
    (r"^/api/v1/sweep$", h_sweep),
    (r"^/api/v1/schedule$", h_schedule_set),
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
        if u.path == "/api/v1/update/apply":
            body = self._read_body()
            if body is None:
                return
            if not body.get("confirm"):
                return self._send(400, {"error": "confirm required"})
            return self._sse(_update_stream())
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
            tier = srv.tier_from_plan(t, body.get("slots", 4),
                                      body.get("ctx", 32768))
            return self._sse(srv.SUPERVISOR.start(tier))
        if u.path == "/api/v1/ask":
            body = self._read_body()
            if body is None:
                return
            q = (body.get("q") or "").strip()[:500]
            if not q:
                return self._send(400, {"error": "empty question"})
            return self._sse(_ask_stream(q, body.get("workspace"),
                                         body.get("thread")))
        body = self._read_body()
        if body is None:
            return
        for pat, fn in ROUTES_POST:
            m = re.match(pat, u.path)
            if m:
                try:
                    out = fn(*m.groups(), body)
                except BadField as e:
                    # Malformed input is the caller's mistake, and 400 with a
                    # sentence is the answer. It used to be a 500 with a
                    # Python exception in it, which reads as "Blokk broke".
                    return self._send(400, {"error": str(e)})
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
    # Picked up, not waited for. Printing the banner after resuming meant a
    # Mac with a few interrupted sweeps behind it sat silent for minutes on
    # every start, with nothing on screen to say why.
    resumed = engine.resume_all(background=True, on_done=bump)
    expired = expire_waits()
    NIGHTLY.start()
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
    # Guarded, because qr raises rather than shrugging when a URL is longer
    # than version 10 holds — and the link is only long when someone has set
    # a long BLOKK_TOKEN, which is a reasonable thing to do and not a reason
    # for the control plane to die on the last line of its own banner.
    try:
        if tty and qr.width(phone) <= cols - 4:
            for line in qr.render(phone).splitlines():
                print("     " + line)
            print()
    except ValueError:
        print(f"     {D}(the link is too long to draw as a QR code){O}\n")
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
    # What it will do while nobody is looking, which is the whole product.
    sch = NIGHTLY.state()
    when = (f"sweeps at {sch['at']}" if sch["on"] else
            f"{Y}no nightly sweep — only when you press it{O}")
    if sch["on"] and sch["last"]:
        when += f", last {sch['last'][:16].replace('T', ' ')}"
    print(f"     night shift   {when}")
    print(f"     overnight     {len(resumed)} run(s) "
          + ("picked up, resuming now" if resumed else "resumed")
          + f", {expired} wait(s) expired")
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
