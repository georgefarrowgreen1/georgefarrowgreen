"""What Blokk may touch. One ledger, and every door checks it.

Blokk touches things that are not its own: Mail's archive, Calendar's
events, Messages' history, and a short list of hosts on the internet. Until
now each door kept its own book — the egress allowlist was a JSON list in
`setting`, the local apps were governed by nothing but whether a source
happened to be wired, and writing into Calendar was governed by macOS's own
dialog and nothing of Blokk's. Three regimes for one question, and two of
them invisible.

So there is one table, and one question it answers: may Blokk do *this verb*
to *this subject*? A row is (realm, subject, verb, state):

    app  Mail      read    allow
    app  Calendar  write   ask
    net  api.open-meteo.com  reach  allow

Three states, and the third is the point:

  * **allow** — a person said yes, and the row says when and where.
  * **block** — a person said no. Not the same as never-asked: a block is
    kept, and the thing that wanted in is told it was refused by name.
  * **ask** — nobody has decided. Everything starts here. An attempt while
    undecided is refused *and recorded on the row* — the count and the last
    reason — so the permissions panel can say "Calendar write: asked for
    twice, last by the diary" instead of a silent failure at 04:00.

Rules that keep this honest:

  * **Only 'allow' opens the door.** 'ask' refuses exactly as hard as
    'block'; the difference is what the refusal says and what the panel
    shows. There is no state that means "probably fine".

  * **The gate never decides.** `require()` raises `Denied` with a sentence
    naming the subject and the fix; the caller chooses what a refusal means
    for it — the diary falls back to the .ics file, the sweep drops a
    source and says so. Nothing here has an opinion about that.

  * **Changeable at any time, in both directions.** An allow can become a
    block a week later and the door shuts on the next attempt — the gate
    reads the table per call and caches nothing.

  * **A person grants; the model proposes.** The panel and setup write this
    table directly, because a person clicking a named toggle is the
    approval. The model's route is the pinned `app_allow` / `app_block`
    actions, which queue like everything else it proposes.

The migration in `adopt()` is deliberately gentle: a Mac that wired its
mail before this table existed already had a person type that wiring in, so
the apps its sources point at arrive as 'allow', marked `wired` — going
dark on update would punish the people who trusted this first. Calendar
*write* is never seeded: reading a calendar was consented to, writing into
it was not, and the first hold after the update asks.
"""
from __future__ import annotations

APP, NET = "app", "net"
READ, WRITE, REACH = "read", "write", "reach"
ALLOW, BLOCK, ASK = "allow", "block", "ask"
STATES = (ALLOW, BLOCK, ASK)

# The apps on this Mac that Blokk knows how to touch, and every verb it
# could ever want. This is the whole surface: a connector for a new app
# starts by adding a row here, or the gate has never heard of it and
# refuses. `where` is what the verb actually touches, in the panel's words,
# because "read" is an abstraction and a path is not.
APPS = (
    dict(app="Mail", verbs=(READ,),
         what="the messages Mail.app has already downloaded",
         where="~/Library/Mail, read from disk. Nothing is marked, moved "
               "or sent."),
    dict(app="Calendar", verbs=(READ, WRITE),
         what="your calendars — and, separately, putting events in them",
         where="~/Library/Calendars read from disk; writes go through "
               "Calendar.app itself, which shows its own macOS dialog the "
               "first time."),
    dict(app="Messages", verbs=(READ, WRITE),
         what="your iMessage and SMS history — and, separately, sending a "
              "text you approved",
         where="~/Library/Messages/chat.db read-only for reading; sends go "
               "through Messages.app itself, which shows its own macOS "
               "dialog the first time, and only ever from your approval "
               "queue."),
)


def known(app: str) -> dict | None:
    """The registry row for an app, by any spelling a person uses."""
    want = str(app or "").strip().lower().removesuffix(".app")
    for row in APPS:
        if row["app"].lower() == want:
            return row
    return None


class Denied(Exception):
    """Carries a sentence naming the subject, the state and the fix."""


