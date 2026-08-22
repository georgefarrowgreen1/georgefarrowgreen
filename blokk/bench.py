#!/usr/bin/env python3
"""
What will this Mac actually run?

    python3 bench.py            inspect the machine, size the options
    python3 bench.py --serve    also measure a running MLX server

Every "best local model" table you will read is written for a machine that is
not yours, and the number that decides everything — how much cache is left
after the weights — depends on your memory, your context length and how many
workers you want at once. So this measures rather than asserts.

Two things it will tell you that the tables do not:

  * Your ceiling is KV cache, not model size. A 27B model that "fits" in
    18GB leaves you room for one worker at long context, and Blokk wants
    five.
  * Decode speed is bandwidth divided by the bytes you touch per token. On a
    dense model that is the whole file. On an MoE it is only the active
    experts, which is why a 35B MoE outruns a 27B dense on the same chip.
"""
from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
import time

# Bandwidth is not queryable, so it is looked up per chip. Decode speed is
# bandwidth-bound, so getting this wrong makes every estimate wrong.
BANDWIDTH = {
    "M1": 68, "M1 Pro": 200, "M1 Max": 400, "M1 Ultra": 800,
    "M2": 100, "M2 Pro": 200, "M2 Max": 400, "M2 Ultra": 800,
    "M3": 100, "M3 Pro": 150, "M3 Max": 400, "M3 Ultra": 819,
    "M4": 120, "M4 Pro": 273, "M4 Max": 546,
    "M5": 150, "M5 Pro": 307, "M5 Max": 614, "M5 Ultra": 1000,
}

# Sizes are 4-bit MLX builds. `active` is what a token actually reads.
#
# For dense models that is the whole file. For MoE it is NOT the nominal
# active-parameter count: attention and shared weights are read every token
# too, so a "3B active" model behaves like ~6.7GB of reads. That figure is
# back-solved from a published measurement (Qwen3.6-35B-A3B at ~45 tok/s on
# an M4 Max, 546 GB/s) rather than derived, because deriving it gets you
# 200 tok/s and a nasty surprise.
MODELS = [
    # name                       GB    active GB  role      note
    ("Qwen3-1.7B-4bit",          1.1,  1.1,  "small",
     "runs on 8GB. Too small to call tools reliably — drafts, not decisions"),
    ("Qwen3-4B-4bit",            2.5,  2.5,  "small",
     "the smallest that is worth pointing at real mail. 8GB and up"),
    ("Qwen3-8B-4bit",            4.6,  4.6,  "small",
     "the triage tier. Around 7B is the floor where tool calling works at all"),
    ("Qwen3.5-8B-4bit",          4.8,  4.8,  "small",
     "same tier, newer instruction tuning"),
    ("gpt-oss-20b (MXFP4)",     12.0, 12.0,  "small+",
     "Apache 2.0, 128K context, reasoning-tuned"),
    ("Qwen3.8-27B-4bit",        18.0, 18.0,  "large",
     "dense. Strongest open weights per GB right now, slowest per token"),
    ("Qwen3.6-35B-A3B-4bit",    20.0,  6.7,  "large",
     "MoE, ~3B active. Reads a tenth of the file per token — the fast pick"),
    ("Gemma-4-31B-4bit",        19.0, 19.0,  "large",
     "dense, strong on code"),
    ("Llama-3.3-70B-4bit",      40.0, 40.0,  "large+",
     "only worth it if you have the memory to spare and can wait"),
]

KV_PER_TOKEN_MB = {2: 0.025, 4: 0.040, 8: 0.065, 27: 0.150, 31: 0.160,
                   35: 0.070, 70: 0.164}
OS_RESERVE_GB = 12          # macOS, Blokk, your browser, Messages


def usable_gb(ram_gb: float) -> float:
    """What is actually left for weights and cache.

    A flat 12 GB is right on a 64 GB machine and absurd on an 8 GB one: it
    reports zero usable and every model as "does not fit", which is how an
    8 GB Mac ends up being handed a plan for a 4.6 GB model with four 32k
    slots. macOS idles at roughly 3 GB and grows with what you run, so scale
    with the machine and keep the old number as the ceiling — big Macs behave
    exactly as before, small ones stop being told a flat lie.
    """
    return max(0.0, ram_gb - max(3.0, min(float(OS_RESERVE_GB), ram_gb * 0.35)))


