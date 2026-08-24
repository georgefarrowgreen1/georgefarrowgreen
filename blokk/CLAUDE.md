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

Ask can now propose, and this is where the three files split. `core/ask.py`
writes one thing: an undecided row, plus the transcript and the day's meter.
`core/actions.py` holds every executor and is the only place that says what
Blokk may do to itself; it re-validates on the way in *and* on the way out,
because a proposal is JSON a model wrote after reading a stranger's email and
sits in a queue in between. `api/server.py:h_decide` is the only caller of
`actions.run`, on approve only, and records what happened on the row.

Adding an action means adding it to `ACTIONS` and nothing else — the grammar
Ask is given is built from that dict, so the catalogue cannot drift from what
exists. Two things must stay true of anything you add: it reaches nobody
(sending is a connector that does not exist yet, and it will arrive behind this
queue rather than through the chat box); and if being wrong is expensive —
opening a route out, deleting something, putting a file somewhere — it is
`pinned=True` and never graduates, because the cost of being wrong does not
scale with how often you have been right.

`hold_dates` is the one action that writes outside `blokk.db`, and the shape of
it is the template for anything similar. It drops a `.ics` file in a folder;
it does not touch Calendar, and nothing it prints says it did. It refuses over
a night the calendar already has and **names the nights**. Its filename and UID
come from the booking rather than the clock, so a replay overwrites one file
instead of leaving four — a writer keyed on `now()` turns every crash into a
mess somebody cleans up by hand. And it is pinned, because a file appearing in
somebody's folder off the back of a sentence in a guest's email is the shape of
the thing this whole design exists to stop.

Probes A49–A54 and A83 in `demo/hunt.py` hold this shape, and each is
mutation-tested: break the invariant and exactly one of them goes red.

**A proposal says what it was built from.** `evidence.drawn_from` carries the
actual rows — who wrote, when, and enough of their words to check the draft
against — and the card renders them. It used to carry `{"sources": ["mail"]}`,
which names the *kind* of thing it read and never the thing. Anything new that
proposes fills it in: a claim a person cannot check without leaving Blokk is a
claim they will either take on faith or go and verify by hand, and both of
those are the work the queue was supposed to save. Every field in there is a
stranger's text — A85 checks each one reaches the page through `esc()`, by
matching brackets rather than by looking at what sits in front of it.

Ask fills it in too, and on that surface it carries one thing more.
`evidence.read_flagged` says a message that reads like an instruction was in
the context window when the proposal was made. Nothing is allowed to act on
one either way — the validated arguments and the queue are what stop it — but
the person tapping Approve is the last check, and they cannot be the check on
a turn they cannot see. The flagged row is quoted on the card, never hidden:
the one message worth looking at yourself must not be the one that is not
there. A86 stages that turn and fails if the citation, the flag or the warning
goes missing.

**Memory is only real if it reaches a prompt.** Corrections become episodes,
episodes consolidate into facts, and `core/harness.py:learned_block` is what
puts those facts in front of a model. For a long time nothing did — the chat
could *read* the fact table through a tool and neither prompt contained it, so
"it learns from your corrections" ended in a table nothing read. Any new
surface that drafts or answers on the person's behalf gets that block, and a
fact below `MIN_CONFIDENCE` is one edit's worth of evidence: worth keeping,
worth showing them, not worth steering a draft with.

**3. Untrusted content is data, never instruction — and outbound is a gate.**
Anything fetched from outside — an email body, a web page, a forecast — carries
`provenance` and goes through `quarantine_read` before reaching a model. The
regex in there is triage, not defence; the defence is that the reader has no
tools. Do not "improve" it into a filter people rely on.

This surface got wider when Ask learned to read your data. It has tools over
the wired connectors now — mail, calendar, messages, the page, the forecast —
so a stranger's email reaches the model on any question about the inbox, in a
chat box that can also propose actions. That is the trifecta with the volume
turned up, and it holds for the same reason it did before: the rows arrive
inside a labelled envelope that says `untrusted`, the propose path validates
every argument against `ACTIONS` rather than trusting what the model wrote,
and nothing runs without a person tapping approve. A62 stages exactly that
attack through the mail tool and fails if a proposal comes out of it.

Two smaller rules that fall out of this. A read tool declares where its rows
come from — `blokk` for its own tables, `yours` for files on this Mac,
`outside` for anything through the egress gate — because the panel prints a
provenance line under every answer and it said "nothing outside this database
was touched" for a while after that stopped being true. And a tool is only
offered for a source that is wired: the grammar is built from that dict, so
not offering it is the same as it not existing.

