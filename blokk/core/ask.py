"""
Ask.

The composer is a new door into a system that holds four businesses' mail and
credentials, so it gets one hard rule:

    Ask can read. Ask cannot write.

Not "ask asks nicely before writing" — it has no write tools at all. If you
ask it to do something, it drafts a proposal and drops it into the same
approval queue as everything else, subject to the same trust gate. There is
one write path in Blokk and the chat box is not a second one.

That matters because of the trifecta: private data, untrusted content, and a
way out. Ask holds the first two by definition. Denying it the third is the
whole defence, and it has to be structural, because you cannot prompt your
way out of prompt injection.

Two provenance rules follow:
  * your question is trusted input
  * anything a tool retrieves — an email body, a guest's name — is untrusted
    and is wrapped before it reaches the model, never spliced in as prose

Events follow the AG-UI vocabulary (RUN_STARTED, TEXT_MESSAGE_*, TOOL_CALL_*,
RUN_FINISHED) so the front end speaks a standard the rest of the ecosystem
already speaks, rather than a schema invented here.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable, Iterator

from core.harness import quarantine_read

MAX_STEPS = 4          # ask is a lookup, not a research project
MAX_ROWS = 12
MAX_TURNS_PER_DAY = 200   # chat is metered like everything else


class Overspent(Exception):
    """The day's chat allowance is gone."""


# ──────────────────────────────────────────────────────────── read-only tools
@dataclass
class ReadTool:
    name: str
    desc: str
    fn: Callable[..., object]


def build_tools(store, workspace_scope: str | None = None) -> dict[str, ReadTool]:
    """Every tool here is a SELECT. There is deliberately no INSERT in this file.

    Scope is applied in SQL, not in the prompt — an agent that is told not to
    look at another workspace will eventually look at another workspace.
    """
    def scope(sql: str, args: list) -> tuple[str, list]:
        if workspace_scope:
            sql += " AND workspace_id=?"
            args = args + [workspace_scope]
        return sql, args

    def open_approvals(**_):
        sql, args = scope(
            "SELECT id,category,title,body,workspace_id,created_at "
            "FROM approval WHERE decision IS NULL", [])
        return [dict(r) for r in store.q(sql + " ORDER BY created_at LIMIT ?",
                                         *(args + [MAX_ROWS]))]

    def recent_runs(**_):
        sql, args = scope("SELECT id,workspace_id,workflow,status,result,started_at "
                          "FROM run WHERE 1=1", [])
        return [dict(r) for r in store.q(sql + " ORDER BY started_at DESC LIMIT ?",
                                         *(args + [MAX_ROWS]))]

    def search_journal(term: str = "", **_):
        sql, args = scope(
            "SELECT j.run_id,j.step,j.name,j.side_effect,j.at FROM journal j "
            "JOIN run r ON r.id=j.run_id WHERE j.name LIKE ?", [f"%{term}%"])
        sql = sql.replace("workspace_id=?", "r.workspace_id=?")
        return [dict(r) for r in store.q(sql + " ORDER BY j.at DESC LIMIT ?",
                                         *(args + [MAX_ROWS]))]

    def what_was_handled(**_):
        sql, args = scope("SELECT category,title,decision,decided_at,workspace_id "
                          "FROM approval WHERE decision IS NOT NULL", [])
        return [dict(r) for r in store.q(sql + " ORDER BY decided_at DESC LIMIT ?",
                                         *(args + [MAX_ROWS]))]

    def trust_state(**_):
        sql, args = scope("SELECT category,clean,edited,rejected,threshold,auto,"
                          "pinned_manual,workspace_id FROM trust WHERE 1=1", [])
        return [dict(r) for r in store.q(sql, *args)]

    def learned_facts(**_):
        sql, args = scope("SELECT text,confidence FROM fact "
                          "WHERE retired_at IS NULL", [])
        return [dict(r) for r in store.q(sql + " ORDER BY confidence DESC LIMIT ?",
                                         *(args + [MAX_ROWS]))]

    tools = [
        ReadTool("open_approvals",  "what is waiting on you right now", open_approvals),
        ReadTool("what_was_handled","what it decided without you", what_was_handled),
        ReadTool("recent_runs",     "sweeps and their outcomes", recent_runs),
        ReadTool("search_journal",  "find steps by name, e.g. 'send' or 'rates'", search_journal),
        ReadTool("trust_state",     "how close each category is to acting alone", trust_state),
        ReadTool("learned_facts",   "what it has learned from your corrections", learned_facts),
    ]
    return {t.name: t for t in tools}


