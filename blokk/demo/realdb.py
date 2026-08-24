"""Written to test.sh's guard. Kept out of the shell so bash 3.2 stays simple."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.durable import Store                                    # noqa: E402

DB = Path(__file__).resolve().parent.parent / "blokk.db"


def real() -> str:
    """What this database holds that a person would miss. "" if nothing.

    The suites delete blokk.db and re-seed, which is right — they mutate it
    deliberately and a half-swept database makes probes report defects that
    are not there. What is not right is doing it to somebody's actual setup
    without a word: the credentials, the trust ledger, the learned facts and
    the episodes are the whole of what Blokk knows about a business, and
    `./test.sh` before a commit is a thing anybody would run.
    """
    if not DB.exists():
        return ""
    try:
        st = Store(DB)
    except Exception:                                            # noqa: BLE001
        return ""
    # seed.py writes facts, skills and episodes of its own and stamps which
    # ones they are. Without that this counted them as yours, so the guard
    # fired on every run after the first — backing up a copy of the sample
    # world and warning about losing a fortnight of approvals that had never
    # existed. No stamp means the database predates it or is not seeded, and
    # then everything in it counts, which is the safe way round.
    seeded = {}
    try:
        row = st.one("SELECT value FROM setting WHERE key='sample_world'")
        if row:
            seeded = json.loads(row["value"])
    except Exception:                                            # noqa: BLE001
        seeded = {}
    had = []
    for table, what in (("credential", "wired source"),
                        ("fact", "learned fact"),
                        ("episode", "correction"),
                        ("skill", "skill")):
        mine = [str(i) for i in seeded.get(table, [])]
        holes = ",".join("?" * len(mine))
        try:
            n = st.one(
                f"SELECT COUNT(*) c FROM {table}"
                + (f" WHERE id NOT IN ({holes})" if mine else ""),
                *mine)["c"]
        except Exception:                                        # noqa: BLE001
            n = 0
        if n:
            had.append(f"{n} {what}{'' if n == 1 else 's'}")
    # A graduated category is a fortnight of approvals somebody sat through
    # — unless the suites did it, which is what the stamp records.
    try:
        was = set(seeded.get("auto", []))
        auto = sum(1 for r in st.q("SELECT category FROM trust WHERE auto=1")
                   if r["category"] not in was)
    except Exception:                                            # noqa: BLE001
        auto = 0
    if auto:
        had.append(f"{auto} category(s) that had earned autonomy")
    return ", ".join(had)


TABLES = ("credential", "fact", "episode", "skill")


def stamp() -> str:
    """Mark everything now in the database as not-yours. Says how many.

    seed.py does this for the sample world, and then the suites run: they
    sweep, decide, reject and correct, and every one of those leaves rows
    behind. So the guard still fired on every run after the first, this time
    about 36 corrections nobody would miss. test.sh calls this on the way
    out, once the suites have finished making their mess, and the next run
    is quiet unless a person put something there.

    Anything a person adds afterwards is not in the stamp, so it still
    counts — which is the whole point of the guard.
    """
    if not DB.exists():
        return ""
    try:
        st = Store(DB)
        seeded = {t: [r["id"] for r in st.q(f"SELECT id FROM {t}")]
                  for t in TABLES}
        # trust has no id, and the suites graduate a category on purpose —
        # so without this the "a fortnight of approvals" line fired every
        # run too. The category is the key.
        seeded["auto"] = [r["category"] for r in
                          st.q("SELECT category FROM trust WHERE auto=1")]
        st.x("INSERT OR REPLACE INTO setting(key,value) "
             "VALUES('sample_world',?)", json.dumps(seeded))
    except Exception as e:                                       # noqa: BLE001
        # Said out loud. This swallowed everything and returned "", so when
        # the trust key changed shape the stamp silently stopped being
        # written and the only symptom was the guard shouting again on every
        # run — about the seed, which is the exact noise it exists to stop.
        print(f"  note: could not stamp the sample world: "
              f"{type(e).__name__}: {e}")
        return ""
    return str(sum(len(v) for v in seeded.values()))


def keep_a_copy() -> str:
    """Snapshot it, and say where. "" if that could not be done.

    Uses the same online-snapshot path a person would: a copy taken with
    cp while something is mid-write is not a database, and this runs on a
    machine where the night shift may be running.
    """
    from core import backup
    try:
        out = backup.make(DB)
    except Exception as e:                                       # noqa: BLE001
        return ""
    return "" if out.get("error") else str(out.get("path") or "")


if __name__ == "__main__":
    # `--save` backs it up and prints the path; no argument reports what is
    # in there. Two jobs, one file, because test.sh must stay free of
    # inline Python — a heredoc inside a heredoc is how the last attempt at
    # this ended.
    if "--save" in sys.argv:
        print(keep_a_copy())
    elif "--stamp" in sys.argv:
        print(stamp())
    else:
        print(real())
