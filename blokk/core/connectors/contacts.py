"""Your address book, read from disk. Read-only, local, no credential.

Contacts.app keeps everything in Core Data SQLite files under
~/Library/Application Support/AddressBook — one `AddressBook-v22.abcddb`
at the top for On My Mac, and one per account under `Sources/<uuid>/`,
which is where an iCloud address book actually lives. The same lesson the
calendar reader learned the hard way: looking only at the top level finds
nothing on most Macs. Reading them needs Full Disk Access and nothing
else — no credential, no network, nothing to revoke.

Why this exists is one sentence: "email John" needs to know who John is,
and until now the only addresses Blokk ever saw were the From lines of
messages that had already arrived. This is the second legitimate
provenance for a recipient — a detail out of *your* address book, matched
against a name *you* used — and core/actions.py `write_to` is the only
thing that turns one into a send.

Rules, all inherited:

  * **Search, don't list.** `find()` takes a name and a limit. Nothing
    here returns the whole address book, because nothing needs it: the
    caller has a name, and an agent holding eight hundred contacts it did
    not ask for has spent context on somebody else's privacy.

  * **Opened ro and immutable**, same as chat.db — Contacts holds these
    files open, and a reader that takes locks on your address book is a
    reader that corrupts it eventually.

  * **A contact is data.** Names and addresses come back as fields. They
    are your own records rather than a stranger's prose, so they carry
    provenance `self` — but a name is still never executed, pasted into a
    script, or matched against anything but the name you typed.

BLOKK_CONTACTS_ROOT overrides where this looks — for a Mac that keeps it
elsewhere, and for the fixture the probes run against, which is how the
Sources/ nesting stays covered without a Mac to hand.
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path

ROOT = Path(os.environ.get("BLOKK_CONTACTS_ROOT") or (
    Path.home() / "Library/Application Support/AddressBook"))
DB_NAME = "AddressBook-v22.abcddb"
MAX_SOURCES = 12               # accounts, not contacts — nobody has more


def databases(root: Path | None = None) -> list[Path]:
    """Every address-book database on this Mac, On My Mac and per account."""
    base = Path(root) if root else ROOT
    found = []
    if (base / DB_NAME).is_file():
        found.append(base / DB_NAME)
    src = base / "Sources"
    if src.is_dir():
        try:
            for d in sorted(src.iterdir())[:MAX_SOURCES]:
                if (d / DB_NAME).is_file():
                    found.append(d / DB_NAME)
        except OSError:
            pass
    return found


def _open(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True,
                          timeout=10)
    con.row_factory = sqlite3.Row
    return con


class Contacts:
    kind = "contacts"
    writes = False

    def __init__(self, root: Path | str | None = None):
        self.root = Path(root) if root else ROOT

    def check(self) -> dict:
        """Prove it can be read and say what is there — never who."""
        dbs = databases(self.root)
        if not dbs:
            raise FileNotFoundError(
                f"no address book at {self.root} — either Contacts stores "
                f"nothing on this Mac, or macOS is not letting Blokk read "
                f"it (Full Disk Access).")
        people = 0
        for p in dbs:
            try:
                con = _open(p)
                try:
                    people += con.execute(
                        "SELECT COUNT(*) c FROM ZABCDRECORD "
                        "WHERE ZFIRSTNAME IS NOT NULL "
                        "OR ZLASTNAME IS NOT NULL "
                        "OR ZORGANIZATION IS NOT NULL").fetchone()["c"]
                finally:
                    con.close()
            except sqlite3.Error as e:
                raise PermissionError(
                    f"{p.name} exists but will not open — grant Full Disk "
                    f"Access to the app running Blokk "
                    f"({type(e).__name__})") from e
        return {"ok": True, "sources": len(dbs), "people": people,
                "note": f"{people} contact(s) across {len(dbs)} account(s). "
                        f"Read only when a name is looked up — never "
                        f"listed."}

    def find(self, name: str, limit: int = 6) -> list[dict]:
        """Everyone matching a name, with the details a send could use.

        Substring match on first, last, nick and organisation, the way a
        person uses a name — "john" finds John Farrow, "farrow" finds him
        too. Deduplicated across accounts on the name plus the details,
        because the same person synced twice is one person.
        """
        want = " ".join(str(name or "").split()).lower()
        if len(want) < 2:
            return []
        # The pattern is data. A name with % or _ in it matches literally,
        # not as a wildcard somebody typed into a search box.
        like = "%" + (want.replace("\\", "\\\\").replace("%", r"\%")
                      .replace("_", r"\_")) + "%"
        out, seen = [], set()
        for p in databases(self.root):
            try:
                con = _open(p)
            except sqlite3.Error:
                continue
            try:
                rows = con.execute(
                    r"""SELECT Z_PK, ZFIRSTNAME f, ZLASTNAME l,
                               ZNICKNAME n, ZORGANIZATION o
                        FROM ZABCDRECORD
                        WHERE lower(coalesce(ZFIRSTNAME,'') || ' ' ||
                                    coalesce(ZLASTNAME,'')) LIKE ? ESCAPE '\'
                           OR lower(coalesce(ZNICKNAME,'')) LIKE ? ESCAPE '\'
                           OR lower(coalesce(ZORGANIZATION,''))
                               LIKE ? ESCAPE '\'
                        LIMIT 40""", (like, like, like)).fetchall()
                for r in rows:
                    emails = [e["ZADDRESS"] for e in con.execute(
                        "SELECT ZADDRESS FROM ZABCDEMAILADDRESS "
                        "WHERE ZOWNER=? AND ZADDRESS IS NOT NULL "
                        "ORDER BY Z_PK LIMIT 4", (r["Z_PK"],))]
                    phones = [ph["ZFULLNUMBER"] for ph in con.execute(
                        "SELECT ZFULLNUMBER FROM ZABCDPHONENUMBER "
                        "WHERE ZOWNER=? AND ZFULLNUMBER IS NOT NULL "
                        "ORDER BY Z_PK LIMIT 4", (r["Z_PK"],))]
                    full = " ".join(x for x in (r["f"], r["l"]) if x) \
                        or r["n"] or r["o"] or ""
                    if not full or not (emails or phones):
                        continue        # nobody to write to is not a match
                    key = (full.lower(), tuple(sorted(emails)),
                           tuple(sorted(_tail(x) for x in phones)))
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({"name": full,
                                "nick": r["n"] or "",
                                "org": r["o"] or "",
                                "emails": [str(e).strip() for e in emails],
                                "phones": [str(x).strip() for x in phones],
                                # Your own address book, not a stranger's
                                # prose — and still only ever data.
                                "provenance": "self"})
                    if len(out) >= limit:
                        return out
            except sqlite3.Error:
                continue
            finally:
                con.close()
        return out

    def holds(self, detail: str) -> bool:
        """Is this exact email or number in the address book at all?

        The re-check `write_to` runs before anything is queued: a
        recipient is either the From of a message being answered or a
        detail that exists in here — never free text, whoever wrote it.
        """
        want = str(detail or "").strip().lower()
        if not want:
            return False
        wd = _digits(want)
        for p in databases(self.root):
            try:
                con = _open(p)
            except sqlite3.Error:
                continue
            try:
                if "@" in want:
                    hit = con.execute(
                        "SELECT 1 FROM ZABCDEMAILADDRESS "
                        "WHERE lower(ZADDRESS)=? LIMIT 1", (want,)).fetchone()
                    if hit:
                        return True
                elif wd:
                    for r in con.execute(
                            "SELECT ZFULLNUMBER FROM ZABCDPHONENUMBER "
                            "WHERE ZFULLNUMBER IS NOT NULL"):
                        if _same_number(r["ZFULLNUMBER"], want):
                            return True
            except sqlite3.Error:
                continue
            finally:
                con.close()
        return False


def _digits(value: str) -> str:
    """A number as Messages would dial it, for comparing two spellings."""
    return re.sub(r"[^0-9+]", "", str(value or ""))


def _tail(value: str) -> str:
    """The significant end of a number, for telling whether two spellings
    are one phone. +44 7700 900123 and 07700 900123 are the same handset
    in two dialects; the last nine digits are the part both agree on."""
    d = _digits(value).lstrip("+")
    return d[-9:] if len(d) >= 9 else d


def _same_number(a: str, b: str) -> bool:
    da, db = _digits(a).lstrip("+"), _digits(b).lstrip("+")
    if not da or not db:
        return False
    return da == db or (len(da) >= 9 and len(db) >= 9
                        and da[-9:] == db[-9:])
