"""
Backends.

Blokk talks to any server that speaks the OpenAI chat API, so llama.cpp and
MLX are both just ports. Running both at once costs nothing architecturally —
the interesting question is which model belongs on which.

The evidence, as of August 2026:

  dense, under ~14B      MLX leads by 20–87% on single-request decode
  dense, above ~27B      the two converge; memory bandwidth is the limit
  mixture-of-experts     MLX decodes ~1.5x faster (58 vs 38 tok/s on
                         Qwen3.6-35B-A3B). This is MLX's MoE kernel path,
                         not a server trick
  many concurrent slots  llama-server's multi-slot continuous batching is
                         the mature one
  long prefill (>30k)    llama.cpp's FlashAttention wins

Which gives a rule that is genuinely useful and also genuinely approximate.
`bench.py --compare` runs the same model on both on YOUR machine and tells
you which won, because a rule assembled from other people's benchmarks is a
starting point, not an answer.

Nothing above this layer knows or cares which backend is in use.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Backend:
    name: str
    install: str
    serve: str          # {model} {port} {slots} {ctx} get substituted
    weights: str        # where the model comes from
    note: str


LLAMACPP = Backend(
    name="llama.cpp",
    install="brew install llama.cpp",
    serve=("llama-server -hf {repo}:{file} --alias {alias} --port {port} "
           "-cb -np {slots} -c {ctx} -fa --log-disable"),
    weights="GGUF",
    note="mature slot manager, one binary, GGUF exists for everything",
)

MLX = Backend(
    name="mlx",
    install="pip install mlx-lm",
    serve=("mlx_lm.server --model {repo} --port {port} "
           "--max-tokens 2048"),
    weights="MLX (mlx-community on Hugging Face)",
    note="faster decode, and much faster on MoE",
)

BACKENDS = {b.name: b for b in (LLAMACPP, MLX)}


def pick(model: str, *, slots: int = 1, ctx_k: int = 32) -> tuple[str, str]:
    """Suggest a backend for a model. Returns (backend name, why).

    Deliberately a suggestion. The numbers behind it were measured on other
    people's Macs, and the gaps are small enough that your chip, your
    quantisation and your context length can flip them.
    """
    m = model.lower()

    if any(t in m for t in ("-a3b", "-a17b", "moe", "a3b")):
        return "mlx", ("MoE — MLX's expert-gather path decodes about 1.5x "
                       "faster than llama.cpp here, and that gap is the "
                       "largest of any in the table")

    if slots >= 4:
        return "llama.cpp", (f"{slots} parallel slots — llama-server's "
                             "continuous batching is the mature one, and "
                             "concurrency is worth nothing without it")

    if ctx_k >= 30:
        return "llama.cpp", (f"{ctx_k}k context — FlashAttention wins on "
                             "prefill once prompts get long")

    size = _params_b(m)
    if size and size <= 14:
        return "mlx", (f"~{size}B dense — MLX leads by 20–87% under 14B on "
                       "single-request decode")

    return "llama.cpp", ("above ~27B the two converge on bandwidth, so take "
                         "the maturer server and the easier install")


def _params_b(model: str) -> int | None:
    import re
    m = re.search(r"(\d+(?:\.\d+)?)\s*b\b", model.replace("-", " "))
    if not m:
        return None
    try:
        return int(float(m.group(1)))
    except ValueError:
        return None


def plan(small: str, large: str | None, slots: int, ctx_k: int) -> list[dict]:
    """Work out which servers to start. Two tiers may share one."""
    out = []
    sb, swhy = pick(small, slots=slots, ctx_k=ctx_k)
    out.append({"tier": "small", "model": small, "backend": sb,
                "why": swhy, "port": 8081})
    if large and large != small:
        lb, lwhy = pick(large, slots=max(1, slots // 2), ctx_k=ctx_k)
        out.append({"tier": "large", "model": large, "backend": lb,
                    "why": lwhy, "port": 8082 if lb != sb or True else 8081})
    return out
