# CLAUDE.md

Context for Claude Code working in this repo. Read this before changing
anything.

## What Blokk is

A local agent runtime for several small businesses on one Mac. It sweeps mail,
calendar and other sources overnight, queues anything needing a decision, and
learns from the corrections. Your content never leaves the machine; the few
requests that do go out are named per workspace and logged — see invariant 3.

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
never the real ones — and **call them from workflow level, never from inside
an activity body**. `ctx.now()` is itself a journalled step: called inside an
activity it happens on the first run and not on the replay, because the body
does not run the second time, and every step after it then comes back holding
the step before's result. Steps are matched by number; `durable.py` now checks
the recorded name too and raises `Nondeterministic` rather than handing back
the wrong one.

**2. One write path.**
Everything that changes the world funnels through the approval queue and the
trust gate in `core/harness.py:Policy`. The chat surface (`core/ask.py`) is
read-only *by construction* — there is no write tool in that file, and adding
one would reopen the injection trifecta through the front door. If Ask needs
to act, it queues a proposal.

**3. Untrusted content is data, never instruction — and outbound is a gate.**
Anything fetched from outside — an email body, a web page, a forecast — carries
`provenance` and goes through `quarantine_read` before reaching a model. The
regex in there is triage, not defence; the defence is that the reader has no
tools. Do not "improve" it into a filter people rely on.

The other direction is `core/egress.py`, the only place anything leaves. Not
"nothing leaves the machine" any more, but the narrower claim: *nothing leaves
except requests you allowed, to hosts you named, and the log says exactly what
left.* Every fetch checks the workspace's own allowlist with dot-anchored
suffix matching (`icloud.com` must not match `evil-icloud.com`), refuses any
host resolving to a non-public address, re-checks every redirect hop, caps
size and time, and appends to `logs/egress.log` whether it succeeded or not.
Two callers of `urlopen` are outside it and both are deliberate: the model
server is loopback, which is not egress, and `core/connectors/caldav_cal.py`
predates this file — it talks to one host you configured, with your
credential, over a URL no data chooses. Anything **new** that fetches goes
through the gate, and anything where the URL comes from content rather than
config must. A connector that reaches outward returns **fields, never prose**
— hand a small model a paragraph from a stranger and it paraphrases it; hand
it numbers and it can say something true.

`core/connectors/web.py` is the hard case: with a fetch tool the attacker
chooses *which* page you read, so the content and the destination are both
theirs. It is bounded by three things — the host is on the workspace's
allowlist, the page comes back as fields with provenance `untrusted` and the
quarantine flag already on it, and **nothing reads one on its own**. Ask must
never get a fetch tool: it holds mail and calendar in the same context, so a
model that could also name a URL is the injection trifecta with a way out.
The nightly sweep does not fetch pages either. A person asks, with `peek`.

**4. Trust is per workspace AND per category, and never transfers.**
Ninety clean approvals on cottage enquiries earns cottage enquiries autonomy.
It earns invoice chasing nothing. Some categories are pinned to manual and
must never graduate. Trust goes down as well as up: a rejection revokes
autonomy and the threshold has to be met again from zero, or the ledger only
ever ratchets and a category that has gone wrong keeps acting alone.

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
                       ./blokk update  ./blokk doctor
    setup.sh / run.sh  terminal equivalents; share core/plan.py + core/servers.py
    bench.py           sizes the machine; --serve measures; --compare settles
    connect.py         data sources, workspaces, backups — CLI over core/sources.py
    regress.py         run the frozen examples against whatever is attached
    seed.py            sample world, safe to re-run

    core/schema.sql    the data model. One SQLite file; the thing to back up
    core/durable.py    journal, replay, idempotency, signal suspend/resume
    core/harness.py    agent loop, context budget, policy gate, consolidation
    core/ask.py        read-only chat agent, AG-UI events
    core/models.py     Router + ServedModel (any OpenAI-compatible server)
    core/backends.py   llama.cpp vs MLX rule, with the evidence in comments
    core/nightly.py    the night shift: when to sweep, and what window to read
    core/plan.py       shape -> per-tier plan
    core/servers.py    model server lifecycle + blokk.conf i/o, shared by GUI
                       and CLI. Writes logs/<tier>.log
    core/gguf.py       bounded GGUF header reader; KV cache arithmetic
    core/weights.py    the models/ folder: symlink a .gguf in, take it out
    core/sources.py    add/remove/peek a data source; shared by CLI and GUI
    core/egress.py     the only way out: per-workspace allowlist, no private
                       addresses, redirects re-checked, logs/egress.log
    core/local.py      what this Mac will hand over without a password
    core/backup.py     online snapshot of blokk.db, and verifying one
    core/regression.py twenty frozen examples and the assertions on them
    core/doctor.py     why the phone cannot reach this Mac, and why the
                       agent cannot reach a model
    core/qr.py         QR for the phone URL, no dependency
    core/connectors/   iCloud IMAP + CalDAV, local Mail + Calendar, Messages,
                       weather and web (the two that leave, and only through
                       core/egress.py), keychain, and the fake world.
                       free_windows() is shared: the real calendar and the
                       sample world must not disagree about what "free on
                       Saturday morning" means
    flows/             workflow definitions
    api/server.py      control plane. Stdlib http.server. Holds credentials
    web/               dashboard, setup wizard, sources, phone, update and
                       appearance panels, PWA. Parity with connect.py is
                       deliberate: both call core/sources.py, neither
                       reimplements it. The look is iOS 27 Liquid Glass —
                       chrome is glass, content is not, and Reduce
                       Transparency wins over the in-app slider. index.html,
                       setup.html and demo/index.html share one palette, one
                       type scale and one material; when you change one,
                       change the others or they drift into three products
    demo/              browser port of the engine + the test suites
    brand/             the mark, generated parametrically

