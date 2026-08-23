"""
Connectors.

The contract, and the reason it's shaped like this:

  * A connector NEVER holds a secret. It is handed a resolved credential by
    the control plane at call time. The database stores a keychain_ref, not
    a password, so `cat blokk.db | strings` gets you nothing.

  * A connector is read-only unless it declares `writes = True`, and a
    writing connector is only ever called from inside
    ctx.activity(..., side_effect=True) so the call carries an idempotency
    key and lands in the journal.

  * Reads return plain dicts. No connector returns prose. Anything that came
    from outside your control — an email body, a web page — is handed to
    quarantine_read before it can reach a model.

  * Search, don't list. Every read takes a filter and a limit. An agent that
    pulls 340 messages to find one has spent its context and, on a
    memory-bound box, another worker's cache.

Order of adoption matters more than which one you start with:

    1. read-only, for a fortnight, with nothing wired to a write path
    2. read the logs. Look at what it actually pulled and how much
    3. only then let a category start proposing

Registered connectors are resolved per workspace, so Cottages cannot reach
Business two's mailbox even if something asks it to — the credential simply
is not in scope.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class Connector(Protocol):
    kind: str
    writes: bool

    def check(self) -> dict:
        """Prove the credential works and say what it can see.

        Run by `python3 connect.py test`. A connector that cannot answer this
        has no business being in a nightly sweep.
        """
        ...


def read_since(fn, since, now, limit: int = 50) -> list:
    """Call a reader with the window it understands.

    The three readers disagree about how to say "recent": LocalMail counts
    days or an ISO hour string, IcloudMail counts hours, Messages counts
    hours, the sample world wants a positional string. Calling them all the
    same way meant a TypeError on one and a silent twelve-hour window on the
    rest — and twelve hours of a quiet mailbox is indistinguishable from an
    empty one.

    `since` and `now` are passed in rather than read from the clock, because
    one of the two callers is a workflow and workflows do not get a clock.
    """
    import inspect
    import math
    try:
        args = inspect.signature(fn).parameters
    except (TypeError, ValueError):                    # a builtin, or a mock
        args = {}
    kw: dict = {}
    if "limit" in args:
        kw["limit"] = limit
    # Ceiling of the real gap, not floor-plus-one. The fudge turned a
    # twenty-four hour window into twenty-five hours, and then the day
    # rounding turned that into two days — so every nightly sweep re-read
    # the whole of the previous night, triaged it again, and spent a second
    # night's tokens doing it.
    secs = max(1.0, (now - since).total_seconds())
    if "days" in args:
        kw["days"] = max(1, math.ceil(secs / 86400))
    elif "hours" in args:
        kw["hours"] = max(1, math.ceil(secs / 3600))
    elif "hour" in args:
        kw["hour"] = since.strftime("%Y-%m-%dT%H")
    return list(fn(**kw))


@dataclass
class Registry:
    """Which connectors a workspace may use. Scope is data, not prompt."""

    _by_ws: dict[str, dict[str, Any]] = field(default_factory=dict)

    def add(self, workspace_id: str, name: str, conn: Any) -> None:
        self._by_ws.setdefault(workspace_id, {})[name] = conn

    def get(self, workspace_id: str, name: str) -> Any | None:
        return self._by_ws.get(workspace_id, {}).get(name)

    def for_workspace(self, workspace_id: str) -> dict[str, Any]:
        return dict(self._by_ws.get(workspace_id, {}))

    def describe(self) -> list[dict]:
        return [
            {"workspace": ws, "name": n, "kind": c.kind,
             "writes": getattr(c, "writes", False)}
            for ws, m in self._by_ws.items() for n, c in m.items()
        ]


REGISTRY = Registry()


def wire(store) -> Registry:
    """Build the registry from the credential table.

    Anything without a credential row falls back to the fake world, so a
    half-configured install still runs end to end instead of erroring at
    04:00 with nobody watching.
    """
    from core.connectors.fake import WORLD as FAKE

    for row in store.q("SELECT * FROM credential"):
        ws, kind, ref = row["workspace_id"], row["kind"], row["keychain_ref"]
        try:
            if kind == "imap":
                from core.connectors.imap_mail import IcloudMail
                REGISTRY.add(ws, "mail", IcloudMail(ref))
            elif kind == "caldav":
                from core.connectors.caldav_cal import IcloudCalendar
                REGISTRY.add(ws, "calendar", IcloudCalendar(ref))
            elif kind == "maildir":
                from core.connectors.emlx_mail import LocalMail
                REGISTRY.add(ws, "mail", LocalMail())
            elif kind == "ical":
                from core.connectors.ical import LocalCalendar
                REGISTRY.add(ws, "calendar", LocalCalendar())
            elif kind == "messages":
                from core.connectors.messages import AppleMessages
                REGISTRY.add(ws, "messages", AppleMessages())
            elif kind == "weather":
                # The only connector that reaches off the machine, so it is
                # the only one handed the store and the workspace: both are
                # what core/egress.py needs to answer "may this workspace
                # talk to that host".
                from core.connectors.weather import Weather
                REGISTRY.add(ws, "weather",
                             Weather(ref, store=store, workspace_id=ws))
        except Exception as e:                                   # noqa: BLE001
            # A broken connector must not take the sweep with it. Log and
            # fall through to the fake, so the other four still run.
            print(f"[blokk] {ws}/{kind} unavailable: {e}")

    # The sample world fills gaps, but only for the sample workspaces, and
    # only while they still exist. Registering it unconditionally meant that
    # deleting "cottages" and later creating a real workspace with that name
    # handed it invented guests for anything not yet wired — fake data
    # appearing inside real data, which is the one place it must never be.
    live = {w["id"] for w in store.q("SELECT id FROM workspace WHERE active=1")}
    for ws, world in FAKE.items():
        if ws not in live:
            continue
        for name, obj in world.items():
            if obj is not None and REGISTRY.get(ws, name) is None:
                REGISTRY.add(ws, name, obj)
    return REGISTRY
