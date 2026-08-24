"""Updating on its own, without becoming a machine you cannot pin down.

`update.sh` says why this did not exist: "a machine that quietly fetches code
is a machine whose behaviour you cannot pin to a moment, and 'nothing leaves
the machine' should mean nothing, including a version ping. You update when
you say so."

Every word of that is still true, and none of it rules out automatic
updating — it rules out *silent* updating. So the principle is kept and the
feature is built on top of it:

  * **Off until you turn it on.** The default is exactly what it was. A
    machine nobody has configured behaves as it did before this file existed
    and makes no network call it was not asked to make. Turning it on is
    "saying so", once, durably.

  * **The moment is written down.** That is the whole of the objection, and
    it has an answer: every check and every apply appends to
    `logs/update.log` with a timestamp, the commit before, the commit after
    and what moved. The dashboard reads the same record. "When did this
    change" is answerable to the minute.

  * **A schema change is never applied on its own.** It is the one update
    that touches your data, and the one where being wrong is expensive. It
    is fetched, reported, and left for a person — the same shape as a pinned
    action in the approval queue, for the same reason.

  * **Nothing is applied over your edits.** A dirty tree stops it, as it
    stops `update.sh`.

  * **There is a way back.** The commit that was current before the apply is
    recorded, so a bad update has a documented undo rather than a
    reconstruction.

What is deliberately absent: no "update to the newest thing on any branch",
no applying a fast-forward that is not one, and no restarting mid-sweep. A
restart is a separate step, taken when nothing is running.
"""
from __future__ import annotations

import json
import subprocess
import threading
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "logs" / "update.log"

# The setting, and its three positions. "off" is not a value anybody has to
# write: an unset key reads as off, so a database from before this existed
# behaves as it did.
KEY = "autoupdate"
OFF, NOTIFY, APPLY = "off", "notify", "apply"
MODES = (OFF, NOTIFY, APPLY)

# How often it is allowed to ask. Once a day is a real answer to "is there
# an update" and not a background process anybody notices; anything faster
# is a version ping wearing a schedule.
EVERY_HOURS = 24
CHECKED_KEY = "autoupdate:checked"
LAST_KEY = "autoupdate:last"


def _git(*args, timeout=60) -> tuple[int, str]:
    """git, in the repo, never interactive.

    GIT_TERMINAL_PROMPT=0 matters: a fetch that decides to ask for a
    password on a headless Mac at 04:00 hangs the thread it is on, and the
    only symptom is a scheduler that stopped.
    """
    try:
        p = subprocess.run(("git",) + args, cwd=str(ROOT), timeout=timeout,
                           capture_output=True, text=True,
                           env={"GIT_TERMINAL_PROMPT": "0", "PATH":
                                "/usr/bin:/bin:/usr/local/bin"})
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except (OSError, subprocess.SubprocessError) as e:
        return 1, f"{type(e).__name__}: {e}"


def mode(store) -> str:
    """What this Mac has been told to do. Unset is off."""
    row = store.one("SELECT value FROM setting WHERE key=?", KEY)
    got = (row["value"] if row else "") or OFF
    return got if got in MODES else OFF


def set_mode(store, value: str) -> str:
    if value not in MODES:
        raise ValueError(f"mode must be one of {', '.join(MODES)}")
    store.x("INSERT INTO setting(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", KEY, value)
    _note("mode", {"set_to": value})
    return value


def _note(event: str, detail: dict) -> None:
    """One line per thing that happened, in the order it happened.

    This is the file that answers the objection in update.sh's header. It is
    append-only and small — a line a day at the rate this is allowed to run
    — and it holds no content from anywhere: a commit subject is this
    project's own text, written by whoever wrote the commit.
    """
    line = json.dumps({"at": datetime.now().astimezone().isoformat(timespec="seconds"),
                       "event": event, **detail}, default=str)
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass                  # a record that cannot be written is not a fault


def history(limit: int = 20) -> list[dict]:
    """What it has done, newest first. For the dashboard and the doctor."""
    try:
        lines = LOG.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    out = []
    for ln in reversed(lines[-500:]):
        try:
            out.append(json.loads(ln))
        except ValueError:
            continue          # a truncated last line is not worth a traceback
        if len(out) >= limit:
            break
    return out


def _due(store, now: datetime) -> bool:
    row = store.one("SELECT value FROM setting WHERE key=?", CHECKED_KEY)
    if not row or not row["value"]:
        return True
    try:
        last = datetime.fromisoformat(row["value"])
    except ValueError:
        return True
    if last.tzinfo is None:
        last = last.astimezone()
    return now.astimezone() - last >= timedelta(hours=EVERY_HOURS)