## Tests — run all four before committing

    python3 demo/hunt.py       adversarial pass over the server
    node demo/hunt_ui.js       adversarial pass over the front end
    node demo/contract.js      API satisfies what paint() reads
    node demo/journey.js       four end-to-end journeys

Or `./test.sh`. All four must print `0 issues found` / `pass`.

Two things the suites cannot see, so check them by hand when you touch the
banner or the CLI: the QR block only runs when stdout is a **terminal**, and
every harness here redirects — A40 opens a pty for exactly that reason.

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
* The GUI and the CLI must not be two implementations. A new capability goes
  in `core/`, and `connect.py` and `api/server.py` both call it. The one thing
  the GUI deliberately cannot do is take a password.
* Never put prompt or completion text in span attributes or logs. Hash and
  pointer only; guest names must not end up in a second store with different
  retention.
* **44 points.** Every control is at least `var(--tap)` on every surface. It
  may look smaller — a slider track is 6px inside a 44px control, the way iOS
  draws one — but the target is not. `hunt_ui.js` B20 reads it off the
  stylesheet, so a control pinned under it fails the suite.
* **Markup carries values, never rules.** A `style=` attribute cannot be
  overridden, is not reached by a media query and does not exist as far as
  the Reduce Transparency and dark blocks are concerned. A bar width or a
  per-workspace colour is data: pass it as a custom property (`--w`, `--c`)
  and put the rule that uses it in the stylesheet. B21 enforces this.
* The front end is one `<script>` per page, so one stray paren is a blank
  screen that every pattern-matching probe still passes. B19 parses all
  three pages.

## Known-good state

All four suites green. Verified behaviours:

* crash after a side effect, restart -> 4 steps replayed, 227k tokens not
  re-spent, 1 send fired, 0 duplicates
* injected email quarantined and given no draft
* approving 20 clean graduates a category; pinned categories never do
* rejecting takes the autonomy back, not just the counter — it has to be
  earned again from zero. An edit does not: a correction is not a veto
* a dead model server degrades per workspace rather than 500ing the sweep
* a silent model server is detected in 0.4s (output drained on a thread)
* a model server that dies leaves its reason in logs/<tier>.log, and
  `./blokk doctor` prints it along with which of the four faults it is
* the sweep runs itself. A laptop asleep at 04:00 sweeps once when the lid
  next opens, not twice and not never, and reads everything since the last
  sweep rather than a fixed twelve hours
* a source Blokk cannot read says so, rather than returning an empty list
* calendars nested in a .caldav container are found (iCloud puts every one
  of them there); a reader that finds nothing says ok: False, not ok: True
  next to an empty list
* a backup taken mid-write is a consistent snapshot, and never overwrites
* the egress gate turns away a lookalike host, a host on another workspace's
  list, plain http, and loopback even when somebody allowlists it — and each
  is refused by the rule that should refuse it, not by a 404 on the way out
* the weather connector returns days as numbers and a code-table word, with
  no free text from the far end for an instruction to hide in
* a dry day and a free window produce one card, not seven, and the same one
  on a replay. A 09:00 UTC meeting reads as 10:00 in the summer and 09:00 in
  the winter; an all-day event blocks the day; a window that has passed is
  not offered
* a step whose journalled name is not the one being replayed says so, naming
  the run, the step and both names — it used to hand back the previous step's
  result and fail three lines later on a type error
* a web page arrives as text and a title with the quarantine flag on both,
  script and style gone, and the display:none block kept — that is where an
  instruction meant for a model and not for you goes
* every control on every surface — dashboard, five sheets, ask panel and
  wizard — measures at least 44×44 at 375, 768 and 1440, and nothing renders
  past the right edge. Measured in a real browser, not asserted
* the wizard's model table is a table on a Mac and a list of blocks on a
  phone, where six numeric columns rendered as "1.1G12.7G13.8G"

## Not built yet

* `core/sandbox.py` — needed before code mode. gVisor or a microVM; the egress
  allowlist half of it now exists (`core/egress.py`), but kernel isolation
  does not, and isolation with open outbound is worth nothing.
* a real `answer()` on `ServedModel` is wired but unexercised against weights.
  The regression runner exists (`./regress.py`) and is honest that stub prose
  makes its numbers meaningless — they start counting when weights are on.
* connectors are read-only. Sending is a separate connector, deliberately not
  written: it needs a `recipient` on `approval` — the first schema migration —
  and it belongs behind the trust gate like everything else that writes.
* Ask can search Blokk's own state but not the mail and calendar content it
  read. Six tools, none of them full-text.
* CalDAV does not go through `core/egress.py` — it wants PROPFIND and REPORT,
  which `fetch()` does not do. Worth routing when the gate learns methods; the
  host is fixed and configured, so it is a tidiness gap, not an open door.
* `span` has no writer and `skill` is decorative. Both are in the schema
  ahead of the code that will use them.

## If you are picking this up cold

Start it with no model at all — `./setup.sh --stubs && ./run.sh` — and press
"Run the sweep". Every mechanism is real; only the prose is fake. That is the
fastest way to see what the system does before reading how.
