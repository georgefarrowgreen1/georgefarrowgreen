# Setting up the Mac

    ./blokk

That is the whole thing. It opens a setup wizard in your browser, and once
configured the same command starts everything. You should not have to know
which state you are in.

The wizard shows what your Mac will actually run before you pick — the model
table with weights, KV cache and verdicts against your real memory — then the
backend plan with its reasoning, then streams the installer and the weights
download. The progress is the downloader's own output, not a bar we invented.

If you would rather stay in the terminal, `./setup.sh` and `./run.sh` do the
same thing; both share `core/plan.py` and `core/servers.py`, so they cannot
drift apart. Blokk itself needs nothing installed — it runs on
the Python that ships with macOS. `setup.sh` asks one question, installs
llama.cpp, picks a model and writes `blokk.conf`. `run.sh` starts the model
server and Blokk together and stops both on Ctrl-C.

No environment variables to export, no second server to remember, no Python
environment to activate.

## Both, actually

Blokk talks to any server that speaks the OpenAI chat API, so llama.cpp and
MLX are just ports. Running both costs nothing architecturally — nothing
above `core/models.py` knows which is which.

    ./setup.sh --both

picks a backend per tier and starts both. On a typical plan that comes out
as llama.cpp for the concurrent triage tier and MLX for the MoE drafting
tier, because those are the two places each one wins.

The rule lives in `core/backends.py`, in one place, with the evidence in
comments:

    dense under ~14B       MLX leads 20–87% on single-request decode
    dense above ~27B       they converge; bandwidth is the limit
    mixture-of-experts     MLX ~1.5x faster (58 vs 38 tok/s on 35B-A3B)
    many parallel slots    llama-server's batching is the mature one
    long prefill (>30k)    llama.cpp FlashAttention wins

It is a suggestion, not a verdict. Settle it on your own machine:

    python3 bench.py --compare http://127.0.0.1:8081/v1 http://127.0.0.1:8082/v1

That runs the same prompt on both, single and concurrent, and reports the
aggregate — which is the number a sweep experiences. It will tell you when
single-request speed and aggregate throughput disagree, and they do disagree:
a backend can be 60% faster per request and still lose a sweep by 46% because
it time-slices instead of batching.

## Why llama.cpp is the default

If you only run one, run this one — which is the opposite of the usual advice
for Apple Silicon.

The usual advice is right about single-request speed: MLX leads by 20–87%
under 14B, and above 27B the two converge because memory bandwidth becomes
the bottleneck either way. But Blokk does not run one request. It runs four
or five workers at once, and **the mature multi-slot continuous-batching
server is llama-server, not the MLX ecosystem**. It is also one
`brew install`, one binary, and GGUF weights that exist for everything.

`-cb -np 4` is the whole configuration. Each slot gets its own KV cache
region, so memory scales linearly with the slot count — which is why
`bench.py` sizes cache rather than model files.

**The one exception: mixture-of-experts.** On Qwen3.6-35B-A3B, MLX-native
serving decodes about 1.5x faster than llama.cpp (roughly 58 versus 38
tok/s). If you pick the MoE model and the speed disappoints, that is why.
Everything else, llama.cpp is level or ahead.

**Avoid plain Ollama for this.** Its concurrency is cooperative time-slicing
rather than true continuous batching — requests are not merged at the token
level, so throughput saturates as context grows. Fine for one chat window,
wrong for a sweep. (Ollama 0.19+ swapped to MLX underneath and is much
faster per request; the batching model is the problem, not the engine.)

## Check the batching is real

    python3 bench.py --serve

Under 1.4x means the server is not batching, and adding workers will buy you
nothing. Fix that before anything else.

## One model, not two

`setup.sh` points both tiers at the same server. Two tiers is a real
optimisation — most agent work is triage and does not need a big model — but
it is an optimisation you should reach for after measuring your own mix, not
before. A second server is a second thing to keep alive at 04:00.

When you do want it, edit `blokk.conf`:

    BLOKK_SMALL_URL=http://127.0.0.1:8081/v1
    BLOKK_LARGE_URL=http://127.0.0.1:8082/v1

and start the second server yourself. `blokk.conf` beats the environment, so
a forgotten `export` in one shell cannot give you a different setup from the
launch agent.

## Picking the model

`setup.sh` offers three. `python3 bench.py` shows why, against your actual
chip and memory.

**Qwen3-8B** — the default. Around 7B is where tool calling stops working at
all rather than merely working worse; a 3B model tested across nine agent
scenarios made zero tool-call attempts. Fast, fits anything from 24GB.

**Qwen3.6-35B-A3B** — MoE. Knows considerably more while reading only its
active experts per token. Note the MLX caveat above.

**Qwen3.8-27B** — dense, Apache 2.0, strongest per gigabyte. Slower: on an
M3 Ultra roughly 25 tok/s against the MoE's 67.

Two things worth ignoring: parameter count as a proxy for anything (bytes
read per token is what sets speed, cache headroom is what sets concurrency),
and published benchmark scores (they measure the full-precision release, not
the 4-bit build you will actually run, and nobody publishes the delta).

## Keeping it up

    cp launchd/com.blokk.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.blokk.plist

The agent keeps the control plane alive; the control plane does the sweeping.
It reads everything wired to it once a day — 04:00 unless you change it in
the app, on the Night shift row.

    sudo pmset -a sleep 0 powernap 1     # optional: sweep at 04:00, not at 09:14

Optional, not required. A shut lid at 04:00 does not lose you a night: the
sweep runs when the Mac next wakes, once, and reads everything since the
last one rather than a fixed window. Keeping it awake only buys you a queue
that is already full at breakfast instead of one that fills while you make
the coffee.

## Order

1. `./setup.sh --stubs && ./run.sh` — prove the queue and approvals work
   with no model at all. Every mechanism is real; only the prose is fake.
2. `./setup.sh` — attach a model.
3. `python3 bench.py --serve` — confirm the batching gain.
4. `CONNECTING.md` — your own data, read-only, one source at a time.

Reversing 3 and 4 is the common mistake: a good model reading fake mail is
worth less than a small one reading yours.
