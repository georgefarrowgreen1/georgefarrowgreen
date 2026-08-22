#!/usr/bin/env python3
"""
Wire real data in, one source at a time.

    python3 connect.py list                          what is wired now
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

DB = Path(__file__).parent / "blokk.db"
KINDS = {"imap": "mail", "caldav": "calendar", "messages": "messages"}


def main() -> int:
    store = Store(DB)
    args = sys.argv[1:]
    cmd = args[0] if args else "list"

    if cmd == "add":
        if len(args) < 4:
            print("usage: connect.py add <workspace> <imap|caldav|messages> <keychain-ref>")
            return 1
        ws, kind, ref = args[1], args[2], args[3]
        if kind not in KINDS:
            print(f"kind must be one of {', '.join(KINDS)}")
            return 1
        if not store.one("SELECT 1 FROM workspace WHERE id=?", ws):
            print(f"no workspace '{ws}'. Known: "
                  + ", ".join(r["id"] for r in store.q("SELECT id FROM workspace")))
            return 1
        store.x("""INSERT OR REPLACE INTO credential(id,workspace_id,kind,keychain_ref,scopes)
                   VALUES(?,?,?,?,?)""",
                f"c_{ws}_{kind}", ws, kind, ref, json.dumps(["read"]))
        print(f"added {kind} to {ws} using keychain service '{ref}' (read scope)")
        if kind != "messages":
            print("\nIf you have not put the password in the keychain yet:")
            print(f"  security add-generic-password -s {ref} -a you@icloud.com -w")
        print("\nNow run:  python3 connect.py test")
        return 0

    if cmd == "remove":
        ws, kind = args[1], args[2]
        store.x("DELETE FROM credential WHERE workspace_id=? AND kind=?", ws, kind)
        print(f"removed {kind} from {ws}. The keychain entry is untouched — "
              f"delete it yourself if you meant to revoke access.")
        return 0

    if cmd == "list":
        rows = store.q("SELECT * FROM credential ORDER BY workspace_id")
        if not rows:
            print("Nothing wired. Every workspace is running on the sample world.\n")
            print("Start with the one that needs no credential:")
            print("  python3 connect.py add cottages messages local")
            return 0
        print(f"{'workspace':<12} {'kind':<10} {'keychain ref':<28} scopes")
        for r in rows:
            print(f"{r['workspace_id']:<12} {r['kind']:<10} {r['keychain_ref']:<28} "
                  f"{','.join(json.loads(r['scopes']))}")
        return 0

    if cmd == "test":
        from core.connectors import wire
        reg = wire(store)
        rows = store.q("SELECT * FROM credential")
        if not rows:
            print("Nothing to test — no credentials configured.")
            return 0
        bad = 0
        for r in rows:
            name = KINDS[r["kind"]]
            c = reg.get(r["workspace_id"], name)
            label = f"{r['workspace_id']}/{name}"
            if c is None or not hasattr(c, "check"):
                print(f"  FAIL  {label:<24} not loaded"); bad += 1; continue
            try:
                print(f"  ok    {label:<24} {c.check()}")
            except Exception as e:                                # noqa: BLE001
                print(f"  FAIL  {label:<24} {type(e).__name__}: {e}"); bad += 1
        print(f"\n{len(rows)-bad} of {len(rows)} working")
        return 1 if bad else 0

    if cmd == "peek":
        # The important one. Look at what it would actually read before you
        # let anything downstream act on it.
        from core.connectors import wire
        from core.harness import quarantine_read
        ws, name = args[1], args[2]
        n = int(args[3]) if len(args) > 3 else 5
        c = wire(store).get(ws, name)
        if c is None:
            print(f"nothing named '{name}' for {ws}"); return 1
        fn = (getattr(c, "search_since", None) or getattr(c, "since", None)
              or getattr(c, "events", None))
        rows = fn()[:n] if fn else []
        for r in rows:
            body = r.get("body") or r.get("summary") or ""
            q = quarantine_read(body)
            flag = "  <-- contains something shaped like an instruction" \
                if q["instruction_like"] else ""
            print(f"\n  from : {r.get('from') or r.get('start','')}")
            print(f"  subj : {r.get('subject') or r.get('summary','')}")
            print(f"  prov : {r.get('provenance','?')}{flag}")
            print(f"  body : {body[:160].strip()}")
        print(f"\n{len(rows)} rows. Nothing was written, nothing was marked read.")
        return 0

    print(__doc__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
