# CLAUDE.md

Context for Claude Code working in this repo. Read this before changing
anything.

## What Blokk is

A local agent runtime for several small businesses on one Mac. It sweeps mail,
calendar and other sources overnight, queues anything needing a decision, and
learns from the corrections. Nothing leaves the machine.

Stdlib only — no `pip install` for Blokk itself. That constraint is
deliberate: this has to still boot in two years on a machine nobody has
maintained. **Do not add a dependency without asking.** The one exception is
the model server, which is a separate process behind an HTTP interface.

## The invariants

These are load-bearing. Breaking one is not a refactor, it is a different
product.

**1. The workflow decides. Activities do.**
Workflow code in `flows/` is deterministic — no clock, no network, no
randomness, no `uuid4`. Every side effect goes through
`ctx.activity(..., side_effect=True)`, which carries an idempotency key
derived from run and step. On restart the journal replays: completed steps
return recorded results without executing. Use `ctx.now()` and `ctx.uuid()`,
never the real ones.

**2. One write path.**
Everything that changes the world funnels through the approval queue and the
trust gate in `core/harness.py:Policy`. The chat surface (`core/ask.py`) is
read-only *by construction* — there is no write tool in that file, and adding
one would reopen the injection trifecta through the front door. If Ask needs
to act, it queues a proposal.

**3. Untrusted content is data, never instruction.**
Anything fetched from outside — an email body, a web page — carries
`provenance` and goes through `quarantine_read` before reaching a model. The
regex in there is triage, not defence; the defence is that the reader has no
tools. Do not "improve" it into a filter people rely on.

**4. Trust is per workspace AND per category, and never transfers.**
Ninety clean approvals on cottage enquiries earns cottage enquiries autonomy.
It earns invoice chasing nothing. Some categories are pinned to manual and
must never graduate.

**5. Scope is data, not prompt.**
Workspace isolation is enforced in SQL and in the credential registry. An
agent told not to look at another workspace will eventually look at another
workspace.

**6. Fail loudly, degrade locally.**
One broken connector must not take the night's sweep. One malformed row must
not take an endpoint. But nothing may fail *silently* — a truncated stream, a
dropped connection or a greyed-out card that did not actually send are all
worse than an error.

## Layout

    blokk              single entrypoint: wizard if unconfigured, else run
    setup.sh / run.sh  terminal equivalents; share core/plan.py + core/servers.py
    bench.py           sizes the machine; --serve measures; --compare settles
    connect.py         wire real data sources, one at a time
    seed.py            sample world, safe to re-run

    core/schema.sql    the data model. One SQLite file; the thing to back up
    core/durable.py    journal, replay, idempotency, signal suspend/resume
    core/harness.py    agent loop, context budget, policy gate, consolidation
    core/ask.py        read-only chat agent, AG-UI events
    core/models.py     Router + ServedModel (any OpenAI-compatible server)
    core/backends.py   llama.cpp vs MLX rule, with the evidence in comments
    core/plan.py       shape -> per-tier plan
    core/servers.py    model server lifecycle, shared by GUI and CLI
    core/connectors/   iCloud IMAP, Messages, CalDAV, and the fake world
    flows/             workflow definitions
    api/server.py      control plane. Stdlib http.server. Holds credentials
    web/               dashboard, setup wizard, PWA
    demo/              browser port of the engine + the test suites
    brand/             the mark, generated parametrically

## Tests — run all four before committing

    python3 demo/hunt.py       adversarial pass over the server
    node demo/hunt_ui.js       adversarial pass over the front end
    node demo/contract.js      API satisfies what paint() reads
    node demo/journey.js       four end-to-end journeys

Or `./test.sh`. All four must print `0 issues found` / `pass`.

Two entries in `hunt.py` report `ok` because they are **choices, not defects**:
loopback is trusted without a token (A1), and episodes outlive the approvals
they came from (A7). Do not "fix" them.

`demo/engine.js` is a port of `core/durable.py` and `core/harness.py`. **If
you change a threshold or a rule in Python, change it there too and re-run
`journey.js`**, or the two drift and the demo starts lying.

## Conventions

* Comments explain *why*, and especially why-not. If a line looks wrong and
  isn't, say what it is defending against.
* A bug fix gets a probe in `hunt.py` or `hunt_ui.js`. Fixed once is not
  fixed.
* Search, don't list. Every read takes a filter and a limit.
* Error messages name what broke and what to do. "Connection refused" in a log
  at 04:00 is not an error message.
* Shell scripts must run on **bash 3.2** — macOS still ships it. No `${var,,}`,
  no `${arr[-1]}`, no associative arrays.
* Never put prompt or completion text in span attributes or logs. Hash and
  pointer only; guest names must not end up in a second store with different
  retention.

## Known-good state

All four suites green. Verified behaviours:

* crash after a side effect, restart -> 4 steps replayed, 227k tokens not
  re-spent, 1 send fired, 0 duplicates
* injected email quarantined and given no draft
* approving 20 clean graduates a category; pinned categories never do
* a dead model server degrades per workspace rather than 500ing the sweep
* a silent model server is detected in 0.4s (output drained on a thread)

## Not built yet

* `core/sandbox.py` — needed before code mode. gVisor or a microVM **plus an
  egress allowlist**; kernel isolation with open outbound is worth nothing.
* the regression runner — the `regression` table exists, nothing runs it.
  Twenty frozen examples nightly, or a model swap degrades quality silently
  and a guest finds out first.
* a real `answer()` on `ServedModel` is wired but unexercised against weights.
* connectors are read-only. Sending is a separate connector, deliberately not
  written.

## If you are picking this up cold

Start it with no model at all — `./setup.sh --stubs && ./run.sh` — and press
"Run the sweep". Every mechanism is real; only the prose is fake. That is the
fastest way to see what the system does before reading how.
