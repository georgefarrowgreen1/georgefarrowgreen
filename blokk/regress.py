#!/usr/bin/env python3
"""
Frozen examples, run against whatever model is configured now.

    python3 regress.py              run them all
    python3 regress.py list         what is frozen
    python3 regress.py seed         load the starter twenty
    python3 regress.py add <ws> <name> <expect> <prompt...>

Run it after every model change, and nightly. A model swap does not announce
itself by crashing; it announces itself by a draft that reads slightly worse,
in a queue you approve quickly, until a guest reads one.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from core import regression                                       # noqa: E402
from core.durable import NeedsUnify, Store                                    # noqa: E402
from core.models import router                                     # noqa: E402

DB = Path(__file__).parent / "blokk.db"

# The starter twenty. Written against the seeded world, and deliberately
# about the things that go wrong quietly: a charge dropped from a quote, a
# price invented, an instruction in an email obeyed, a one-line answer that
# turned into six paragraphs.


def main() -> int:
    try:
        store = Store(DB)
    except NeedsUnify as e:
        print(f"\n  {e}\n")
        return 1
    args = sys.argv[1:]
    cmd = args[0] if args else "run"

    if cmd == "seed":
        n = regression.seed(store, force="--force" in args)
        if not n:
            print(f"{len(regression.listing(store))} already frozen. "
                  f"`seed --force` to re-freeze the starter set.")
        else:
            print(f"froze {n} examples. python3 regress.py to run them.")
        return 0

    if cmd == "list":
        rows = regression.listing(store)
        if not rows:
            print("Nothing frozen. python3 regress.py seed")
            return 0
        for r in rows:
            was = {1: "pass", 0: "FAIL", None: "-"}[r["last_pass"]]
            print(f"  {was:<5} {r['name']}")
        return 0

    if cmd == "add":
        if len(args) < 4:
            print("usage: regress.py add <name> <expect> <prompt...>")
            return 1
        r = regression.add(store, args[1], " ".join(args[3:]), args[2])
        print(r.get("error") or f"froze {r['name']}")
        return 1 if r.get("error") else 0

    only = args[1] if len(args) > 1 else ""
    out = regression.run(store, router, only)
    if not out["total"]:
        print("Nothing frozen. python3 regress.py seed")
        return 0
    for r in out["results"]:
        mark = {"pass": " ok  ", "fail": "FAIL ", "unreachable": " ??  "}[r["state"]]
        flag = "  <-- changed since last run" if r.get("changed") else ""
        print(f"  {mark} {r['name']}{flag}")
        for b in r.get("broke", []):
            print(f"          {b}")
        if r["state"] == "unreachable":
            print(f"          {r['detail']}")
    print(f"\n  {out['passed']} of {out['ran']} held, on {out['model']}")
    if "stub" in out["model"]:
        print("  These are stubs — the prose is placeholder and the same for "
              "every\n  prompt, so failures here are the harness working, not "
              "the model.\n  The numbers start meaning something once real "
              "weights are attached.")
    if out["unreachable"]:
        print(f"  {out['unreachable']} could not be run — the model server is "
              f"not answering. Not a regression; an outage.")
    if out["regressed"]:
        print(f"  changed for the worse: {', '.join(out['regressed'])}")
    return 1 if (out["regressed"] or out["passed"] < out["ran"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