def _adopt(store) -> None:
    """Move the two older regimes into the table, once.

    Runs at the top of every read and costs one SELECT after the first
    time. Two moves, both stated:

      * the egress allowlist — the JSON list in `setting` becomes net
        rows. The old key is renamed rather than deleted, so a database
        opened by an older Blokk falls back to an empty list (refusing
        everything) instead of a stale one.

      * already-wired local sources — a credential row pointing at Mail's
        or Calendar's or Messages' own store was typed in by a person, so
        the app it names arrives as allow, marked `wired`. Only read:
        nobody consented to writes by wiring a reader.
    """
    if store.one("SELECT 1 FROM setting WHERE key='permission_adopted'"):
        return
    row = store.one("SELECT value FROM setting WHERE key='egress_allow'")
    if row:
        import json
        try:
            hosts = list(json.loads(row["value"] or "[]"))
        except (ValueError, TypeError):
            hosts = []
        for h in hosts:
            store.x("INSERT OR IGNORE INTO permission"
                    "(realm,subject,verb,state,decided_by) "
                    "VALUES(?,?,?,?,?)",
                    NET, str(h).strip().lower(), REACH, ALLOW, "wired")
        store.x("UPDATE setting SET key='egress_allow_before_permission' "
                "WHERE key='egress_allow'")
    # Which apps the existing sources already read. "local" (or empty, or
    # "default") is the word connect.py has always used for the Apple app's
    # own store; a real path is somebody's exported folder, which is a
    # folder, not an app, and needs no app permission.
    kind_app = {"maildir": "Mail", "ical": "Calendar", "messages": "Messages"}
    for r in store.q("SELECT kind, keychain_ref FROM credential"):
        app_name = kind_app.get(r["kind"])
        local = str(r["keychain_ref"] or "").strip().lower() \
            in ("", "local", "default")
        if app_name and (local or r["kind"] == "messages"):
            store.x("INSERT OR IGNORE INTO permission"
                    "(realm,subject,verb,state,decided_by) "
                    "VALUES(?,?,?,?,?)", APP, app_name, READ, ALLOW, "wired")
    store.x("INSERT OR REPLACE INTO setting(key,value) "
            "VALUES('permission_adopted','1')")


def state(store, realm: str, subject: str, verb: str) -> str:
    """allow, block, or ask. An absent row is ask — nobody has decided."""
    _adopt(store)
    row = store.one("SELECT state FROM permission WHERE realm=? AND "
                    "subject=? AND verb=?", realm, subject, verb)
    got = row["state"] if row else ASK
    return got if got in STATES else ASK


def require(store, realm: str, subject: str, verb: str, why: str = "") -> None:
    """The gate. Returns quietly on allow; raises Denied on anything else.

    A refusal is recorded on the row it wanted — count, time, and the
    caller's stated reason — whether the state was ask or block. That
    record is what turns "it silently does not work" into a line on the
    permissions panel that says who has been knocking.
    """
    got = state(store, realm, subject, verb)
    if got == ALLOW:
        return
    knock(store, realm, subject, verb, why)
    doing = {READ: "read", WRITE: "write into", REACH: "reach"}.get(verb, verb)
    if got == BLOCK:
        raise Denied(
            f"{subject} is blocked: you decided Blokk may not {doing} it. "
            f"Change that in Permissions if you meant to.")
    raise Denied(
        f"nobody has decided whether Blokk may {doing} {subject}. The "
        f"attempt is recorded in Permissions — allow or block it there.")


def knock(store, realm, subject, verb, why) -> None:
    """One refused attempt, recorded on the row that refused it.

    The count collapses attempts within the same hour into one, because the
    gate sits on paths that run per request: an undecided Mail is re-refused
    by every sweep and every page load, and "asked 4,812 times" on the
    panel reads as a bug, not a fact. What the number means is *occasions
    of wanting* — a morning, a sweep, a session — which is the number a
    person deciding actually weighs.
    """
    reason = " ".join(str(why or "").split())[:200]
    fresh = store.x(
        "UPDATE permission SET asks=asks+1, last_asked=datetime('now'), "
        "why=CASE WHEN ?='' THEN why ELSE ? END "
        "WHERE realm=? AND subject=? AND verb=? AND "
        "(last_asked IS NULL OR last_asked <= datetime('now','-1 hour'))",
        reason, reason, realm, subject, verb)
    if fresh:
        return
    touched = store.x(
        "UPDATE permission SET last_asked=datetime('now'), "
        "why=CASE WHEN ?='' THEN why ELSE ? END "
        "WHERE realm=? AND subject=? AND verb=?",
        reason, reason, realm, subject, verb)
    if not touched:
        store.x("INSERT OR IGNORE INTO permission"
                "(realm,subject,verb,state,why,asks,last_asked) "
                "VALUES(?,?,?,?,?,1,datetime('now'))",
                realm, subject, verb, ASK, reason)