# Largest to smallest. The first that fits wins, so a big Mac still gets the
# four batched slots the whole design is built around.
LADDER = ((4, 32), (4, 16), (2, 32), (2, 16), (2, 8), (1, 16), (1, 8), (1, 4))


def fit(params_b: float, model_gb: float, ram_gb: float) -> tuple[int, int]:
    """(slots, ctx_k) this Mac can hold. (0, 0) only when it is hopeless.

    Weights and cache are not the same kind of memory, and treating them as
    one number refuses models that demonstrably run. llama.cpp mmaps the GGUF,
    so the weights are file-backed: the OS pages them in and out, and a model
    somewhat larger than nominally free memory works, just slower. The KV
    cache is the opposite — anonymous memory, allocated up front, and it has
    to fit or llama-server dies at startup.

    So size the cache against what is left once the weights have taken their
    share, let the weights themselves overrun, and keep a floor: there is
    always room for one small slot, because the alternative is telling
    somebody their own model does not run when they have already run it.

    The 0.8 margin on the cache is not politeness. It is allocated before the
    first token and the OS grows underneath it, so sizing to the last byte
    gets a server that starts and dies an hour into the night's sweep.
    """
    usable = usable_gb(ram_gb)
    if model_gb > ram_gb * 1.5:            # paging this would be all it did
        return 0, 0
    room = max(0.4, (usable - min(model_gb, usable * 0.9)) * 0.8)
    for slots, ctx_k in LADDER:
        if kv_gb(params_b, ctx_k, slots) <= room:
            return slots, ctx_k
    return 1, 4                            # the floor, not a refusal


def strains(model_gb: float, ram_gb: float) -> bool:
    """True when the weights alone exceed what is nominally free.

    Worth saying out loud — it will page, and a sweep will be slow — but it
    is advice, not a veto. The person at the keyboard knows what they have
    run on this machine and this function does not.
    """
    return model_gb > usable_gb(ram_gb)


def sysctl(key: str) -> str:
    try:
        return subprocess.run(["sysctl", "-n", key], capture_output=True,
                              text=True, timeout=5).stdout.strip()
    except Exception:                                            # noqa: BLE001
        return ""


def machine() -> dict:
    if platform.system() != "Darwin":
        return {"chip": "not a Mac", "ram_gb": 0, "bandwidth": 0, "cores": 0}
    brand = sysctl("machdep.cpu.brand_string") or "Apple"
    chip = next((k for k in sorted(BANDWIDTH, key=len, reverse=True)
                 if k in brand), "M?")
    ram = int(sysctl("hw.memsize") or 0) // (1024 ** 3)
    return {"chip": chip, "brand": brand, "ram_gb": ram,
            "bandwidth": BANDWIDTH.get(chip, 200),
            "cores": int(sysctl("hw.ncpu") or 0)}


def kv_gb(params_b: int, ctx_k: int, workers: int) -> float:
    per = min(KV_PER_TOKEN_MB, key=lambda k: abs(k - params_b))
    return workers * ctx_k * 1000 * KV_PER_TOKEN_MB[per] / 1024


def decode_tps(active_gb: float, bandwidth: float, efficiency=0.55) -> float:
    """Bandwidth over bytes touched per token. The one estimate that holds.

    Calibration check: 546 GB/s (M4 Max) against 6.7 GB of effective reads
    gives ~45 tok/s, which matches the published figure for Qwen3.6-35B-A3B.
    If you change `efficiency`, re-check that it still lands there.
    """
    return bandwidth * efficiency / max(active_gb, 0.1)


def batched(single: float, n: int, saturation=6.0) -> float:
    """Continuous batching amortises the weight read across sequences.

    Amdahl-shaped: real gains to about 4-5x, then flat. Only true on a
    batching server — plain Ollama stays at 1x however many you send it.
    """
    return single * (n * saturation) / (n + saturation - 1)


