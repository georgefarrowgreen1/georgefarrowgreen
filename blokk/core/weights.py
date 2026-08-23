"""Adding and removing model files, without moving gigabytes around.

Weights already live somewhere on the Mac — a Downloads folder, an external
disk, a folder called "Gemma 4 Models". Copying them into models/ would
duplicate several gigabytes for no reason, and uploading them through a
browser to a server on the same machine is worse. So `add` links them.

That choice is also what makes `remove` safe: taking away a link takes away
nothing. Weights that were copied into models/ rather than linked are never
deleted from here — a web button that erases six gigabytes on a misclick is
not a feature, and Finder already does it with an undo.
"""
from __future__ import annotations

from pathlib import Path

from core import gguf


def _dir(root: Path) -> Path:
    d = root / "models"
    d.mkdir(exist_ok=True)
    return d


def listing(root: Path) -> list[dict]:
    out = []
    for f in sorted(_dir(root).glob("*.gguf")):
        try:
            st = f.stat()                     # follows the link, so this is
        except OSError:                       # the real size, or a dead link
            out.append({"name": f.name, "gb": 0, "linked": True,
                        "target": "", "broken": True})
            continue
        out.append({"name": f.name, "gb": round(st.st_size / (1024 ** 3), 1),
                    "linked": f.is_symlink(),
                    "target": str(f.resolve()) if f.is_symlink() else "",
                    "broken": False})
    return out


def add(root: Path, path: str) -> dict:
    """Link one .gguf, or every .gguf in a folder."""
    try:
        p = Path(path).expanduser()
        here = p.exists()
    except OSError as e:
        # A path too long for the filesystem raises out of exists() rather
        # than answering False, and the traceback names neither the field nor
        # what to do about it.
        return {"error": f"that path will not open: {e.strerror or e}"}
    if not here:
        return {"error": f"nothing at {p}"}
    files = sorted(p.glob("*.gguf")) if p.is_dir() else [p]
    if not files:
        return {"error": f"no .gguf files in {p}"}

    added, skipped = [], []
    for f in files:
        if f.suffix.lower() != ".gguf":
            skipped.append({"name": f.name, "why": "not a .gguf"})
            continue
        # Read the header before linking. A file that llama.cpp cannot open is
        # better refused here than at 04:00 with the model server dying.
        try:
            if not gguf.metadata(f, want={"general.architecture"}):
                skipped.append({"name": f.name, "why": "not a GGUF file"})
                continue
        except OSError as e:
            skipped.append({"name": f.name, "why": f"cannot read it: {e.strerror}"})
            continue
        link = _dir(root) / f.name
        if link.exists() or link.is_symlink():
            skipped.append({"name": f.name, "why": "already in models/"})
            continue
        try:
            link.symlink_to(f.resolve())
        except OSError as e:                  # a filesystem without links
            skipped.append({"name": f.name, "why": f"could not link: {e.strerror}"})
            continue
        added.append({"name": f.name,
                      "gb": round(f.stat().st_size / (1024 ** 3), 1)})
    return {"ok": True, "added": added, "skipped": skipped}


def remove(root: Path, name: str) -> dict:
    """Unlink. Never deletes weights that actually live in models/."""
    if "/" in name or name in ("", ".", ".."):
        return {"error": "bad name"}
    f = _dir(root) / name
    try:
        here = f.exists() or f.is_symlink()
    except OSError as e:
        return {"error": f"that name will not open: {e.strerror or e}"}
    if not here:
        return {"error": f"no {name} in models/"}
    if not f.is_symlink():
        return {"error": f"{name} is a real file in models/, not a link. "
                         f"Blokk will not delete weights — remove it in Finder "
                         f"if you meant to."}
    f.unlink()
    return {"ok": True, "detail": f"unlinked {name}. The file itself is untouched."}