def set_state(store, realm: str, subject: str, verb: str, new: str,
              by: str = "panel") -> dict:
    """One decision, written. The only way a state changes."""
    _adopt(store)
    new = str(new or "").strip().lower()
    if new not in STATES:
        return {"error": f"{new!r} is not a state. It is allow, block or ask."}
    if realm == APP:
        row = known(subject)
        if not row:
            names = ", ".join(a["app"] for a in APPS)
            return {"error": f"{subject!r} is not an app Blokk knows how to "
                             f"touch. It knows: {names}."}
        subject = row["app"]
        if verb not in row["verbs"]:
            return {"error": f"Blokk cannot {verb} {subject} at all — there "
                             f"is nothing to {new}."}
    elif realm == NET:
        subject = str(subject or "").strip().lower().lstrip("*.").rstrip(".")
        verb = REACH
        if not subject or "/" in subject or " " in subject:
            return {"error": f"{subject!r} is not a hostname"}
    else:
        return {"error": f"{realm!r} is not a realm. It is app or net."}
    store.x("INSERT INTO permission(realm,subject,verb,state,decided_by,"
            "changed_at) VALUES(?,?,?,?,?,datetime('now')) "
            "ON CONFLICT(realm,subject,verb) DO UPDATE SET "
            "state=excluded.state, decided_by=excluded.decided_by, "
            "changed_at=excluded.changed_at",
            realm, subject, verb, new, by)
    doing = {READ: "read", WRITE: "write into", REACH: "reach"}.get(verb, verb)
    said = {ALLOW: f"Blokk may now {doing} {subject}",
            BLOCK: f"Blokk may not {doing} {subject}, and will say so "
                   f"rather than try",
            ASK: f"{subject} {verb} is undecided again — the next attempt "
                 f"will knock"}[new]
    return {"ok": True, "realm": realm, "subject": subject, "verb": verb,
            "state": new, "detail": said + ". Changeable any time in "
                                           "Permissions."}


def net_hosts(store) -> list[str]:
    """Every host with an allow row. What the egress gate matches against."""
    _adopt(store)
    return [r["subject"] for r in store.q(
        "SELECT subject FROM permission WHERE realm=? AND verb=? AND "
        "state=? ORDER BY subject", NET, REACH, ALLOW)]


def listing(store) -> dict:
    """Everything, for the panel: every knowable app door and every host.

    Apps come from the registry, not just from rows — a door nobody has
    knocked on yet still appears, as 'ask', because a permissions panel
    that only lists what already happened cannot be used to decide first.
    """
    _adopt(store)
    rows = {(r["realm"], r["subject"], r["verb"]): dict(r) for r in store.q(
        "SELECT * FROM permission")}
    apps = []
    for a in APPS:
        for verb in a["verbs"]:
            r = rows.get((APP, a["app"], verb), {})
            apps.append({"app": a["app"], "verb": verb,
                         "state": r.get("state", ASK),
                         "what": a["what"], "where": a["where"],
                         "asks": r.get("asks", 0),
                         "last_asked": r.get("last_asked"),
                         "why": r.get("why", ""),
                         "decided_by": r.get("decided_by", "")})
    net = [{"host": r["subject"], "state": r["state"],
            "asks": r["asks"], "last_asked": r["last_asked"],
            "why": r["why"], "decided_by": r["decided_by"]}
           for (realm, _s, _v), r in sorted(rows.items())
           if realm == NET]
    return {"apps": apps, "net": net}


def wants(store) -> list[dict]:
    """The doors something has knocked on and nobody has answered.

    Only 'ask' rows with attempts: a block that keeps being tried is a
    decision working, not a question — it stays on the panel, off the
    morning brief.
    """
    _adopt(store)
    return [dict(r) for r in store.q(
        "SELECT realm,subject,verb,asks,last_asked,why FROM permission "
        "WHERE state=? AND asks>0 ORDER BY last_asked DESC", ASK)]
