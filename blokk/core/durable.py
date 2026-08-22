"""
Durable execution.

The contract, and the only rule that matters:

    The workflow decides. Activities do.

Workflow code is deterministic and touches nothing — no clock, no network,
no randomness, no uuid4. Every side effect goes through ctx.activity(), whose
result is written to the journal. On restart we replay the journal: completed
steps return their recorded result without executing, and the run continues
from the first step that has no entry.

Two minutes of downtime should cost two minutes, not a night of tokens and a
duplicate email to a guest.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

UTC = timezone.utc


def now() -> datetime:
    return datetime.now(UTC)


def _hash(obj: Any) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]


class Suspended(Exception):
    """Raised to unwind out of a workflow that is now parked on a signal.

    Not an error. The run stays in the database holding its full state and
    costs nothing until the signal arrives or the deadline passes.
    """

    def __init__(self, run_id: str, signal: str):
        self.run_id, self.signal = run_id, signal
        super().__init__(f"{run_id} suspended on {signal}")


class BudgetExceeded(Exception):
    """A run tried to spend past its daily allowance. Stop, don't degrade."""


# --------------------------------------------------------------------- store
class Store:
    """One connection, serialised.

    The control plane is a threading HTTP server, so requests land on
    different threads. sqlite3 will happily let you share a connection with
    check_same_thread=False and then corrupt under concurrent writes, so every
    call goes through a lock. WAL keeps readers from blocking on it.
    """

    TIMEOUT = 10          # seconds to wait for another writer to let go

    def __init__(self, path: str | Path):
        self.path = str(path)
        self.db = sqlite3.connect(self.path, check_same_thread=False,
                                  timeout=self.TIMEOUT)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.db.executescript((Path(__file__).parent / "schema.sql").read_text())

    def q(self, sql: str, *a) -> list[sqlite3.Row]:
        with self.lock:
            return self.db.execute(sql, a).fetchall()

    def one(self, sql: str, *a) -> sqlite3.Row | None:
        with self.lock:
            return self.db.execute(sql, a).fetchone()

    def x(self, sql: str, *a) -> int:
        """Returns rowcount, so a caller can make a conditional UPDATE its
        claim. The lock below serialises each statement, but it does NOT
        span two calls: a SELECT-then-UPDATE across separate x()/one()
        calls is still check-then-act. Guard the transition in one
        statement (`... WHERE id=? AND decision IS NULL`) and branch on
        what comes back.
        """
        with self.lock:
            try:
                cur = self.db.execute(sql, a)
                self.db.commit()
                return cur.rowcount
            except sqlite3.OperationalError as e:
                if "locked" not in str(e) and "busy" not in str(e):
                    raise
                # SQLite's busy handler spins rather than queues, so a second
                # connection writing hard can hold this one off for the whole
                # timeout. Rare, and it arrives as a bare "database is
                # locked" three frames down — which at 04:00 names neither
                # the file nor whether the write happened. It did not: the
                # statement never ran.
                self.db.rollback()
                raise sqlite3.OperationalError(
                    f"{self.path} was locked for {self.TIMEOUT}s by another "
                    f"writer, so nothing was written. Another blokk running "
                    f"against the same file is the usual cause: "
                    f"lsof {self.path}") from e


