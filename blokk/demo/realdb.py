"""Written to test.sh's guard. Kept out of the shell so bash 3.2 stays simple."""
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
    had = []
    for table, what in (("credential", "wired source"),
                        ("fact", "learned fact"),
                        ("episode", "correction"),
                        ("skill", "skill")):
        try:
            n = st.one(f"SELECT COUNT(*) c FROM {table}")["c"]
        except Exception:                                        # noqa: BLE001
            n = 0
        if n:
            had.append(f"{n} {what}{'' if n == 1 else 's'}")
    # A graduated category is a fortnight of approvals somebody sat through.
    try:
        auto = st.one("SELECT COUNT(*) c FROM trust WHERE auto=1")["c"]
    except Exception:                                            # noqa: BLE001
        auto = 0
    if auto:
        had.append(f"{auto} category(s) that had earned autonomy")
    return ", ".join(had)


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
    else:
        print(real())
