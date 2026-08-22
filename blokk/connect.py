#!/usr/bin/env python3
"""
Wire real data in, one source at a time.

    python3 connect.py list                          what is wired now
    python3 connect.py local                         what this Mac already holds
    python3 connect.py add cottages imap  blokk-cottages-mail
    python3 connect.py add cottages messages local
    python3 connect.py test                          prove every credential works
    python3 connect.py peek cottages mail 6          see what it would actually read
    python3 connect.py remove cottages imap

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
            print("usage: connect.py add <workspace> <imap|caldav|messages> <keychain-ref>")
            return 1
        r = sources.add(store, args[1], args[2], args[3])
        if r.get("error"):
            print(r["error"])
            return 1
        print(f"added {r['kind']} to {r['workspace_id']} using keychain service "
              f"'{r['keychain_ref']}' (read scope)")
        if r.get("keychain_hint"):
            print("\nIf you have not put the password in the keychain yet:")
            print("  " + r["keychain_hint"])
        print("\nNow run:  python3 connect.py test")
        return 0

    if cmd == "remove":
        print(sources.remove(store, args[1], args[2])["detail"]
              .replace("The keychain", f"removed {args[2]} from {args[1]}. The keychain"))
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

    print(__doc__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