# ------------------------------------------------------------------- context
@dataclass
class Ctx:
    """Handed to workflow functions. The only legal way to touch the world."""

    store: Store
    run_id: str
    workspace_id: str
    step: int = 0
    replayed: int = 0
    executed: int = 0
    tokens_saved: int = 0
    # Workflows write counts here as they go. The engine persists it whatever
    # happens — returned, suspended or died — because a run that parks on an
    # approval still did most of a night's work and the dashboard reads it.
    progress: dict = field(default_factory=dict)

    # -- deterministic replacements for the things workflows must not call ---
    def uuid(self) -> str:
        """Deterministic across replays: same run, same step, same id."""
        return f"{self.run_id}-{self.step:04d}"

    def now(self) -> datetime:
        """Wall clock as an activity, so replay sees the original time."""
        return datetime.fromisoformat(self.activity("clock", lambda: now().isoformat()))

    # ----------------------------------------------------------- the primitive
    def activity(
        self,
        name: str,
        fn: Callable[[], Any],
        *,
        side_effect: bool = False,
        retries: int = 3,
        backoff: float = 0.5,
    ) -> Any:
        """Run `fn` once, ever, for this (run, step). Replay returns the receipt.

        side_effect=True marks a step that changed the world — sending mail,
        writing a calendar entry, moving money. Those carry an idempotency key
        so a replay can never fire them twice. Read-only steps are safe to
        replay freely, which is why the flag exists at all.
        """
        self.step += 1
        step = self.step

        prior = self.store.one(
            "SELECT * FROM journal WHERE run_id=? AND step=?", self.run_id, step
        )
        if prior is not None:
            # Replayed. No call, no tokens, no duplicate send.
            self.replayed += 1
            self.tokens_saved += prior["tokens_in"] + prior["tokens_out"]
            if prior["result_ref"]:
                return json.loads(Path(prior["result_ref"]).read_text())
            return json.loads(prior["result"]) if prior["result"] else None

        self._check_budget()

        # Backoff belongs at the tool level, not the model level — tool
        # failures are both more common and more recoverable.
        started = time.time()
        last: Exception | None = None
        for attempt in range(retries):
            try:
                value = fn()
                break
            except Exception as e:  # noqa: BLE001 - recorded, then re-raised
                last = e
                if attempt == retries - 1:
                    self._journal(step, name, None, error=str(e), ms=0)
                    raise
                time.sleep(backoff * (2**attempt))
        else:  # pragma: no cover
            raise last  # type: ignore[misc]

        self.executed += 1
        # Model adapters return usage alongside their payload; record it so a
        # later replay can say what it saved rather than guessing.
        tin = tout = 0
        if isinstance(value, dict):
            tin, tout = value.get("tokens_in", 0), value.get("tokens_out", 0)
        self._journal(
            step,
            name,
            value,
            side_effect=side_effect,
            ms=int((time.time() - started) * 1000),
            tokens_in=tin,
            tokens_out=tout,
        )
        return value

    def signal_wait(self, signal: str, timeout_hours: int = 48) -> Any:
        """Park until the phone sends `signal`. Resumes on the next line.

        This is what an approval queue actually is. Not a list of pending
        items — a workflow suspended mid-flight, holding the draft, the guest
        and the reasoning, so nothing has to be rebuilt when you tap approve.
        """
        self.step += 1
        step = self.step

        prior = self.store.one(
            "SELECT result FROM journal WHERE run_id=? AND step=?", self.run_id, step
        )
        if prior is not None:
            return json.loads(prior["result"])

        deadline = (now() + timedelta(hours=timeout_hours)).isoformat()
        self.store.x(
            "INSERT OR REPLACE INTO waiting(run_id,signal,step,deadline) VALUES(?,?,?,?)",
            self.run_id,
            signal,
            step,
            deadline,
        )
        self.store.x(
            "UPDATE run SET status='suspended', cursor=? WHERE id=?", step, self.run_id
        )
        raise Suspended(self.run_id, signal)

    # --------------------------------------------------------------- internals
    def _journal(self, step, name, value, *, side_effect=False, error=None, ms=0,
                 tokens_in=0, tokens_out=0) -> None:
        blob = json.dumps(value, default=str)
        ref = None
        # Big results never enter the window. Offload, keep a handle.
        if len(blob) > 8192:
            ref = f"/tmp/blokk/{self.run_id}-{step}.json"
            Path(ref).parent.mkdir(parents=True, exist_ok=True)
            Path(ref).write_text(blob)
            blob = None
        self.store.x(
            """INSERT INTO journal(run_id,step,kind,name,input_hash,result,result_ref,
                                   side_effect,idem_key,tokens_in,tokens_out,ms)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            self.run_id, step, "error" if error else "activity", name,
            _hash(name), blob, ref, int(side_effect),
            f"{self.run_id}:{step}" if side_effect else None,
            tokens_in, tokens_out, ms,
        )

    def _check_budget(self) -> None:
        day = now().date().isoformat()
        self.store.x(
            "INSERT OR IGNORE INTO budget(workspace_id,day) VALUES(?,?)",
            self.workspace_id, day,
        )
        b = self.store.one(
            "SELECT * FROM budget WHERE workspace_id=? AND day=?", self.workspace_id, day
        )
        if b["tool_calls"] >= b["max_tool_calls"] or b["tokens"] >= b["max_tokens"]:
            raise BudgetExceeded(f"{self.workspace_id} hit its daily ceiling")
        self.store.x(
            "UPDATE budget SET tool_calls=tool_calls+1 WHERE workspace_id=? AND day=?",
            self.workspace_id, day,
        )


# ------------------------------------------------------------------- engine
class Engine:
    """Starts, resumes and signals runs. Deliberately small."""

    def __init__(self, store: Store):
        self.store = store
        self.workflows: dict[str, Callable[[Ctx, dict], Any]] = {}

    def workflow(self, name: str):
        def deco(fn):
            self.workflows[name] = fn
            return fn
        return deco

    def start(self, workflow: str, workspace_id: str, payload: dict | None = None) -> str:
        run_id = f"r_{uuid.uuid4().hex[:10]}"
        self.store.x(
            "INSERT INTO run(id,workspace_id,workflow,status,input) VALUES(?,?,?,'running',?)",
            run_id, workspace_id, workflow, json.dumps(payload or {}),
        )
        self._drive(run_id)
        return run_id

    def start_background(self, workflow: str, workspace_id: str,
                         payload: dict | None = None,
                         on_done=None) -> str:
        """Same as start(), but the caller does not wait for the workflow.

        The run row is written before this returns, so the id is real and the
        run is visible as 'running' immediately — a caller can answer, and the
        page can show it, while the model is still being read.

        Nothing about durability changes: _drive journals every step exactly
        as before, and a failure marks the run failed and resumable rather
        than vanishing with the thread.
        """
        run_id = f"r_{uuid.uuid4().hex[:10]}"
        self.store.x(
            "INSERT INTO run(id,workspace_id,workflow,status,input) VALUES(?,?,?,'running',?)",
            run_id, workspace_id, workflow, json.dumps(payload or {}),
        )

        def drive():
            try:
                self._drive(run_id)
            except Exception:                                     # noqa: BLE001
                pass          # _drive has already marked and journalled it
            finally:
                if on_done:
                    on_done()                 # the page is polling a version
        threading.Thread(target=drive, daemon=True,
                         name=f"run-{run_id}").start()
        return run_id

    def signal(self, run_id: str, signal: str, payload: Any) -> None:
        w = self.store.one("SELECT * FROM waiting WHERE run_id=?", run_id)
        if not w or w["signal"] != signal:
            raise ValueError(f"{run_id} is not waiting on {signal}")
        self.store.x(
            """INSERT INTO journal(run_id,step,kind,name,result)
               VALUES(?,?,'signal',?,?)""",
            run_id, w["step"], signal, json.dumps(payload, default=str),
        )
        self.store.x("DELETE FROM waiting WHERE run_id=?", run_id)
        self.store.x("UPDATE run SET status='running' WHERE id=?", run_id)
        self._drive(run_id)

    def sweep_deadlines(self) -> int:
        """Expire waits. A workflow parked forever is a leak you find in a year."""
        stale = self.store.q(
            "SELECT run_id, signal FROM waiting WHERE deadline < ?", now().isoformat()
        )
        for row in stale:
            self.signal(row["run_id"], row["signal"], {"expired": True})
        return len(stale)

    def resume_all(self, background: bool = False, on_done=None) -> list[str]:
        """Called on boot. Anything that was running when the power went is
        picked up here — this is the entire payoff of the journal.

        background=True because resuming is not free. Each run picks up where
        it stopped, which means model calls, which on a small Mac is a minute
        apiece — and this used to happen before the boot banner printed, so
        the whole of it was silence. Worse, it compounds: every interrupted
        sweep strands its runs as 'running', so the wait grew each time.

        The journal is what makes this safe to defer. Nothing is lost by the
        server answering first; the runs resume just the same, and the page
        shows them as running while they do.
        """
        rows = [r["id"] for r in self.store.q(
            "SELECT id FROM run WHERE status='running'")]
        if not background:
            for rid in rows:
                self._drive(rid)
            return rows

        def drive_all():
            for rid in rows:
                try:
                    self._drive(rid)
                except Exception:                                 # noqa: BLE001
                    pass       # _drive has marked and journalled it already
                if on_done:
                    on_done()
        if rows:
            threading.Thread(target=drive_all, daemon=True,
                             name="resume").start()
        return rows

    # ------------------------------------------------------------------------
    def _drive(self, run_id: str) -> None:
        run = self.store.one("SELECT * FROM run WHERE id=?", run_id)
        fn = self.workflows[run["workflow"]]
        ctx = Ctx(self.store, run_id, run["workspace_id"])
        try:
            result = fn(ctx, json.loads(run["input"]))
        except Suspended:
            # Parked, not finished. Persist what it got through.
            self.store.x("UPDATE run SET result=? WHERE id=?",
                         json.dumps(ctx.progress, default=str), run_id)
            return
        except BudgetExceeded as e:
            self.store.x(
                "UPDATE run SET status='killed', result=?, ended_at=? WHERE id=?",
                json.dumps({"stopped": str(e)}), now().isoformat(), run_id)
            return
        except Exception as e:          # noqa: BLE001
            self.store.x(
                "UPDATE run SET status='failed', result=?, ended_at=? WHERE id=?",
                json.dumps({**ctx.progress, "error": str(e)}, default=str),
                now().isoformat(), run_id)
            raise
        self.store.x(
            "UPDATE run SET status='done', result=?, ended_at=? WHERE id=?",
            json.dumps({**ctx.progress, **(result or {})}, default=str),
            now().isoformat(), run_id)

    # ---------------------------------------------------------------- reading
    def stats(self, run_id: str) -> dict:
        j = self.store.q("SELECT * FROM journal WHERE run_id=? ORDER BY step", run_id)
        return {
            "steps": len(j),
            "writes": sum(r["side_effect"] for r in j),
            "tokens": sum(r["tokens_in"] + r["tokens_out"] for r in j),
            "ms": sum(r["ms"] for r in j),
        }
