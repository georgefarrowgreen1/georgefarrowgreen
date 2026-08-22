"""
Turn a chosen shape into a per-tier plan.

Shared by the CLI (setup.sh) and the setup GUI so the two cannot disagree
about what "both tiers" means. The backend rule itself lives in backends.py;
this only decides which models are in play.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Importable as core.plan AND runnable as `python3 core/plan.py`, which is how
# setup.sh calls it. The path fix has to happen before the import, not in
# __main__.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.backends import pick

# name, GGUF repo, GGUF file, MLX repo, alias, blurb
SMALL = ("Qwen3-8B", "unsloth/Qwen3-8B-GGUF", "Qwen3-8B-Q4_K_M.gguf",
         "mlx-community/Qwen3-8B-4bit", "qwen3-8b")
LARGE = ("Qwen3.6-35B-A3B", "unsloth/Qwen3.6-35B-A3B-GGUF",
         "Qwen3.6-35B-A3B-Q4_K_M.gguf",
         "mlx-community/Qwen3.6-35B-A3B-4bit", "qwen3.6-35b-a3b")
DENSE = ("Qwen3.8-27B", "unsloth/Qwen3.8-27B-GGUF", "Qwen3.8-27B-Q4_K_M.gguf",
         "mlx-community/Qwen3.8-27B-4bit", "qwen3.8-27b")

SHAPES = [
    {"id": "small", "title": "Qwen3-8B",
     "sub": "One model, one server",
     "detail": "Fast, and around 7B is where tool calling starts working at "
               "all rather than merely working worse. 24GB Macs and up.",
     "gb": 4.6},
    {"id": "moe", "title": "Qwen3.6-35B-A3B",
     "sub": "One model, mixture-of-experts",
     "detail": "Knows considerably more while reading only its active experts "
               "per token, so it stays quick. 48GB and up.",
     "gb": 20},
    {"id": "dense", "title": "Qwen3.8-27B",
     "sub": "One model, dense",
     "detail": "Strongest per gigabyte. Slower — roughly 25 tok/s against the "
               "MoE's 67 on an M3 Ultra. 48GB and up.",
     "gb": 18},
    {"id": "both", "title": "8B triage + 35B MoE",
     "sub": "Two tiers, probably two backends",
     "detail": "Most agent work is triage and does not need a big model. A "
               "real optimisation, and a second server to keep alive — reach "
               "for it after measuring your own mix.",
     "gb": 24.6},
]


def _tier(tier: str, spec, slots: int, ctx_k: int, port: int) -> dict:
    name, gguf_repo, gguf_file, mlx_repo, alias = spec
    backend, why = pick(name, slots=slots, ctx_k=ctx_k)
    repo, f = (mlx_repo, "-") if backend == "mlx" else (gguf_repo, gguf_file)
    return {"tier": tier, "backend": backend, "repo": repo, "file": f,
            "alias": alias, "port": port, "why": why, "model": name}


def build(shape: str, slots: int = 4, ctx_k: int = 32) -> list[dict]:
    if shape == "both":
        return [_tier("SMALL", SMALL, slots, ctx_k, 8081),
                _tier("LARGE", LARGE, max(1, slots // 2), ctx_k, 8082)]
    spec = {"moe": LARGE, "dense": DENSE}.get(shape, SMALL)
    return [_tier("SMALL", spec, slots, ctx_k, 8081)]


if __name__ == "__main__":               # still drives setup.sh
    choice, slots, ctx_k = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    shape = {"1": "small", "2": "moe", "3": "both"}.get(choice, "small")
    for t in build(shape, slots, ctx_k):
        print("\t".join([t["tier"], t["backend"], t["repo"], t["file"],
                         t["alias"], str(t["port"]), t["why"]]))
