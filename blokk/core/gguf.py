"""Read enough of a GGUF header to size its KV cache honestly.

Guessing parameter count from file size is wrong in the direction that
matters. A 4.8GB file could be a dense 8B, or a mixture-of-experts whose
attention is a fraction of that — and the cache follows the attention, not
the file. Guessing high refuses a model that runs; guessing low starts one
that dies. The numbers are in the file, so read them.

Stdlib struct parsing, ~40 lines. No dependency, and no reading of tensor
data: the header is the first few kilobytes.
"""
from __future__ import annotations

import struct
from pathlib import Path

# GGUF metadata value type ids -> (struct code, size). Strings and arrays are
# handled separately because they are length-prefixed.
_FIXED = {0: ("B", 1), 1: ("b", 1), 2: ("H", 2), 3: ("h", 2), 4: ("I", 4),
          5: ("i", 4), 6: ("f", 4), 7: ("?", 1), 10: ("Q", 8), 11: ("q", 8),
          12: ("d", 8)}
_STRING, _ARRAY = 8, 9


class _Reader:
    def __init__(self, f):
        self.f = f

    def u32(self) -> int:
        return struct.unpack("<I", self.f.read(4))[0]

    def u64(self) -> int:
        return struct.unpack("<Q", self.f.read(8))[0]

    def string(self) -> str:
        return self.f.read(self.u64()).decode("utf-8", "replace")

    def value(self, t: int):
        if t == _STRING:
            return self.string()
        if t == _ARRAY:
            et, n = self.u32(), self.u64()
            return [self.value(et) for _ in range(n)]
        code, size = _FIXED[t]
        return struct.unpack("<" + code, self.f.read(size))[0]


def metadata(path: str | Path, limit: int = 4096) -> dict:
    """Header key-values. Empty dict if this is not a GGUF we understand."""
    out: dict = {}
    with open(path, "rb") as f:
        if f.read(4) != b"GGUF":
            return {}
        r = _Reader(f)
        version = r.u32()
        if version not in (2, 3):             # v1 laid arrays out differently
            return {}
        r.u64()                               # tensor count, not needed here
        for _ in range(min(r.u64(), limit)):
            try:
                key = r.string()
                out[key] = r.value(r.u32())
            except Exception:
                break                         # truncated or a type we skip
    return out


def kv_bytes_per_token(meta: dict) -> float | None:
    """Bytes of KV cache one token costs, at f16. None if the header is thin.

    2 (K and V) x layers x kv heads x head dim x 2 bytes. Grouped-query
    attention is the whole point of head_count_kv being separate from
    head_count: read the wrong one and an 8B model looks like it needs four
    times the cache it does.
    """
    arch = meta.get("general.architecture")
    if not arch:
        return None
    g = lambda k: meta.get(f"{arch}.{k}")                       # noqa: E731
    layers = g("block_count")
    heads = g("attention.head_count")
    kv_heads = g("attention.head_count_kv") or heads
    embed = g("embedding_length")
    if not layers or not kv_heads:
        return None
    head_dim = g("attention.key_length") or (
        embed // heads if embed and heads else None)
    if not head_dim:
        return None
    return 2 * layers * kv_heads * head_dim * 2


def kv_mb_per_token(path: str | Path) -> float | None:
    """What bench.kv_gb wants, measured rather than guessed. None if unknown."""
    per_token = kv_bytes_per_token(metadata(path))
    return per_token / (1024 ** 2) if per_token else None