The other direction is `core/egress.py`, the only place anything leaves. Not
"nothing leaves the machine" any more, but the narrower claim: *nothing leaves
except requests you allowed, to hosts you named, and the log says exactly what
left.* Every fetch checks the workspace's own allowlist with dot-anchored
suffix matching (`icloud.com` must not match `evil-icloud.com`), refuses any
host resolving to a non-public address, re-checks every redirect hop, caps
size and time, and appends to `logs/egress.log` whether it succeeded or not.
One caller of `urlopen` is outside it and it is deliberate: the model server
is loopback, which is not egress. CalDAV was the other, for the honest reason
that the gate made GET and POST and CalDAV is PROPFIND and REPORT; the gate
makes those now (`egress.METHODS`, a fixed list — PUT and DELETE would make
it a way to change somebody's calendar) and that connector goes through it
like everything else. Anything **new** that fetches goes
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
                       ics_out (the only writer: a .ics file per approved
                       hold, keyed on the booking so a replay overwrites),
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
                       reimplements it. The look is iOS 26 Liquid Glass —
                       chrome is glass, content is not, and Reduce
                       Transparency wins over the in-app slider. index.html,
                       setup.html and demo/index.html share one palette, one
                       type scale and one material; when you change one,
                       change the others or they drift into three products
    demo/              browser port of the engine + the test suites
    brand/             the mark, generated parametrically. chatmark.py emits
                       the ask bubble's glyph from the same geometry — the
                       block's top face, RATIO 0.568, which is 92/162 off
                       blokk-mark.svg. Do not hand-edit the polygons in
                       the markup; regenerate. B27d checks

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
`journey.js`**, or the two drift and the demo starts lying. `INSTRUCTIONISH`
was the one most easily missed — one line in each file, in two languages,
never read side by side. B33 compares them as sets of alternatives now, so a
phrase added to one and not the other fails the suite.

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
* **Corners follow iOS 26's two rules.** *Concentric*: a rounded thing inside
  a rounded thing shares its centre, so the inner radius is the outer one
  minus the gap — `calc(var(--r-sheet) - 22px + 12px)` for a box inset by
  22px and padded by 12. *Capsules*: anything sized to its content is
  `--r-pill`, which is concentric with any container at any padding. Do not
  compute a radius by hand; `calc(20px - 16px + 8px)` was here and it was a
  fudge, not a rule. All three pages define `--r-card` and `--r-pill`, and
  B25 fails if one of them stops.
* **A bar's controls are one piece of glass.** iOS 26 groups the items of a
  toolbar into a single glass container and lets each item light up inside
  it. Four separate lozenges, each with its own material and edge, read as
  four surfaces at four depths. B24 checks the group carries the material
  and the items do not.
* Settings-shaped content is an **inset grouped list**: rows inside one
  rounded container, separators inset to the text rather than the full
  width, container inset from the edges. Bare rows on the background is the
  plain list style, which iOS keeps for content you scroll.
* **Light and dark are three states, not two.** An explicit choice stamps
  `data-theme` on `<html>`; "system" stamps nothing and only
  `prefers-color-scheme` separates it — and that un-stamped state is the one
  most people are in. So the complete palette lives on bare `:root` (dark,
  because that is what this app is), and the two guarded blocks
  (`@media (prefers-color-scheme:light) :root:not([data-theme="dark"])` and
  `:root[data-theme="light"]`) **redefine tokens and nothing else**. A colour
  whose only definition sits inside one of those blocks does not exist in the
  third state. B28/B28a/B28b/B28c enforce all of it, including that the glass
  reads `--glass-tint` rather than a pinned one — the token can be right while
  a second copy of the rule three lines up is not, which is how the bubble
  stayed charcoal on a white page.
* **Accents are per theme and measured.** `#FFD60A` on white is 1.2:1 and
  this app writes sentences in amber; `#30D158` is 1.8:1. Each light accent
  is the hue at a lightness that clears 4.5:1 on its own ground. White on
  `#0A84FF` is 3.65:1, so anything with white text on blue uses
  `--blue-fill`. `--lab3` was iOS's own 30% and measured 2.25:1 in *both*
  themes — section headers and run counts are set in it — and is now 4.6:1.
* **Spacing is a 4-point grid** — `--sp-1`(4) through `--sp-6`(32), the same
  in all three pages. Every margin, padding and gap is a multiple of 4;
  under 4px is optical (a hairline, a nudge) and left alone. The scale used
  to exist with three users while twenty-two hard-coded values did the real
  work, which is how a card came to inset its content 17px at the top and
  11px at the side. B26 fails on anything off the grid.
* **A control declares its own minimum height.** Never let it add up to 44
  from padding: snapping the spacing to the grid took four buttons from 48
  to 42 without a rule about size changing, and B20 cannot see that — there
  is no height in the rule to read. B20a fails on a control that sets
  vertical padding and no height.

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
* a hold refuses over a night the diary already has and names the nights;
  a booking that leaves on the 6th and one that arrives on the 6th do not
  clash; the same hold approved twice is one file; and what it writes reads
  back through Blokk's own parser with the comma in the guest's name intact
* a chat proposal carries the rows the turn read before it proposed, says so
  when one of them read like an instruction, and quotes that one rather than
  hiding it — and all of it survives a reload
* every proposal carries the rows it was built from — the enquiry behind a
  drafted reply, the forecast and the gap behind an outing, the comparison
  behind a rate — and the card shows them under the proposal. A draft that
  says "your email about the dog" and cannot point at the email is
  unfalsifiable; the only way to check it was to go and open Mail
* a search reaches two years back rather than the sixty rows the panel is
  holding, says what it searched when it finds nothing ("300 rows in the last
  730 days") rather than just "nothing", narrows on request, and still flags
  an instruction it finds down there
* every connector that leaves goes through the gate. CalDAV was the one
  exception and is not any more: the gate makes PROPFIND and REPORT, refuses
  anything that writes, and wiring a caldav source opens exactly one host and
  closes it again on remove
* the diary can be asked about the past. events() started at today, so
  "when did the Shaws last stay" answered nothing found — which reads as
  never, not as never looked. A search covers both directions; the panel
  still shows only what is coming
* "the Shaws" no longer matches every row containing "the", "art" no longer
  matches "Start of season", a query of nothing but common words is refused
  rather than answered with everything, and a name in the subject outranks
  the same name buried in a long body
* the mail window is the message's own Date header, not the file's mtime. A
  Time Machine restore or a migration sets every mtime to now; on mtime that
  made "since last night" match the whole archive, so the sweep re-triaged
  years of mail and paid for it
* a web page arrives as text and a title with the quarantine flag on both,
  script and style gone, and the display:none block kept — that is where an
  instruction meant for a model and not for you goes
* every control on every surface — dashboard, five sheets, ask panel and
  wizard — measures at least 44×44 at 375, 768 and 1440, and nothing renders
  past the right edge. Measured in a real browser, not asserted
* the wizard's model table is a table on a Mac and a list of blocks on a
  phone, where six numeric columns rendered as "1.1G12.7G13.8G"
* the toolbar is one glass capsule holding four items, the sheet corners are
  the display's, and every control sized to its content is a capsule —
  which is what iOS 26 looks like
* light and dark both measure zero text below 4.5:1 across the dashboard,
  the wizard and the demo, checked on rendered pixels with the ground
  composited — not on the token values
* an explicit choice beats the OS in both directions, and system follows the
  OS while the app is open; theme-color follows the ground so the browser's
  own chrome does too
* every container insets its content by the same amount on all four sides:
  the cards 16, the run cards 12, the toolbar 3, and the cards sit 12 apart.
  Measured in a browser, not asserted

## Not built yet

* `core/sandbox.py` — needed before code mode. gVisor or a microVM; the egress
  allowlist half of it now exists (`core/egress.py`), but kernel isolation
  does not, and isolation with open outbound is worth nothing.
* a real `answer()` on `ServedModel` is wired but unexercised against weights.
  The regression runner exists (`./regress.py`) and is honest that stub prose
  makes its numbers meaningless — they start counting when weights are on.
* sending is a separate connector, deliberately not written: it needs a
  `recipient` on `approval` and it belongs behind the trust gate like
  everything else that writes. `ics_out` is the only connector with
  `writes = True`, and it writes a file to a folder on this Mac — nothing
  addressed, nothing off the machine, nobody told.
* writing *into* Calendar.app needs EventKit, a signed bundle and a consent
  dialog — a different kind of program from this one. The .ics drop is the
  halfway house, and it is labelled as one everywhere it appears.
* Ask's search ranks on whole words with the stopwords dropped, weights the
  subject and the sender above the body, and labels each hit strong, partial
  or weak. What it is not is an index: every search reads the rows and scores
  them, bounded by `FIND_SCAN`, so it stays honest on one Mac's archive and
  would not stay honest on ten. If that day comes the answer is SQLite's own
  FTS5, not a bigger loop.
* `span` has no writer and `skill` is decorative. Both are in the schema
  ahead of the code that will use them.

## If you are picking this up cold

Start it with no model at all — `./setup.sh --stubs && ./run.sh` — and press
"Run the sweep". Every mechanism is real; only the prose is fake. That is the
fastest way to see what the system does before reading how.
