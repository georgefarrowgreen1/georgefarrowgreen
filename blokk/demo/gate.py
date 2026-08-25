"""Break the thing, and check the probe notices.

The suites answer "does the code work". Nothing answered "does the suite
work", and that gap has a specific shape: a probe whose check can only ever
pass is a green line indistinguishable from a green line that means
something. Nine of those were written here in a week, each caught by hand,
by remembering to try. Remembering is not a mechanism.

For every entry in `demo/mutations.py` this applies the break, runs the one
probe that should catch it, and requires it to go red. Three ways to fail,
and the second is the one that matters most:

  * the probe stays green — it does not check what it says it checks;
  * **the edit matched nothing** — the mutation is testing a string that
    is not there, so it proved nothing while looking exactly like a pass.
    Twice this week a mutation edited a class or a file that did not
    exist, and the green that followed read as a probe doing its job;
  * the probe was red before the break, which makes the result meaningless.

Coverage is printed, never assumed. A gate quietly covering a tenth of the
suite is the failure it exists to prevent, so the count of probes with no
mutation is part of the output.

    python3 demo/gate.py            every registered mutation
    python3 demo/gate.py A110       just that probe's

Nothing here is clever about restoring: every file is read once at the
start, held in memory, and written back in a finally. A gate that can leave
the tree broken is worse than no gate.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from demo.mutations import MUTATIONS                              # noqa: E402

BOLD, DIM, GREEN, RED, AMBER, OFF = (
    "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[0m")


def run_probe(probe: str, timeout=180) -> tuple[bool, str]:
    """Run one probe. Returns (it reported a defect, the line it printed)."""
    try:
        p = subprocess.run(
            [sys.executable, "demo/hunt.py", probe], cwd=str(ROOT),
            capture_output=True, text=True, timeout=timeout)
    except subprocess.SubprocessError as e:
        return False, f"could not run: {type(e).__name__}: {e}"
    out = p.stdout or ""
    if "no probe matches" in out:
        return False, "NO SUCH PROBE"
    line = ""
    for ln in out.splitlines():
        if probe in ln and ("BUG" in ln or "ok " in ln):
            line = ln.strip()
            break
    return ("BUG" in line), line


def main(argv) -> int:
    only = [a for a in argv if not a.startswith("-")]
    wanted = [m for m in MUTATIONS
              if not only or any(m["probe"].startswith(o) for o in only)]
    if not wanted:
        print(f"\n  no mutation registered for {only!r}\n")
        return 2

    print(f"\n  {BOLD}Can each probe fail?{OFF}")
    print(f"  {DIM}{len(wanted)} mutation(s). Each one breaks something and "
          f"the probe must notice.{OFF}\n")

    # Read every file once, up front. Restoring from a copy taken before
    # anything ran is the only version of this that cannot lose an edit.
    files = sorted({m["file"] for m in wanted})
    original = {}
    for f in files:
        path = ROOT / f
        if not path.exists():
            print(f"  {RED}FAIL{OFF}  {f} does not exist")
            return 1
        original[f] = path.read_text()

    bad, t0 = [], time.time()
    try:
        for m in wanted:
            probe, f = m["probe"], m["file"]
            src = original[f]
            label = f"{probe}  {m['why']}"

            # The edit has to actually edit something. A find string that is
            # not there applies cleanly to nothing and leaves the probe
            # green, which reads exactly like a probe doing its job.
            if m["find"] not in src:
                print(f"  {RED}FAIL{OFF}  {label}")
                print(f"        {DIM}the mutation matches nothing in {f} — it "
                      f"proves nothing{OFF}")
                bad.append(label)
                continue
            if src.count(m["find"]) > 1:
                print(f"  {AMBER}note{OFF}  {label}")
                print(f"        {DIM}matches {src.count(m['find'])} places in "
                      f"{f}; only the first is changed{OFF}")

            (ROOT / f).write_text(src.replace(m["find"], m["replace"], 1))
            try:
                red, line = run_probe(probe)
            finally:
                (ROOT / f).write_text(src)

            if line == "NO SUCH PROBE":
                print(f"  {RED}FAIL{OFF}  {label}")
                print(f"        {DIM}there is no probe called {probe}{OFF}")
                bad.append(label)
            elif red:
                print(f"  {GREEN}ok{OFF}    {label}")
            else:
                print(f"  {RED}FAIL{OFF}  {label}")
                print(f"        {DIM}broken, and {probe} stayed green — it "
                      f"does not check what it says it checks{OFF}")
                bad.append(label)
    finally:
        # Belt and braces. The per-mutation restore above already ran; this
        # is what covers a KeyboardInterrupt in the middle of one.
        for f, src in original.items():
            if (ROOT / f).read_text() != src:
                (ROOT / f).write_text(src)

    # What is not covered, said out loud.
    have = {m["probe"] for m in MUTATIONS}
    every = probe_names()
    missing = [n for n in every if n.split()[0] not in have]
    took = time.time() - t0
    print()
    if every:
        print(f"  {len(have)} of {len(every)} probes have a mutation "
              f"registered; {len(missing)} do not.")
        print(f"  {DIM}An unregistered probe is not known to be able to fail. "
              f"Adding one{OFF}")
        print(f"  {DIM}is an entry in demo/mutations.py.{OFF}")
    print(f"\n  {len(bad)} probe(s) cannot fail   {DIM}({took:.0f}s){OFF}\n")
    return 1 if bad else 0


def probe_names() -> list[str]:
    """Every probe hunt.py declares, read out of its source.

    Cheaper than running the suite to ask, and it cannot be wrong about a
    probe that exists but is skipped by a filter.
    """
    import re
    src = (ROOT / "demo" / "hunt.py").read_text()
    return re.findall(r'probe\(\s*["\']([AB]\d+[a-z]?)', src)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