def report(m: dict, ctx_k: int, workers: int) -> None:
    usable = usable_gb(m["ram_gb"])
    print(f"\n  {m.get('brand', 'unknown')}")
    print(f"  {m['ram_gb']} GB unified · ~{m['bandwidth']} GB/s · "
          f"{usable:.0f} GB usable after "
          f"{m['ram_gb'] - usable:.0f} GB for macOS and everything else\n")

    print(f"  Sized for {workers} concurrent workers at {ctx_k}k context each.")
    print(f"  {'model':<26} {'weights':>8} {'kv':>7} {'total':>7} {'tok/s':>7} "
          f"{'batched':>8}   verdict")
    print("  " + "-" * 96)

    fits = []
    for name, size, active, role, note in MODELS:
        params = int("".join(c for c in name.split("-")[1] if c.isdigit()) or 8)
        cache = kv_gb(params, ctx_k, workers)
        total = size + cache
        one = decode_tps(active, m["bandwidth"])
        many = batched(one, workers) / workers
        ok = total <= usable
        if not ok:
            verdict = (f"needs {total - usable:.0f} GB more"
                       if total - usable < 30 else "no")
        elif many < 8:
            verdict = "fits, too slow"      # a nightly sweep would run past dawn
        elif many < 18:
            verdict = "fits, sluggish"
        else:
            verdict = "fits"
        print(f"  {name:<26} {size:>7.1f}G {cache:>6.1f}G {total:>6.1f}G "
              f"{one:>6.0f} {many:>7.0f}   {verdict}")
        if ok and many >= 8:
            fits.append((name, role, one, note))

    print()
    smalls = [f for f in fits if f[1].startswith("small")]
    larges = [f for f in fits if f[1].startswith("large")]
    if not fits:
        print("  Nothing fits at these settings. Drop the context or the worker count —")
        print("  both are arguments to this script — before buying memory.\n")
        return

    print("  Pairing for Blokk")
    if smalls:
        s = max(smalls, key=lambda f: f[2])
        print(f"    small   {s[0]}\n            {s[3]}")
    if larges:
        l = max(larges, key=lambda f: f[2])       # fastest that fits, not biggest
        print(f"    large   {l[0]}\n            {l[3]}")
    if not larges:
        print("    large   nothing fits. Run small-only and escalate to a cloud")
        print("            model for drafting until you have more memory.")
    print("""
  Route roughly 80% of the work to the small model — triage, extraction,
  classification. Log your own mix for a fortnight before trusting that
  split; measure yours rather than inheriting a number from a blog.
""")


