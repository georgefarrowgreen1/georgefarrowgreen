"""What Blokk may do to itself, and the only place that says so.

Ask cannot write. That is invariant 2 and it has not changed: `core/ask.py`
has no executor in it and no way to reach one. What Ask can do is *propose* —
it writes one undecided row into the approval queue, and a person decides.
This file is the other half: given an approved row, what actually runs.

So the shape is:

    Ask                -> proposes {name, args}, validated here, into approval
    a person           -> approves, edits or rejects it, in the queue
    api/server.py      -> on approve only, calls run() below

Three rules hold the whole thing up.

**Nothing here touches the outside world.** Every action operates on Blokk:
its workspaces, its sources, its allowlist, its schedule, its backups. There
is no send. Sending needs a connector that does not exist yet and it will
arrive the same way as everything else — behind this queue — not through the
chat box. An agent that can talk to your guests is a different product with a
different risk, and it is not one you get by accident.

**The arguments are validated here, not trusted from the model.** A proposal
arrives as JSON that a language model wrote after reading, among other
things, a stranger's email. It is treated exactly like a form submission from
the internet: every field checked against what it is allowed to be, and
anything unrecognised refused with a sentence rather than passed along.

**Some of them never graduate.** The trust ledger can earn a category the
right to act alone. Opening a hole in the egress allowlist, deleting a
workspace and removing a source are pinned to manual for the same reason a
cottage access question is: the cost of being wrong does not scale with how
often you have been right.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Callable

ID = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
# A name with at least one dot and nothing that belongs in a URL. Deliberately
# not a URL parser: core/egress.py does the real work of deciding what may be
# reached, and this only has to stop a sentence being built around nonsense.
HOSTNAME = re.compile(r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                      r"(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", re.I)
CLOCK = re.compile(r"^\s*(\d{1,2})\s*(?::\s*([0-5]\d))?\s*([ap])\.?m\.?\s*$", re.I)


def _as_time(v: str) -> str:
    """6pm, 6:30 PM, 06:30 — all of them, as HH:MM."""
    m = CLOCK.match(v)
    if not m:
        return v.strip()
    h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "p" else 0)
    return f"{h:02d}:{m.group(2) or '00'}"


class _Gap(dict):
    def __missing__(self, key):
        return "\u2026"


class Rejected(Exception):
    """The proposal is not something that can be run. Carries a sentence."""


@dataclass
class Action:
    name: str
    summary: str                      # a sentence, with {args} in it
    args: tuple[str, ...] = ()
    optional: tuple[str, ...] = ()
    pinned: bool = False              # never graduates to acting alone
    category: str = "blokk_admin"     # the trust bucket it counts toward
    run: Callable[..., dict] = field(default=lambda **kw: {})
    # An optional sentence-builder, for the actions whose arguments are
    # jargon. "Wire maildir into cottages, reading local" is accurate and
    # means nothing to the person whose thumb is over Approve, and that
    # sentence is the entire decision they are being asked to make.
    phrase: Callable[[dict], str] | None = None

    def preview(self, args: dict) -> str:
        if self.phrase is not None:
            try:
                return self.phrase(args)
            except Exception:                                    # noqa: BLE001
                pass
        try:
            return self.summary.format(**args)
        except KeyError:
            return self.summary

    def sketch(self, args: dict) -> str:
        """The same sentence with the holes still in it.

        For saying "I can do this much, and here is the bit I am missing",
        which is a better answer than either guessing the bit or pretending
        the request was a question about something else.
        """
        return self.summary.format_map(_Gap(args))


# ────────────────────────────────────────────────────────────── the executors
# Each one is a thin call into the same core/ module the CLI and the GUI use.
# Nothing new is implemented here: if connect.py cannot do it, neither can a
# proposal, which keeps the three surfaces honest about being one system.
def _sweep(store, **_):
    """The same sweep the button starts, not a second implementation.

    The import points the wrong way — core reaching into api — and that is
    deliberate. sweep_all() owns one rule this cannot duplicate: a sweep is a
    daily event, keyed by the day, so the Mac and the phone both pressing it
    at 04:00 start one run per workspace and not two. A copy of that rule
    living here would be a second opinion about whether today was already
    swept, and the two would eventually disagree. force=True because a person
    has just approved it by name, which is the manual override.
    """
    from api import server
    out = server.sweep_all(force=True)
    n = len(out.get("started", []))
    return {"ok": True, "detail": f"sweeping {n} workspace"
            f"{'' if n == 1 else 's'}", **out}


def _backup(store, **_):
    from core import backup
    out = backup.make(store.path)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": f"backup written to {out.get('path')}", **out}


def _schedule(store, at, **_):
    from core import nightly
    try:
        value = nightly.set_at(store, at)
    except ValueError as e:
        # set_at refuses an unparseable time rather than storing it, and its
        # sentence already names the shape it wanted.
        raise Rejected(str(e)) from e
    return {"ok": True, "at": value,
            "detail": (f"the night shift now runs at {value}" if value
                       else "the night shift is off")}


def _add_source(store, workspace, kind, ref, **_):
    from core import sources
    out = sources.add(store, workspace, kind, ref)
    if out.get("error"):
        raise Rejected(out["error"])
    # The same sentence the proposal was approved under, so what it says it
    # did matches what it said it would do. "maildir added to cottages" is
    # neither.
    return {"ok": True, **out,
            "detail": out.get("note")
            or ACTIONS["add_source"].preview(
                {"workspace": workspace, "kind": kind, "ref": ref})}


def _remove_source(store, workspace, kind, **_):
    from core import sources
    out = sources.remove(store, workspace, kind)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, **out}


def _egress_allow(store, workspace, host, **_):
    from core import egress
    out = egress.allow(store, workspace, host)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _egress_deny(store, workspace, host, **_):
    from core import egress
    out = egress.disallow(store, workspace, host)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": out["detail"]}


def _add_workspace(store, workspace, name=None, **_):
    from core import sources
    out = sources.workspace_add(store, workspace, name or workspace)
    if out.get("error"):
        raise Rejected(out["error"])
    return {"ok": True, "detail": f"workspace {workspace} added", **out}


def _remember(store, workspace, note, **_):
    """A standing instruction, taught rather than inferred.

    Memory could only fill from corrections: you edited three drafts the same
    way and a rule was derived. That works and it is slow, and it cannot
    learn anything you have not already watched it get wrong — "the key safe
    is on the back door, not the porch" is not a correction to a draft, it is
    something you know.

    Confidence is fixed at 0.9 and deliberately below certainty. You said it
    once; a derived rule with five corrections behind it earns 0.94 and
    should outrank it. Nothing here is retired automatically, because a
    person's own words are not evidence that expires.
    """
    from core.harness import MIN_CONFIDENCE
    note = " ".join(note.split())
    if len(note) < 4:
        raise Rejected("that is too short to be worth remembering")
    fid = "f_told_" + hashlib.sha256(
        f"{workspace}:{note.lower()}".encode()).hexdigest()[:10]
    already = store.one("SELECT id FROM fact WHERE id=?", fid)
    store.x("""INSERT OR REPLACE INTO fact
               (id,workspace_id,text,confidence,source_episodes,retired_at)
               VALUES(?,?,?,?,'[]',NULL)""",
            fid, workspace, note, max(0.9, MIN_CONFIDENCE))
    return {"ok": True, "id": fid,
            "detail": ("that was already remembered, and is again"
                       if already else f"remembered, for {workspace}")}


def _forget(store, workspace, note, **_):
    """Retire what it knows, by what it says.

    Matched on the text because that is what a person can see. They are
    reading a sentence in a list and asking for that sentence to stop
    applying; asking them for its id would be asking them to read the
    database.
    """
    want = " ".join(note.split()).lower()
    rows = [r for r in store.q(
        "SELECT id, text FROM fact WHERE workspace_id=? AND retired_at IS NULL",
        workspace) if want in r["text"].lower()]
    if not rows:
        raise Rejected(f"nothing it knows about {workspace} mentions "
                       f"{note!r}")
    if len(rows) > 1:
        raise Rejected(f"{len(rows)} things match {note!r}: "
                       + "; ".join(r["text"][:60] for r in rows[:3])
                       + ". Say more of the one you mean.")
    store.x("UPDATE fact SET retired_at=datetime('now') WHERE id=?",
            rows[0]["id"])
    return {"ok": True, "detail": f"forgotten: {rows[0]['text']}"}


def _remove_workspace(store, workspace, **_):
    from core import sources
    out = sources.workspace_remove(store, workspace)
    if out.get("error"):
        raise Rejected(out["error"])
    gone = sum((out.get("removed") or {}).values())
    return {"ok": True, "detail": f"{workspace} is gone, and the {gone} rows "
            f"that belonged to it", **out}


# Where a source actually reads from, said the way somebody would say it.
FROM = {
    "maildir":  "the Mail app on this Mac",
    "ical":     "the Calendar app on this Mac",
    "messages": "the Messages archive on this Mac",
}
NOUN = {"maildir": "mail", "imap": "mail", "ical": "calendar",
        "caldav": "calendar", "messages": "messages", "weather": "forecast",
        "web": "page"}


def _own(name: str) -> str:
    """cottages' mail, not cottages's mail."""
    return f"{name}'" if name.endswith(("s", "S")) else f"{name}'s"


def _say_add(a: dict) -> str:
    ws, kind, ref = a.get("workspace", ""), a.get("kind", ""), a.get("ref", "")
    noun = NOUN.get(kind, kind)
    if kind in FROM:
        where = FROM[kind] if ref.lower() in ("local", "default") else ref
        return f"Read {_own(ws)} {noun} from {where}."
    if kind == "imap":
        return (f"Read {_own(ws)} mail over IMAP, signing in with the "
                f"keychain entry {ref}.")
    if kind == "caldav":
        return (f"Read {_own(ws)} calendar over CalDAV, signing in with "
                f"the keychain entry {ref}.")
    if kind == "weather":
        return f"Get {ws} the forecast for {ref} — it sends a latitude and " \
               f"a longitude, and nothing else."
    if kind == "web":
        return f"Watch {ref} for {ws}, and let {ws} reach that one host."
    return f"Add a {kind} source to {ws}, reading {ref}."


def _say_schedule(a: dict) -> str:
    at = str(a.get("at", "")).strip().lower()
    if at in ("", "off", "never"):
        return "Turn the night shift off — nothing will sweep on its own."
    return f"Move the night shift to {a['at']}."


def _say_remove(a: dict) -> str:
    ws, kind = a.get("workspace", ""), a.get("kind", "")
    return f"Stop reading {_own(ws)} {NOUN.get(kind, kind)}."


ACTIONS: dict[str, Action] = {a.name: a for a in (
    Action("sweep_now", "Run the sweep now, across every workspace.",
           run=_sweep, category="blokk_run"),
    Action("backup_now", "Take a backup of blokk.db.",
           run=_backup, category="blokk_run"),
    Action("set_schedule", "Move the night shift to {at}.",
           args=("at",), run=_schedule, phrase=_say_schedule),
    Action("add_source", "Wire {kind} into {workspace}, reading {ref}.",
           args=("workspace", "kind", "ref"), run=_add_source,
           phrase=_say_add),
    Action("add_workspace", "Add a workspace called {workspace}.",
           args=("workspace",), optional=("name",), run=_add_workspace),
    Action("remember", "Remember, for {workspace}: {note}",
           args=("workspace", "note"), run=_remember, category="blokk_memory"),
    # Pinned. Forgetting is the one memory operation that destroys something,
    # and a rule quietly retired is a rule you go looking for later and
    # cannot find.
    Action("forget", "Stop applying what it knows about {note}, for "
                     "{workspace}.",
           args=("workspace", "note"), pinned=True, run=_forget,
           category="blokk_memory"),
    # Pinned. Each of these either opens a route out of the machine or
    # removes something that does not come back, and neither gets safer
    # because the last ninety were fine.
    Action("egress_allow", "Let {workspace} reach {host}.",
           args=("workspace", "host"), pinned=True, run=_egress_allow),
    Action("egress_deny", "Stop {workspace} reaching {host}.",
           args=("workspace", "host"), pinned=True, run=_egress_deny),
    Action("remove_source", "Remove {workspace}'s {kind} source.",
           args=("workspace", "kind"), pinned=True, run=_remove_source,
           phrase=_say_remove),
    Action("remove_workspace",
           "Delete the workspace {workspace} and everything in it.",
           args=("workspace",), pinned=True, run=_remove_workspace),
)}


# ────────────────────────────────────────────────────────────────── validation
def validate(name: str, args: dict) -> tuple[Action, dict]:
    """A proposal from a model is a form submission from the internet.

    It was written after reading a stranger's email, so every field is
    checked against what it is allowed to be. Unknown keys are dropped
    rather than passed on: an executor that receives a field nobody wrote a
    rule for is how an argument becomes an injection.
    """
    act = ACTIONS.get(str(name or "").strip())
    if act is None:
        raise Rejected(
            f"{name!r} is not something Blokk can do. It can: "
            + ", ".join(sorted(ACTIONS)) + ".")
    if not isinstance(args, dict):
        raise Rejected("the arguments have to be an object")
    clean: dict = {}
    for key in act.args + act.optional:
        if key not in args:
            if key in act.args:
                raise Rejected(f"{act.name} needs {key!r}")
            continue
        v = args[key]
        if not isinstance(v, (str, int)):
            raise Rejected(f"{key!r} has to be text")
        v = str(v).strip()
        cap = 400 if key == "note" else 200
        if len(v) > cap:
            raise Rejected(f"{key!r} is too long — {len(v)} characters, and "
                           f"the limit is {cap}")
        # Identifiers are identifiers. A workspace called "; DROP" is not one,
        # and neither is a kind that is not one of the kinds.
        if key == "workspace" and not ID.match(v):
            raise Rejected(f"{v!r} is not a workspace id")
        if key == "kind":
            from core import sources
            if v not in sources.KINDS:
                raise Rejected(f"{v!r} is not a kind. One of: "
                               + ", ".join(sources.KINDS))
        # Shapes, checked here rather than left to the executor. The executor
        # does refuse them — loudly, with a sentence — but by then the
        # proposal has been read, approved and run, and the person is being
        # told about a typo three steps after they could have fixed it. The
        # preview is also built from these, so an unchecked value put "Move
        # the night shift to tea." under an Approve button.
        if key == "at" and v.lower() not in ("", "off", "never"):
            from core import nightly
            # Normalised, not refused. Somebody typing into the edit field is
            # writing the time the way people write times, and "6pm" is not a
            # mistake — it is a time this can read perfectly well.
            v = _as_time(v)
            if nightly._hhmm(v) is None:
                raise Rejected(f"{args[key]!r} is not a time of day. It wants "
                               f"something like 04:00, or 6pm.")
        if key == "note" and len(v) < 4:
            raise Rejected("that is too short to be worth remembering")
        if key == "host":
            if not HOSTNAME.match(v):
                raise Rejected(f"{v!r} is not a hostname. It wants something "
                               f"like api.example.com.")
        clean[key] = v
    return act, clean


def propose(name: str, args: dict) -> dict:
    """The JSON that goes in approval.action. Validated before it is stored.

    Storing an invalid proposal and finding out at approval time would put
    the error message in the wrong place: the person tapping Approve did not
    write it, and by then the model that did is three turns gone.
    """
    act, clean = validate(name, args)
    return {"name": act.name, "args": clean, "preview": act.preview(clean),
            "pinned": act.pinned, "category": act.category}


def run(store, action_json: str | dict) -> dict:
    """Carry out an approved proposal. Called from the approval path only.

    Deliberately re-validates. The row has been sitting in a queue and the
    only thing that should ever reach an executor is something that passes
    the same checks it passed on the way in.
    """
    payload = action_json
    if isinstance(payload, str):
        try:
            payload = json.loads(payload or "{}")
        except ValueError as e:
            raise Rejected("this proposal's action is not readable JSON") from e
    if not payload:
        return {"ok": True, "detail": "nothing to run"}
    act, clean = validate(payload.get("name"), payload.get("args") or {})
    out = act.run(store, **clean)
    return {"ok": True, "action": act.name, **(out or {})}


def edited(action_json: str | dict, corrections) -> dict:
    """The proposal, with a person's corrections merged in and re-validated.

    The corrections come from a browser and are treated exactly like the
    model's arguments were: checked against what the named action declares,
    with anything unrecognised dropped. A person tapping Edit has more
    standing than a model, but not the standing to invent an argument the
    executor has no rule for.

    The action's *name* is not editable. Changing "back up" into "delete the
    workspace" between the sentence somebody read and the thing that runs is
    the whole class of bug this queue exists to prevent.
    """
    payload = action_json
    if isinstance(payload, str):
        try:
            payload = json.loads(payload or "{}")
        except ValueError as e:
            raise Rejected("this proposal's action is not readable JSON") from e
    if isinstance(corrections, str):
        try:
            corrections = json.loads(corrections or "{}")
        except ValueError as e:
            raise Rejected("the corrections are not readable JSON") from e
    if not isinstance(corrections, dict):
        raise Rejected("the corrections have to be an object")
    merged = {**(payload.get("args") or {}), **corrections}
    act, clean = validate(payload.get("name"), merged)
    return {"name": act.name, "args": clean, "preview": act.preview(clean),
            "pinned": act.pinned, "category": act.category}


def catalogue() -> list[dict]:
    """What Ask is told it can propose. Names and sentences, no executors."""
    return [{"name": a.name, "does": a.summary,
             "needs": list(a.args), "optional": list(a.optional),
             "always_asks": a.pinned}
            for a in ACTIONS.values()]