def _stamp(store, now: datetime) -> None:
    store.x("INSERT INTO setting(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            CHECKED_KEY, now.astimezone().isoformat(timespec="seconds"))


def check(store) -> dict:
    """What is waiting, without changing anything.

    Returns the same shape whether it can act or not, so a caller never has
    to tell "no updates" from "could not look".
    """
    out = {"clone": True, "behind": 0, "commits": [], "schema": False,
           "dirty": [], "branch": "", "at": "", "error": "",
           "can_apply": False, "why_not": ""}
    if _git("rev-parse", "--show-toplevel")[0]:
        out.update(clone=False, why_not="this is a copy, not a clone, so "
                                        "there is nothing to pull")
        return out
    branch = _git("rev-parse", "--abbrev-ref", "HEAD")[1].strip()
    out["branch"] = branch
    if branch == "HEAD":
        out.update(error="detached HEAD",
                   why_not="this clone is on no branch — git checkout main")
        return out
    if _git("fetch", "--quiet", "origin", branch, timeout=120)[0]:
        out.update(error="could not reach GitHub",
                   why_not="could not reach GitHub to look")
        return out
    out["at"] = _git("log", "-1", "--format=%h %s")[1].strip()
    # Counted over blokk/ only, like update.sh — a commit that touches
    # nothing here is not an update to this.
    log = _git("log", "--oneline", "--no-decorate",
               f"HEAD..origin/{branch}", "--", ".")[1]
    out["commits"] = [ln for ln in log.splitlines() if ln.strip()][:20]
    out["behind"] = len(out["commits"])
    if not out["behind"]:
        out["why_not"] = "already up to date"
        return out
    out["schema"] = _git("diff", "--quiet", f"HEAD..origin/{branch}",
                         "--", "core/schema.sql")[0] != 0
    # Tracked modifications only. `git status --porcelain` also lists
    # untracked files, and those are not "your edits" — they are a note, a
    # download, an editor's swap file, or the database and logs themselves
    # on a clone whose .gitignore has drifted. A fast-forward cannot write
    # over an untracked file: where the incoming commit adds one at the same
    # path, git refuses the merge itself and that refusal is reported below.
    # Counting them here meant an updater that switched itself on, refused
    # every night for a reason nobody would connect to the stray file that
    # caused it, and said it was enabled the whole time.
    dirty = _git("status", "--porcelain", "--untracked-files=no", "--", ".")[1]
    out["dirty"] = [ln for ln in dirty.splitlines() if ln.strip()][:20]

    # Everything that stops an automatic apply, named. A caller that shows
    # "cannot update" without saying why sends somebody to read this file.
    if out["dirty"]:
        out["why_not"] = ("there are uncommitted changes under blokk/ — "
                          "this will not write over your edits")
    elif out["schema"]:
        out["why_not"] = ("this update changes the database schema, which is "
                          "the one that touches your data — it waits for you")
    else:
        out["can_apply"] = True
    return out


def apply(store, found: dict | None = None, force: bool = False) -> dict:
    """Fast-forward, having backed up first. Never restarts anything.

    `force` is what a person pressing Apply on a schema change passes. It
    does not skip the backup or the dirty-tree check — there is no argument
    to this function that will write over somebody's edits.
    """
    found = found or check(store)
    if not found.get("behind"):
        return {"ok": False, "detail": found.get("why_not") or "nothing to pull"}
    if found.get("dirty"):
        return {"ok": False, "detail": found["why_not"]}
    if found.get("schema") and not force:
        return {"ok": False, "needs_you": True, "detail": found["why_not"]}

    before = _git("rev-parse", "HEAD")[1].strip()
    # The backup happens before the merge and its path goes in the record,
    # because "there is a way back" is only true if somebody can find it
    # without knowing this file exists.
    backup = ""
    try:
        from core import backup as bk
        backup = str(bk.make(ROOT / "blokk.db").get("path", ""))
    except Exception as e:                                       # noqa: BLE001
        # A schema change never reaches here without force, so an update
        # that cannot be backed up is still an update that does not touch
        # the database. Recorded, not fatal.
        _note("backup-failed", {"error": f"{type(e).__name__}: {e}"[:200]})

    code, out = _git("merge", "--ff-only", f"origin/{found['branch']}")
    if code:
        _note("apply-failed", {"from": before, "error": out.strip()[:300]})
        return {"ok": False, "detail":
                "could not fast-forward — this clone has commits that are "
                "not on origin. git pull --rebase sorts it out."}
    after = _git("rev-parse", "HEAD")[1].strip()
    rec = {"from": before, "to": after, "branch": found["branch"],
           "commits": len(found["commits"]), "schema": bool(found["schema"]),
           "backup": backup,
           "revert": f"git -C {ROOT} reset --hard {before[:12]}"}
    _note("applied", rec)
    return {"ok": True, "restart_needed": True,
            "at": _git("log", "-1", "--format=%h %s")[1].strip(), **rec}


def once(store, now: datetime | None = None) -> dict:
    """One tick. Checks at most once a day, and only if switched on."""
    now = now or datetime.now()
    how = mode(store)
    if how == OFF:
        return {"ran": False, "mode": how}
    if not _due(store, now):
        return {"ran": False, "mode": how, "detail": "checked recently"}
    _stamp(store, now)
    found = check(store)
    _note("checked", {"behind": found["behind"], "branch": found["branch"],
                      "schema": found["schema"],
                      "error": found["error"] or ""})
    store.x("INSERT INTO setting(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            LAST_KEY, json.dumps(found, default=str))
    if how == NOTIFY or not found["can_apply"]:
        return {"ran": True, "mode": how, "applied": False, "found": found}
    got = apply(store, found)
    return {"ran": True, "mode": how, "applied": bool(got.get("ok")),
            "found": found, "result": got}


def waiting(store) -> dict:
    """The last thing check() saw, for a surface that must not block.

    The dashboard asking "is there an update" must not become a git fetch on
    every paint. This reads what the scheduled check already found.
    """
    row = store.one("SELECT value FROM setting WHERE key=?", LAST_KEY)
    if not row or not row["value"]:
        return {"behind": 0, "known": False}
    try:
        return {**json.loads(row["value"]), "known": True}
    except ValueError:
        return {"behind": 0, "known": False}


class Updater:
    """The same shape as Nightly: asks on a timer, owns only its thread."""

    def __init__(self, store, tick=3600.0, clock=datetime.now):
        self.store, self.tick, self.clock = store, tick, clock
        self.last_error = ""
        self._stop = threading.Event()

    def state(self) -> dict:
        how = mode(self.store)
        got = waiting(self.store)
        return {"mode": how, "on": how != OFF,
                "behind": got.get("behind", 0),
                "schema": bool(got.get("schema")),
                "commits": got.get("commits", [])[:5],
                "why_not": got.get("why_not", ""),
                "known": got.get("known", False),
                "history": history(5),
                "error": self.last_error}

    def once(self) -> dict:
        try:
            out = once(self.store, self.clock())
            self.last_error = ""
            return out
        except Exception as e:                                   # noqa: BLE001
            # Loudly, in the state a surface reads — and never in a way that
            # takes the thread down. An updater that dies silently is a Mac
            # that stops updating and says it is switched on.
            self.last_error = f"{type(e).__name__}: {e}"[:200]
            _note("tick-failed", {"error": self.last_error})
            return {"ran": False, "error": self.last_error}

    def start(self) -> threading.Thread:
        def loop():
            while not self._stop.wait(self.tick):
                self.once()
        t = threading.Thread(target=loop, daemon=True, name="autoupdate")
        t.start()
        return t

    def stop(self) -> None:
        self._stop.set()


def _main(argv) -> int:
    """./blokk autoupdate [off|notify|apply]

    With no argument it reports; with one it moves the switch. Deliberately
    the same three words the API takes, because a setting with two names is
    a setting somebody sets in one place and reads in the other.
    """
    import sys
    from core.durable import Store
    store = Store(ROOT / "blokk.db")
    want = (argv[0] if argv else "").strip().lower()
    if want:
        try:
            set_mode(store, want)
        except ValueError as e:
            print(f"  {e}")
            return 2
    how = mode(store)
    says = {OFF: "off — nothing is fetched unless you run ./blokk update",
            NOTIFY: "on, and it will tell you rather than act",
            APPLY: "on, and it applies what is safe to apply"}[how]
    print(f"\n  Automatic updates: {says}")
    if how != OFF:
        print(f"  It looks at most once every {EVERY_HOURS} hours, writes what "
              f"it did to")
        print(f"  logs/update.log, never applies a schema change on its own, "
              f"backs up")
        print(f"  first, and never writes over your edits.")
        got = waiting(store)
        if got.get("known"):
            n = got.get("behind", 0)
            print(f"\n  Last look: {n} commit(s) waiting"
                  + (f" — {got.get('why_not')}" if got.get("why_not") else ""))
    past = history(3)
    if past:
        print("\n  Recently:")
        for row in past:
            bit = row.get("event", "")
            if bit == "applied":
                bit = f"applied {row.get('commits', '?')} commit(s) — undo with"
                print(f"    {row.get('at', '')}  {bit}")
                print(f"      {row.get('revert', '')}")
                continue
            if bit == "mode":
                bit = f"switched {row.get('set_to', '?')}"
            elif bit == "checked":
                bit = (f"looked: {row.get('behind', 0)} waiting"
                       + (" (schema)" if row.get("schema") else ""))
            elif bit == "apply-failed":
                bit = f"could not apply: {str(row.get('error', ''))[:60]}"
            print(f"    {row.get('at', '')}  {bit}")
    print()
    return 0


if __name__ == "__main__":
    import sys
    if __package__ in (None, ""):
        sys.path.insert(0, str(ROOT))
    raise SystemExit(_main(sys.argv[1:]))