def measure(url: str, model: str, n: int) -> None:
    """Time a real server. Estimates are estimates."""
    import urllib.request
    body = json.dumps({"model": model, "max_tokens": 120,
                       "messages": [{"role": "user",
                                     "content": "Count from one to sixty in words."}]}).encode()

    def once() -> tuple[float, int]:
        t0 = time.time()
        req = urllib.request.Request(f"{url}/chat/completions", body,
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read())
        return time.time() - t0, d.get("usage", {}).get("completion_tokens", 0)

    print(f"\n  Measuring {model} at {url}")
    try:
        dt, tok = once()
    except Exception as e:                                       # noqa: BLE001
        print(f"  no server there: {e}")
        print("  start one first, e.g.  vllm-mlx serve mlx-community/"
              "Qwen3-8B-4bit --port 8081\n")
        return
    print(f"    single stream   {tok/dt:6.1f} tok/s")

    import threading
    out, lock = [], threading.Lock()

    def worker():
        try:
            d, t = once()
            with lock:
                out.append(t / d)
        except Exception:                                        # noqa: BLE001
            pass

    t0 = time.time()
    ts = [threading.Thread(target=worker) for _ in range(n)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    wall = time.time() - t0
    if out:
        agg = sum(out)
        print(f"    {n} concurrent   {agg:6.1f} tok/s aggregate, "
              f"{agg/len(out):.1f} each, {wall:.1f}s wall")
        gain = agg / (tok / dt)
        print(f"    batching gain   {gain:.1f}x")
        if gain < 1.4:
            print("\n    Flat. This server is not batching — that is the single")
            print("    biggest thing to fix before adding workers, because")
            print("    concurrency buys you nothing without it.")
        else:
            print(f"\n    Real batching. {n} workers cost {n/gain:.1f}x the time")
            print("    of one, not {n}x.".replace("{n}", str(n)))
    print()


def compare(a_url: str, b_url: str, a_name: str, b_name: str,
            model: str, n: int) -> None:
    """Same model, both backends, your machine.

    The rule in core/backends.py comes from other people's benchmarks on
    other people's Macs, and the gaps are small enough that your chip, your
    quantisation and your context length can flip them. This settles it.
    """
    print(f"\n  Head to head: {a_name} vs {b_name}\n")
    results = {}
    for label, url in ((a_name, a_url), (b_name, b_url)):
        try:
            single, agg, gain = _probe(url, model, n)
        except Exception as e:                                   # noqa: BLE001
            print(f"  {label:<12} unreachable at {url} — {e}")
            continue
        results[label] = (single, agg, gain)
        print(f"  {label:<12} {single:6.1f} tok/s single   "
              f"{agg:6.1f} aggregate at {n}   {gain:.1f}x batching")

    if len(results) == 2:
        (an, (asg, aag, agn)), (bn, (bsg, bag, bgn)) = results.items()
        print()
        # Aggregate is the number that matters for a sweep. Single-request
        # speed is what benchmarks quote and what you will not experience.
        win, lose = (an, bn) if aag >= bag else (bn, an)
        margin = max(aag, bag) / max(min(aag, bag), 0.01)
        print(f"  On this machine {win} wins on aggregate throughput by "
              f"{margin:.2f}x.")
        if margin < 1.15:
            print("  That is close enough to be noise. Take the one that is "
                  "easier to keep alive.")
        single_win = an if asg >= bsg else bn
        if single_win != win:
            print(f"  Single-request would have told you {single_win} — which "
                  f"is the number every\n  benchmark quotes, and the one your "
                  f"sweep never experiences. Trust the\n  aggregate.")
        else:
            print("  Both measures agree, so this one is not close.")
    print()


def _probe(url: str, model: str, n: int) -> tuple[float, float, float]:
    import threading
    import urllib.request
    body = json.dumps({"model": model, "max_tokens": 120,
                       "messages": [{"role": "user",
                                     "content": "Count from one to sixty in words."}]}).encode()

    def once() -> tuple[float, int]:
        t0 = time.time()
        req = urllib.request.Request(f"{url}/chat/completions", body,
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read())
        return time.time() - t0, d.get("usage", {}).get("completion_tokens", 0)

    dt, tok = once()
    single = tok / dt
    out, lock = [], threading.Lock()

    def worker():
        try:
            d, t = once()
            with lock:
                out.append(t / d)
        except Exception:                                        # noqa: BLE001
            pass

    ts = [threading.Thread(target=worker) for _ in range(n)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    agg = sum(out) if out else 0.0
    return single, agg, (agg / single if single else 0)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ctx", type=int, default=40, help="context per worker, in k")
    p.add_argument("--workers", type=int, default=5)
    p.add_argument("--serve", metavar="URL", nargs="?",
                   const="http://127.0.0.1:8081/v1")
    p.add_argument("--model", default="default")
    p.add_argument("--compare", nargs=2, metavar=("LLAMA_URL", "MLX_URL"),
                   help="same model on both backends; settles it on your box")
    a = p.parse_args()

    if a.compare:
        compare(a.compare[0], a.compare[1], "llama.cpp", "mlx",
                a.model, a.workers)
        return 0

    m = machine()
    if m["ram_gb"] == 0:
        print("\n  Not a Mac — showing the model table with an assumed 96 GB.\n")
        m = {"brand": "assumed M3 Ultra 96 GB", "chip": "M3 Ultra",
             "ram_gb": 96, "bandwidth": 819, "cores": 28}
    report(m, a.ctx, a.workers)
    if a.serve:
        measure(a.serve, a.model, a.workers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