# ─────────────────────────────────────────────────────────────── intent
ACTIONY = re.compile(
    r"\b(send|reply|email|book|cancel|refund|pay|delete|move|reschedule|"
    r"change the (rate|price)|drop the (rate|price)|chase)\b", re.I)


def looks_like_an_instruction(q: str) -> bool:
    return bool(ACTIONY.search(q))


# ─────────────────────────────────────────────────────────────── the loop
def _meter(store, ws: str) -> tuple[bool, int]:
    """Chat draws on the same daily budget as the sweep.

    Without this the sweep is metered and the chat box is not, which is
    exactly the gap something runaway would find.
    """
    from datetime import datetime, timezone
    day = datetime.now(timezone.utc).date().isoformat()
    store.x("INSERT OR IGNORE INTO budget(workspace_id,day) VALUES(?,?)", ws, day)
    row = store.one("SELECT tool_calls, max_tool_calls FROM budget "
                    "WHERE workspace_id=? AND day=?", ws, day)
    if row["tool_calls"] >= row["max_tool_calls"]:
        return False, 0
    store.x("UPDATE budget SET tool_calls=tool_calls+1 "
            "WHERE workspace_id=? AND day=?", ws, day)
    return True, row["max_tool_calls"] - row["tool_calls"] - 1


def ask(store, question: str, model, workspace: str | None = None) -> Iterator[dict]:
    """Yields AG-UI shaped events. Never writes. Never sends."""
    okay, left = _meter(store, workspace or "cottages")
    if not okay:
        yield {"type": "RUN_STARTED", "scope": workspace or "all workspaces"}
        yield {"type": "TEXT_MESSAGE_START"}
        yield {"type": "TEXT_MESSAGE_CONTENT",
               "delta": "That is today's chat allowance used up. It resets at "
                        "midnight, or raise max_tool_calls in the budget table. "
                        "Nothing is broken — this is the ceiling doing its job."}
        yield {"type": "TEXT_MESSAGE_END"}
        yield {"type": "RUN_FINISHED", "steps": 0, "budget_left": 0}
        return
    yield {"type": "RUN_STARTED", "scope": workspace or "all workspaces",
           "budget_left": left}

    tools = build_tools(store, workspace)

    # An instruction is not a question. Rather than refusing, route it to the
    # one path that can act — the approval queue — so the answer is still
    # useful and the invariant still holds.
    if looks_like_an_instruction(question):
        yield {"type": "TEXT_MESSAGE_START"}
        for chunk in _stream(
            "I can look things up, but I can't send or change anything from here — "
            "there's one write path in Blokk and it runs through the approval queue. "
            "I can put this in front of you as a proposal instead, and it'll carry the "
            "same trust rules as everything else."):
            yield {"type": "TEXT_MESSAGE_CONTENT", "delta": chunk}
        yield {"type": "TEXT_MESSAGE_END"}
        yield {"type": "PROPOSAL", "text": question.strip(),
               "note": "Queued as a proposal — it will appear with tonight's items."}
        yield {"type": "RUN_FINISHED", "steps": 0}
        return

    # Pick the reads that could answer this. A tiny router, not a model call —
    # six tools do not need an LLM to choose between them.
    picked = _route(question, tools)
    gathered = []
    for name in picked[:MAX_STEPS]:
        t = tools[name]
        yield {"type": "TOOL_CALL_START", "name": name, "desc": t.desc}
        rows = t.fn(term=_term(question))
        yield {"type": "TOOL_CALL_END", "name": name, "rows": len(rows)}
        gathered.append((name, rows))

    # Anything retrieved is untrusted. Wrap it; never let it read as instruction.
    context = []
    for name, rows in gathered:
        safe = []
        for r in rows:
            row = dict(r)
            for k, v in row.items():
                if isinstance(v, str) and len(v) > 40:
                    q = quarantine_read(v)
                    row[k] = v[:400]
                    if q["instruction_like"]:
                        row["_flagged"] = True
            safe.append(row)
        context.append({"tool": name, "rows": safe})

    yield {"type": "TEXT_MESSAGE_START"}
    answer = model.answer(question, context) if hasattr(model, "answer") \
        else _fallback(question, context)
    for chunk in _stream(answer):
        yield {"type": "TEXT_MESSAGE_CONTENT", "delta": chunk}
    yield {"type": "TEXT_MESSAGE_END"}

    yield {"type": "SOURCES", "rows": [{"tool": n, "count": len(r)} for n, r in gathered]}
    yield {"type": "RUN_FINISHED", "steps": len(gathered), "budget_left": left}


