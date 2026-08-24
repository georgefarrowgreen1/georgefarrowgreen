#!/usr/bin/env python3
"""
Wire real data in, one source at a time.

    python3 connect.py list                          what is wired now
    python3 connect.py local                         what this Mac already holds
    python3 connect.py backup                        snapshot blokk.db
    python3 connect.py backup list / verify
    python3 connect.py add imap blokk-mail           wire a mailbox
    python3 connect.py add messages local
    python3 connect.py test                          prove every credential works
    python3 connect.py peek mail 6                   see what it would actually read
    python3 connect.py keychain blokk-mail           store a password, hidden
    python3 connect.py remove mail
    python3 connect.py ask "what needs me?"           every event, in the open

A source has a name. The first mailbox is called `mail` and the first diary
`calendar`, because that is what they are; wire a second of either and it
gets `mail2` or a name you choose with `--name`. Two mailboxes are two
sources and everything reads both.

Nothing here stores a password. `add` records a keychain service name; the
password goes in the keychain separately, and Blokk reads it at call time.

Suggested order, and it is not arbitrary:
    messages   local, no credential, read-only. Prove the plumbing.
    imap       one mailbox, read-only, for a fortnight.
    caldav     once you trust the mail path.
    ics_out    a folder Blokk drops .ics files into, and Calendar.app
               itself where macOS lets it.
    smtp       last, and only when you have watched the drafts for a while.
               The one that reaches somebody else.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from core.durable import NeedsUnify, Store                                    # noqa: E402
from core import sources                                          # noqa: E402

DB = Path(__file__).parent / "blokk.db"
# The commands themselves live in core/sources.py, because the dashboard
# runs the same ones and two copies would drift.
KINDS = sources.KINDS


def _store_password(ref: str) -> bool:
    """Prompt for the account and password, and put them in the keychain.

    Returns False if there is nobody to prompt — a script, a pipe, a cron —
    in which case the caller prints the command instead. It never returns
    the password and never writes it anywhere but the keychain.
    """
    import getpass

    if not sys.stdin.isatty():
        return False
    try:
        from core.connectors import keychain
    except ImportError:
        return False
    print(f"\nThis one needs a password, kept in your keychain under "
          f"'{ref}'.")
    print("  Blokk stores only the name. The password goes straight to "
          "macOS and is read back at the moment it is used.")
    print("  For iCloud that is an app-specific password from "
          "appleid.apple.com, not your Apple ID password.")
    print("  Press Enter on either line to skip and do it yourself later.")
    try:
        acct = input("  address / account: ").strip()
        if not acct:
            return False
        pw = getpass.getpass("  password (not shown): ")
        if not pw:
            return False
    except (EOFError, KeyboardInterrupt):
        print()
        return False
    try:
        keychain.put(ref, acct, pw)
    except Exception as e:                                       # noqa: BLE001
        print(f"  could not write to the keychain: {e}")
        return False
    finally:
        del pw
    # Read it back rather than trusting the write. `security` exits 0 on
    # plenty of things that did not end with a usable entry.
    try:
        keychain.secret(ref)
    except Exception as e:                                       # noqa: BLE001
        print(f"  stored, but reading it back failed: {e}")
        return False
    print(f"  stored for {acct}.")
    return True


def _check_one(store, name: str) -> None:
    """Say whether the source works, now, rather than at 04:00.

    `connect.py test` has always existed and has always been a separate
    thing to remember. The moment somebody wants the answer is the moment
    they finish adding it.
    """
    import threading

    out: dict = {}

    def go():
        try:
            from core.connectors import wire
            reg = wire(store)
            c = reg.get(name)
            if c is None:
                out["msg"] = "wired, but nothing built a reader for it."
                return
            state = c.check() if hasattr(c, "check") else {"ok": True}
            out["msg"] = sources.describe(reg.role_of(name), state)
        except Exception as e:                                   # noqa: BLE001
            out["msg"] = (f"it is added, but reading it raised "
                          f"{type(e).__name__}: {str(e)[:160]}\n"
                          f"  Nothing is lost — fix that and it will work.")

    # On a thread with a deadline. A mail server that is not answering takes
    # its own sweet time about saying so — the first version of this sat
    # silent until the socket gave up, which is the same "is it working or is
    # it hung" question the model server used to pose.
    t = threading.Thread(target=go, daemon=True)
    t.start()
    t.join(12)
    if t.is_alive():
        print("  still trying to reach it after 12s. It is added either way;")
        print("  python3 connect.py test will say how it went.")
        return
    print("  " + out.get("msg", "nothing to report."))


def main() -> int:
    try:
        store = Store(DB)
    except NeedsUnify as e:
        print(f"\n  {e}\n")
        return 1
    args = sys.argv[1:]
    cmd = args[0] if args else "list"

    if cmd == "add":
        if len(args) < 3:
            print("usage: connect.py add <kind> <ref> [--name <name>]")
            print("       kinds: imap caldav messages ical maildir weather web\n"
                  "              ics_out (writes .ics files here)\n"
                  "              smtp (the only one that reaches "
                  "another person)")
            print("       ref  : a keychain service name, or 'local', or")
            print("              weather — a town or coordinates:")
            print("                        \"Newcastle upon Tyne\" or 54.97,-1.61")
            print("              web     — one page: https://example.com/prices")
            return 1
        name = None
        if "--name" in args:
            i = args.index("--name")
            if i + 1 < len(args):
                name = args[i + 1]
        r = sources.add(store, args[1], args[2], name=name)
        if r.get("error"):
            print(r["error"])
            return 1
        # Not every ref is a keychain service. Calling a place name one sends
        # somebody looking through Keychain Access for an entry that was
        # never meant to exist.
        # A place is not a keychain service, and neither is a folder. Saying
        # so sends people hunting through Keychain Access for an entry that
        # was never meant to exist.
        ref = r["keychain_ref"]
        if r["kind"] in sources.REACHES_OUT:
            where = f"for '{ref}'"
        elif r["kind"] in sources.NEEDS_NOTHING:
            where = ("from this Mac's own folder" if ref.lower() == "local"
                     else f"reading {ref}")
        else:
            where = f"using keychain service '{ref}'"
        print(f"added {r['kind']} as '{r['name']}' {where} (read scope)")
        if r.get("note"):
            print("  " + r["note"])
        if r["kind"] in sources.NEEDS_KEYCHAIN and "--no-password" not in args:
            # The step everybody stalls on. It was printed as a command to go
            # and run in another window, which is one context switch too many
            # at the exact moment somebody is deciding whether this is worth
            # the bother. Ask for it here and put it away — the password is
            # read with getpass, handed to `security`, and never touches the
            # database, this process's argv, the shell history or the log.
            if _store_password(r["keychain_ref"]) is False and \
                    r.get("keychain_hint"):
                print("\nWhen you are ready, put the password in yourself:")
                print("  " + r["keychain_hint"])
        print("\nChecking it...")
        _check_one(store, r["name"])
        return 0

    if cmd == "keychain":
        if len(args) < 2:
            print("usage: connect.py keychain <service-name>")
            print("       stores or replaces the password for one source")
            return 1
        return 0 if _store_password(args[1]) else 1

    if cmd == "remove":
        if len(args) < 2:
            print("usage: connect.py remove <name>")
            print("       the names are what `connect.py list` shows")
            return 1
        out = sources.remove(store, args[1])
        if out.get("error"):
            print(out["error"])
            return 1
        print(out["detail"].replace(
            "The keychain", f"removed '{args[1]}'. The keychain"))
        return 0

    if cmd == "backup":
        from core import backup
        sub = args[1] if len(args) > 1 else "make"
        folder = DB.parent / "backups"
        if sub == "list":
            rows = backup.listing(folder)
            if not rows:
                print("No backups yet.  connect.py backup")
                return 0
            for r in rows:
                print(f"  {r['at']}  {r['bytes']/1024/1024:7.1f} MB  {r['name']}")
            return 0
        if sub == "verify":
            target = (folder / args[2]) if len(args) > 2 else None
            if target is None:
                rows = backup.listing(folder)
                if not rows:
                    print("No backups to verify.")
                    return 1
                target = folder / rows[0]["name"]
            r = backup.verify(target)
            if r.get("error"):
                # Printing "None (? sources)" for a file that is not there
                # reads like a verdict on the backup rather than on the path.
                print(f"  {r['error']}")
                return 1
            print(f"  {target.name}: {r.get('integrity') or r.get('detail')}"
                  f"  ({r.get('sources','?')} sources)")
            return 0 if r.get("ok") else 1
        r = backup.make(DB)
        if r.get("error"):
            print(r["error"])
            return 1
        held = ", ".join(f"{v} {k}" for k, v in r["holds"].items() if v)
        print(f"  {r['path']}  ({r['bytes']/1024/1024:.1f} MB)")
        print(f"  holds {held}")
        if r["pruned"]:
            print(f"  pruned {len(r['pruned'])} older than the last {r['kept']}")
        return 0

    if cmd == "egress":
        # What anything wired here may reach, and nothing reaches anything
        # that is not on it. This is the only list in the system that decides
        # whether something leaves the machine. It used to be one list per
        # workspace; collapsing them was a widening, which is why
        # `./blokk unify` names every host it opened up.
        from core import egress
        sub = args[1] if len(args) > 1 else "list"
        if sub in ("allow", "deny", "disallow"):
            if len(args) < 3:
                print(f"usage: connect.py egress {sub} <host>")
                return 1
            fn = egress.allow if sub == "allow" else egress.disallow
            r = fn(store, args[2])
            print("  " + (r.get("error") or r["detail"]))
            return 1 if r.get("error") else 0
        if sub == "log":
            lines = egress.recent(int(args[2]) if len(args) > 2 else 20)
            if not lines:
                print("  Nothing has left this machine.")
                return 0
            for ln in lines:
                print("  " + ln)
            return 0
        hosts = egress.allowlist(store)
        print("  " + (", ".join(hosts) if hosts
                      else "(nothing — nothing can leave this Mac)"))
        print("\n  connect.py egress allow <host>")
        print("  connect.py egress log [n]        what has actually left")
        return 0

    if cmd == "local":
        from core import local
        sv = local.survey()
        if not sv.get("mac"):
            print(sv.get("note", "not macOS"))
            return 0
        print(f"{'source':<10} {'state':<11} where")
        for x in sv["sources"]:
            print(f"{x['what']:<10} {x['state']:<11} {x['path']}")
            print(f"{'':<10} {'':<11} {x['detail']}")
        if sv["blocked"]:
            print(f"\n{sv['blocked']} of these is here but blocked. To fix:")
            for i, h in enumerate(sv["how"], 1):
                print(f"  {i}. {h}")
        return 0

    if cmd == "list":
        rows = sources.listing(store)
        if not rows:
            print("Nothing wired. Blokk is running on the sample world.\n")
            print("Start with the one that needs no credential:")
            print("  python3 connect.py add messages local")
            return 0
        print(f"{'name':<14} {'kind':<10} {'keychain ref':<28} scopes")
        for r in rows:
            print(f"{r['name']:<14} {r['kind']:<10} "
                  f"{r['keychain_ref']:<28} {','.join(r['scopes'])}")
        return 0

    if cmd == "test":
        out = sources.test(store)
        if not out["total"]:
            print("Nothing to test — no credentials configured.")
            return 0
        for r in out["results"]:
            print(f"  {'ok  ' if r['ok'] else 'FAIL'}  {r['label']:<24} {r['detail']}")
        print(f"\n{out['working']} of {out['total']} working")
        return 0 if out["working"] == out["total"] else 1

    if cmd == "peek":
        # The important one. Look at what it would actually read before you
        # let anything downstream act on it.
        if len(args) < 2:
            print("usage: connect.py peek <name> [n]")
            print("       connect.py list   shows what is wired")
            return 1
        out = sources.peek(store, args[1],
                           int(args[2]) if len(args) > 2 else 5)
        if out.get("error"):
            print(out["error"])
            return 1
        for r in out["rows"]:
            flag = "  <-- contains something shaped like an instruction" \
                if r["instruction_like"] else ""
            print(f"\n  from : {r['from']}")
            print(f"  subj : {r['subject']}")
            print(f"  prov : {r['provenance']}{flag}")
            print(f"  body : {r['body'][:160].strip()}")
        print(f"\n{out['count']} rows. Nothing was written, nothing was marked read.")
        return 0

    if cmd == "ask":
        # The chat panel with the lid off. It runs the same generator the
        # server streams, in this process, and prints every event — so when
        # the panel shows nothing, this says whether nothing was produced,
        # or something was produced and did not arrive. Those are different
        # faults with different fixes and the screen cannot tell them apart.
        if len(args) < 2:
            print('usage: connect.py ask "your question"')
            return 1
        from core import models
        from core.ask import ask as run_ask
        m = models._from_env().small
        how = ("asks the model for each step" if getattr(m, "plans", False)
               else "no weights — the deterministic planner")
        print(f"  model : {m.name} ({type(m).__name__}, {how})")
        said, n = [], 0
        for ev in run_ask(store, args[1], m):
            n += 1
            kind = ev["type"]
            if kind == "TEXT_MESSAGE_CONTENT":
                said.append(ev["delta"]); continue
            rest = {k: v for k, v in ev.items() if k != "type"}
            print(f"  {kind:22} {json.dumps(rest, default=str)[:120]}")
        text = "".join(said)
        print(f"\n  {n} events")
        if text:
            print(f"  answer: {text}")
        else:
            # The whole point of the command.
            print("  answer: NOTHING — the turn produced no text. That is a "
                  "fault in this file's neighbours, not in your question.")
        return 0 if text else 1

    print(__doc__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
