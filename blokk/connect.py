#!/usr/bin/env python3
"""
Wire real data in, one source at a time.

    python3 connect.py list                          what is wired now
    python3 connect.py local                         what this Mac already holds
    python3 connect.py workspace add georgefg "George Farrow Green"
    python3 connect.py clean                         drop the sample world
    python3 connect.py backup                        snapshot blokk.db
    python3 connect.py backup list / verify
    python3 connect.py add cottages imap  blokk-cottages-mail
    python3 connect.py add cottages messages local
    python3 connect.py test                          prove every credential works
    python3 connect.py peek cottages mail 6          see what it would actually read
    python3 connect.py remove cottages imap
    python3 connect.py ask "what needs me?"           every event, in the open

Nothing here stores a password. `add` records a keychain service name; the
password goes in the keychain separately, and Blokk reads it at call time.

Suggested order, and it is not arbitrary:
    messages   local, no credential, read-only. Prove the plumbing.
    imap       one mailbox, read-only, for a fortnight.
    caldav     once you trust the mail path.
Leave writes until a category has earned it in the queue.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from core.durable import Store                                    # noqa: E402
from core import sources                                          # noqa: E402

DB = Path(__file__).parent / "blokk.db"
# The commands themselves live in core/sources.py, because the dashboard
# runs the same ones and two copies would drift.
KINDS = sources.KINDS


def main() -> int:
    store = Store(DB)
    args = sys.argv[1:]
    cmd = args[0] if args else "list"

    if cmd == "add":
        if len(args) < 4:
            print("usage: connect.py add <workspace> <kind> <ref>")
            print("       kinds: imap caldav messages ical maildir weather web")
            print("       ref  : a keychain service name, or 'local', or")
            print("              weather — a town or coordinates:")
            print("                        \"Newcastle upon Tyne\" or 54.97,-1.61")
            print("              web     — one page: https://example.com/prices")
            return 1
        r = sources.add(store, args[1], args[2], args[3])
        if r.get("error"):
            print(r["error"])
            return 1
        # Not every ref is a keychain service. Calling a place name one sends
        # somebody looking through Keychain Access for an entry that was
        # never meant to exist.
        where = ("for " if r["kind"] in sources.REACHES_OUT else
                 "using keychain service ") + f"'{r['keychain_ref']}'"
        print(f"added {r['kind']} to {r['workspace_id']} {where} (read scope)")
        if r.get("note"):
            print("  " + r["note"])
        if r.get("keychain_hint"):
            print("\nIf you have not put the password in the keychain yet:")
            print("  " + r["keychain_hint"])
        print("\nNow run:  python3 connect.py test")
        return 0

    if cmd == "remove":
        if len(args) < 3:
            print("usage: connect.py remove <workspace> <imap|caldav|messages"
                  "|ical|maildir>")
            return 1
        print(sources.remove(store, args[1], args[2])["detail"]
              .replace("The keychain", f"removed {args[2]} from {args[1]}. The keychain"))
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
                # Printing "None (? workspaces)" for a file that is not there
                # reads like a verdict on the backup rather than on the path.
                print(f"  {r['error']}")
                return 1
            print(f"  {target.name}: {r.get('integrity') or r.get('detail')}"
                  f"  ({r.get('workspaces','?')} workspaces)")
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

    if cmd == "workspace":
        sub = args[1] if len(args) > 1 else "list"
        if sub == "add":
            if len(args) < 4:
                print("usage: connect.py workspace add <id> <name>")
                return 1
            r = sources.workspace_add(store, args[2], " ".join(args[3:]))
            print(r.get("error") or f"added {r['id']} — {r['name']}")
            return 1 if r.get("error") else 0
        if sub == "remove":
            if len(args) < 3:
                print("usage: connect.py workspace remove <id>")
                return 1
            r = sources.workspace_remove(store, args[2])
            if r.get("error"):
                print(r["error"])
                return 1
            gone = ", ".join(f"{v} {k}" for k, v in r["removed"].items() if v)
            print(f"removed {r['id']}" + (f", and with it {gone}" if gone else ""))
            return 0
        for w in sources.workspaces(store):
            mark = "  (sample)" if w["id"] in sources.SAMPLE else ""
            print(f"  {w['id']:<14} {w['name']}{mark}")
        return 0

    if cmd == "clean":
        # The sample world is four invented businesses with invented guests in
        # them. Useful until you have your own; misleading after.
        sample = sources.is_sample(store)
        if not sample:
            print("No sample workspaces left — this is your own data.")
            return 0
        if "--yes" not in args:
            print(f"This removes {len(sample)} sample workspace(s): "
                  f"{', '.join(sample)}")
            print("and everything in them — approvals, runs, journal, trust, "
                  "facts, episodes.")
            print("\nYour own workspaces are untouched. Nothing outside "
                  "blokk.db is read or written.")
            print("\n  connect.py clean --yes    to go ahead")
            print("  connect.py workspace add <id> <name>   to make your own first")
            return 1
        for wid in sample:
            r = sources.workspace_remove(store, wid)
            gone = ", ".join(f"{v} {k}" for k, v in r["removed"].items() if v)
            print(f"  removed {wid}" + (f" ({gone})" if gone else ""))
        left = sources.workspaces(store)
        print(f"\n{len(left)} workspace(s) left: "
              f"{', '.join(w['id'] for w in left) or 'none — add one'}")
        return 0

    if cmd == "egress":
        # What each workspace may reach, and nothing reaches anything that is
        # not on its list. This is the only list in the system that decides
        # whether something leaves the machine.
        from core import egress
        sub = args[1] if len(args) > 1 else "list"
        if sub in ("allow", "deny", "disallow"):
            if len(args) < 4:
                print(f"usage: connect.py egress {sub} <workspace> <host>")
                return 1
            fn = egress.allow if sub == "allow" else egress.disallow
            r = fn(store, args[2], args[3])
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
        for w in sources.workspaces(store):
            hosts = egress.allowlist_for(store, w["id"])
            print(f"  {w['id']:<14} {', '.join(hosts) if hosts else '(nothing)'}")
        print("\n  connect.py egress allow <workspace> <host>")
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
            print("Nothing wired. Every workspace is running on the sample world.\n")
            print("Start with the one that needs no credential:")
            print("  python3 connect.py add cottages messages local")
            return 0
        print(f"{'workspace':<12} {'kind':<10} {'keychain ref':<28} scopes")
        for r in rows:
            print(f"{r['workspace_id']:<12} {r['kind']:<10} "
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
        if len(args) < 3:
            print("usage: connect.py peek <workspace> <mail|calendar|messages>"
                  " [n]")
            print("       connect.py list   shows what is wired")
            return 1
        out = sources.peek(store, args[1], args[2],
                           int(args[3]) if len(args) > 3 else 5)
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
            print('usage: connect.py ask "your question" [workspace]')
            return 1
        from core import models
        from core.ask import ask as run_ask
        m = models._from_env().small
        how = ("asks the model for each step" if getattr(m, "plans", False)
               else "no weights — the deterministic planner")
        print(f"  model : {m.name} ({type(m).__name__}, {how})")
        said, n = [], 0
        for ev in run_ask(store, args[1], m,
                          args[2] if len(args) > 2 else None):
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