def _term(q: str) -> str:
    words = [w for w in re.findall(r"[a-z]{4,}", q.lower())
             if w not in {"what", "when", "which", "does", "have", "with", "that",
                          "this", "from", "about", "there", "anything", "today"}]
    return words[0] if words else ""


def _route(q: str, tools: dict) -> list[str]:
    ql = q.lower()
    picks = []
    if any(w in ql for w in ("wait", "queue", "approve", "decide", "need me", "pending")):
        picks.append("open_approvals")
    if any(w in ql for w in ("handle", "alone", "without me", "auto", "did it")):
        picks.append("what_was_handled")
    if any(w in ql for w in ("run", "sweep", "overnight", "last night", "fail", "crash")):
        picks.append("recent_runs")
    if any(w in ql for w in ("trust", "graduat", "act alone", "autonom", "close")):
        picks.append("trust_state")
    if any(w in ql for w in ("learn", "remember", "know about", "fact", "rule")):
        picks.append("learned_facts")
    if any(w in ql for w in ("step", "journal", "when did", "history", "log")):
        picks.append("search_journal")
    return picks or ["open_approvals", "recent_runs"]


def _fallback(question: str, context: list) -> str:
    """Deterministic answer from the rows. No weights required.

    Deliberately says what it read. An ungrounded assistant over your own data
    is worse than none — you cannot tell a summary from an invention.
    """
    parts = []
    for c in context:
        rows, tool = c["rows"], c["tool"]
        if tool == "open_approvals":
            parts.append(f"{len(rows)} thing{'' if len(rows)==1 else 's'} waiting on you"
                         + (": " + "; ".join(r["category"].replace("_", " ") for r in rows[:4])
                            if rows else "."))
        elif tool == "what_was_handled":
            auto = [r for r in rows if r["decision"] == "auto"]
            parts.append(f"{len(auto)} handled without you, {len(rows)-len(auto)} you decided.")
        elif tool == "recent_runs":
            bad = [r for r in rows if r["status"] in ("failed", "killed")]
            parts.append(f"{len(rows)} runs; "
                         + (f"{len(bad)} did not finish." if bad else "all finished."))
        elif tool == "trust_state":
            close = [r for r in rows if not r["auto"] and not r["pinned_manual"]
                     and r["threshold"] - r["clean"] <= 3]
            parts.append("closest to acting alone: " + ", ".join(
                f"{r['category'].replace('_',' ')} ({r['threshold']-r['clean']} to go)"
                for r in close) if close else "nothing is close to graduating.")
        elif tool == "learned_facts":
            parts.append("it has learned: " + "; ".join(r["text"] for r in rows[:3])
                         if rows else "nothing learned yet.")
        elif tool == "search_journal":
            parts.append(f"{len(rows)} matching steps in the journal.")
        if any(r.get("_flagged") for r in rows):
            parts.append("One of those rows contains text that looks like an instruction. "
                         "It was quarantined and I read it as data.")
    return " ".join(parts) or "Nothing matched."


def _stream(text: str, size: int = 3):
    """Chunked so the front end can render token-by-token."""
    words = text.split(" ")
    for i in range(0, len(words), size):
        yield (" " if i else "") + " ".join(words[i:i + size])
