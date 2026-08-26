# CLAUDE.md

Context for Claude Code working in this repo. Read this before changing
anything.

## What Blokk is

**A secretary, for one person, on their own Mac.** Not an assistant for a
business — the job it does is the job a good secretary does: read the post
overnight, tell you the few things that need you, draft the replies you
would otherwise write yourself, keep the diary, file what needs filing, and
bring things back when you asked to be reminded. Your content never leaves
the machine; the few requests that do go out are named on one allowlist and
logged — see invariant 3.

That is the frame to check a change against, and most of the wrong turns in
this repo's history were a drift away from it. It is not a mail client, not
a CRM, not a chatbot with your data attached. If a feature would not be
recognisable as something a secretary does, it probably belongs somewhere
else.

It has been two other things and both are worth knowing, because the marks
are still on the code.

It was **"for several small businesses"**, with a workspace table and a
`workspace_id` on almost everything. Four queues to check, four sweeps to
wait for, four sets of sources to wire and a picker in the chat that had to
be right before an answer could be — for a product that runs on one
person's Mac. What the businesses actually needed keeping out of was each
other's mail, and that is `credential.only`, per mailbox, which was doing
the job underneath the tenancy model all along. `core/unify.py` collapses a
database that still has workspaces in it; `./blokk unify` runs it.

Then it was **a holiday let**, which was never a decision anybody made — it
was the sample world hardening into the product. The triage kinds were
`access` / `availability` / `other` in a prompt constant, the drafting
prompt was handed free nights and a rate card, `hold_dates` refused over
any day the calendar already had something on, and the frozen suite
measured whether a draft mentioned the dog charge. Every one of those is a
correct implementation of the wrong product.

What the rebase changed, and what to watch for if you find more of it:

  * the in-tray kinds are rows (`core/intray.py`), and both the triage
    prompt and its grammar are built from them
  * a *bed* is exclusive and a *Tuesday* is not — `put_in_diary` refuses a
    time overlap and writes a shared day, which is the sharpest single
    difference between the two products
  * entries carry times. Bookings are counted in nights, so `validate()`
    read anything with a clock on it as "not a date" and `ics_out` wrote
    every entry as an all-day event
  * `free_time` asks the diary for hours before whole days. Asking for whole
    free days first is how "have I got an hour on Thursday" got answered
    with "no, you are out on Thursday"
  * `remind_me` exists at all. It is the most-used thing a secretary does
    and there was no way to say it

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
unless it is shaped like `send_reply` below — behind this queue, pinned, and
taking an id rather than an address; and if being wrong is expensive —
opening a route out, deleting something, putting a file somewhere — it is
`pinned=True` and never graduates, because the cost of being wrong does not
scale with how often you have been right.

`put_in_diary` is the one action that writes outside `blokk.db`, and the shape of
it is the template for anything similar. It drops a `.ics` file in a folder
and adds it to Calendar where macOS allows it, and nothing it prints claims
either until it has happened. It refuses an actual **time overlap** and
**names what it ran into**; it writes a shared day without argument and says
what else is on. Its filename and UID come from the entry rather than the
clock, so a replay overwrites one file instead of leaving four — a writer
keyed on `now()` turns every crash into a mess somebody cleans up by hand.
And it is pinned, because a file appearing in somebody's folder off the back
of a sentence in a stranger's email is the shape of the thing this whole
design exists to stop.

The overlap rule is where the holiday let showed through hardest and it is
worth stating as a rule, because the same mistake is available anywhere else
in here: **a bed is exclusive and a Tuesday is not.** Refusing to put the
dentist in because Mum is staying that week is a correct implementation of
the wrong product. Two things with times on them that run over each other
are a conflict; two whole-day entries on one day are a Tuesday.

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

**Sending is the one that reaches another person, and it is shaped by that.**
`send_reply` takes an *approval id* and nothing else — not a recipient, not a
body, not a subject. Everything about where it goes and what it says was fixed
when the draft was made and read by a person; this action only says "that one,
now". An action that took its own `to` and `text` would let a model write the
words, choose the reader and ask for it in one step, which is the entire thing
the queue exists to prevent.

`approval.recipient` is taken from the From header of the message being
answered and from nowhere else — never from a body, because a "please reply
to" line inside somebody's mail is text a stranger wrote. A draft with no
recorded recipient cannot be sent at all, which is what makes that a rule
rather than a preference; `smtp_mail.Smtp.send` re-checks the address it is
handed against the one on the row and refuses if they differ.

A draft is sent once. `approval.sent_at` is set the moment it goes and every
guard refuses a second attempt — nothing marked it before, so the same draft
could go twice and the person who finds out is the one who received it. A
draft carrying `revalidate` is re-checked at send: a quote true at 04:00 may
be sold by the evening, and the queue already knew how to say so.

One recipient, plain text, no attachments, no HTML, a size cap, and twenty a
day, counted off `sent_at` in the same timezone it is written in. Each refusal is by the rule that should refuse it — a
header injection is caught as a line break, not as "too many addresses",
because a refusal wearing the wrong name is one nobody can act on, and one
that vanishes the day the other rule is loosened. A93 covers all of it and is
mutation-tested seven ways.

**A message is read with what came before it.** "Washing ?" is a reply, and
on its own it is unanswerable — so the sweep answered it by asking the sender
what they meant, which is the question a person would not have had to ask.
`connectors.conversation_before` normalises three readers' different ideas of
a thread into one shape: oldest first, both sides, the message itself
excluded. Your own earlier words matter most, because they are what a
one-word reply is replying to.

Every line of it is quarantined separately and an instruction found in the
history flags the message it is context for. Widening the window widens the
surface: three messages ago reaches the model exactly as easily as this one,
and a flag lost among the context is worse than no context.

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

**Unwired is not the same as unavailable.** The prompt carries a `NOT WIRED
YET` block — every source in `NEEDS` that is not connected,
each with the one line that connects it — and a rule saying not to answer
"I don't have access to that" about something one approval away. Without it
the prompt listed what exists and said nothing about what could, so a Mac
with weights answered a question about the weather with *"I'm sorry, but I
don't have access to weather information"*: true of the model, false of
Blokk. The right sentence had existed for a long time and lived only in the
no-weights planner, which is the path almost nobody is on. A95 covers both.

Two smaller rules that fall out of this. A read tool declares where its rows
come from — `blokk` for its own tables, `yours` for files on this Mac,
`outside` for anything through the egress gate — because the panel prints a
provenance line under every answer and it said "nothing outside this database
was touched" for a while after that stopped being true. And a tool is only
offered for a source that is wired: the grammar is built from that dict, so
not offering it is the same as it not existing.

**Nothing is touched without a permission row.** `core/permission.py` is
one ledger for every door: the apps on this Mac (realm `app` — Mail read,
Calendar read and write, Messages read) and the hosts on the internet
(realm `net`). Three states, and only `allow` opens anything: `block` is a
person's no, kept and quoted back by name; `ask` — the default, and the
state of every door nobody has decided — refuses exactly as hard, and
records the attempt *on the row* (a knock: count, time, who wanted in), so
the permissions panel and the morning brief can put the question in front
of the person instead of a log nobody reads. The gates that consult it:
`wire()` refuses to register a source that reads an undecided or blocked
app — and the sample world never stands in for what was refused, because
invented mail wearing a refused mailbox's role is the worst substitution
available here; `put_in_diary` treats Calendar *write* as its own door
that no reader's wiring opens, and falls back to the `.ics` file with the
permission named; `egress.fetch` reads the net half. Grants are made by a
person and nowhere else — the panel and `connect.py apps` write the table
directly because a finger on a named toggle is the approval; wiring a
source grants exactly the read it names (and closes it again when the
last source of that app goes, the same anti-ratchet rule the weather
hosts follow); the model's only route is the pinned `app_allow` /
`app_block` actions through the queue. Changeable at any time, both
directions, effective on the next attempt — the gates read per call and
cache nothing. A128–A130 hold this, mutation-tested ten ways.

The other direction is `core/egress.py`, the only place anything leaves. Not
"nothing leaves the machine" any more, but the narrower claim: *nothing leaves
except requests you allowed, to hosts you named, and the log says exactly what
left.* The allowlist's rows live in the permission ledger (realm `net`) —
it used to be a JSON list under a `setting` key, and `permission._adopt`
carries an old database's list across, renaming the old key so nothing
stale can be read. Every fetch checks the one allowlist with dot-anchored
suffix matching (`icloud.com` must not match `evil-icloud.com`), refuses any
host resolving to a non-public address, re-checks every redirect hop, caps
size and time, and appends to `logs/egress.log` whether it succeeded or not.
The port counts too. `https` means 443 and needs no permission; any other
port has to be on the list as `host:port`, matched exactly — a subdomain
inherits its parent's entry, a port must inherit nothing, or permission for
one service becomes permission for every service on the machine. This was
missing, and the way it surfaced is the point: port 22 on an allowed host
*was* turned away, by a TLS handshake failure. Refused by luck is not
refused.
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

That has to survive the whole way, and `core/sources.py:peek` is where it
did not: its normalisation had a fixed shape of text keys, so a forecast's
rain chance existed only inside the sentence in `subject`. The first fix was
a tuple of five field names, which is the same bug with a plaster on it — a
connector adding a sixth measurement had to be edited into two files, and
until it was, its numbers silently became prose again. The rule now, in one
place: **a number cannot carry an instruction, so it crosses on its own; a
string is where an instruction lives, so it crosses only where the connector
declares it in `CARRY`.** A connector is the only thing that knows its own
strings came from a table in this repo rather than off the wire — `label` is
a word out of `CODES`, not text the far end chose. What that cannot check is
whether a connector is *wrong* about that; the default is empty, so
forgetting costs you a field rather than admitting a sentence.

What reaches the model has to be *whole*, too. The envelope was built as
`json.dumps({...})[:12000]` — a slice of the serialised object, so a long
observation arrived as JSON cut mid-string with no closing brace. Nothing
raised; the model read what it could and the answer was quietly built on a
fragment. The row cap above it hid how often that happened, because twelve
short rows never come near the limit: it only ever fired on the turns
carrying the most. `_observation()` drops whole rows until it fits and puts
`rows_not_shown` in the envelope, because a model reading eight of fourteen
should be told so. A121 parses the result and fails if it does not.

`core/connectors/web.py` is the hard case: with a fetch tool the attacker
chooses *which* page you read, so the content and the destination are both
theirs. It is bounded by three things — the host is on the allowlist,
the page comes back as fields with provenance `untrusted` and the
quarantine flag already on it, and **nothing reads one on its own**. Ask must
never get a fetch tool: it holds mail and calendar in the same context, so a
model that could also name a URL is the injection trifecta with a way out.
The nightly sweep does not fetch pages either. A person asks, with `peek`.

**4. Trust is per category, and never transfers.**
Ninety clean approvals on availability enquiries earns availability enquiries
autonomy. It earns invoice chasing nothing. Some categories are pinned to
manual and must never graduate. Trust goes down as well as up: a rejection
revokes autonomy and the threshold has to be met again from zero, or the
ledger only ever ratchets and a category that has gone wrong keeps acting
alone.

The key used to be (workspace, category). Collapsing it is the one merge in
`core/unify.py` that can hand out autonomy nobody earned, so it takes the
*most conservative* of the rows that land on one category — the minimum clean
count, the maximum edited and rejected, `auto` only where every row had it,
and pinned if any row was. Nineteen clean approvals on one business's
enquiries is not nineteen on a category that now covers both.

**5. Scope is data, not prompt.**
What an agent may read is the tools in `build_tools()` and the sources in the
connector registry, both built from tables in SQL. Nothing a model says adds
a table, a column, a row or a connector to either. This used to be about
workspace isolation and read the same way for the same reason: an agent told
not to look at something will eventually look at it, so the boundary has to
be somewhere it cannot reach. What bounds a read now is `credential.only` —
which mailboxes, which calendars — and what bounds a write is the approval
queue.

**A call says what it is for, and that sets the sampling.**
`core/models.SAMPLING` has two entries and every call names one. `DECIDING`
— routing, triage, deriving a rule, choosing between answering and proposing
an action somebody has to approve — runs greedy, so the same rows and the
same question give the same answer twice. `WRITING` is prose a person will
read and send, and it is warm, because greedy drafting is repetitive in a
way people notice across a week of replies. Exactly one call site asks for
it: the sweep's drafting call.

None of this was sent at all until recently. Every request carried model,
messages and max_tokens, so routing and triage and the propose-or-answer
choice all ran at whatever the server defaulted to — 0.8 with top-p 0.95 on
llama.cpp. Guided decoding made the JSON well-formed and nothing made the
*choice inside it* stable, which is the half that matters: at 0.8 the same
question can route to a different table on consecutive asks. No suite could
see it, because the stub is deterministic. `seed` is deliberately not sent —
this layer talks to six servers on purpose, an unknown key is a 400 on some
of them, and at temperature 0 the sampler is greedy anyway. A120 covers it,
including that an unknown job falls back to deciding rather than inventing.

**Every figure in a queued row is checked against the evidence under it.**
`core/grounding.py` pulls the numbers out of the body, pulls the numbers out
of the evidence, and names what is in the first and not the second. It flags
and never blocks: a total is arithmetic, two nights at £120 is £240, and 240
is in neither. Values not strings, so £1,200.00 and 1200 are one figure; and
numbers under 32 are ignored, because "2 of us" and "3pm" are how English
writes and flagging them buries the £140. It runs on the funnel — `_queue`
and the chat's one INSERT — not on the drafting call, because a figure
invented into any queued row is the same defect. Both cards show it, the
live one off the event and the reloaded one off the row.

This is what the rate card is doing in `evidence`. It used to be in the
prompt and nowhere else, so the card could not answer the only question
worth asking of a quote — where did that number come from? — and the check
had nothing to compare a price against. What it catches is invention, not
misuse: £120 quoted for the wrong week passes clean, and the sentence on the
card says as much.

**Remote access is recognised, never published.** A private mesh
(Tailscale) gives this Mac an address in 100.64/10 that works from
anywhere; Blokk *recognises* that address — the doctor and the phone panel
print it beside the LAN link, ranked second — and does nothing else: it
never starts, installs or configures a tunnel, and no public-tunnel
service (ngrok, Cloudflare Tunnel and kin) gets a place in the runtime. The
line is the product's own: a mesh is your devices reaching your Mac over an
encrypted network that contains only them, with the token still required
off loopback; a public URL is your mail and your approval queue on the
internet behind a query string, served by a stdlib HTTP server that was
never hardened for it. The mesh address also happens to be the way around
every cause on the phone-reach list at once — the router never carries it,
and iOS's Local Network permission does not apply because it is not the
local network — which is why the causes list names it as the way out. The
classifier judges that one range by address before interface: on macOS
Tailscale lives on a utun, and interface-first filed the working mesh
address under "a VPN tunnel the phone is not on". A126 holds all of it,
mutation-tested five ways.

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
    connect.py         data sources, egress, backups — CLI over core/sources.py
    regress.py         run the frozen examples against whatever is attached,
                       three times each. Once was a draw and not a
                       measurement: a prompt right four times in five
                       recorded green most mornings and the fifth read as a
                       flake to re-run. Green means every run passed
    seed.py            sample world, safe to re-run

    core/schema.sql    the data model. One SQLite file; the thing to back up
    core/durable.py    journal, replay, idempotency, signal suspend/resume
    core/harness.py    agent loop, context budget, policy gate, consolidation
    core/ask.py        read-only chat agent, AG-UI events. One function
                       turns gathered rows into a sentence, and one decides
                       there are none — three call sites used to do both
                       themselves, and drifted: when the forecast learned to
                       answer the day it was asked about, the question
                       reached one of the three. A119 counts the callers
                       with ast, so a second path fails the suite rather
                       than answering the same question differently
                       A step that comes back in the wrong shape is
                       retried once, shown what it produced — a fence round
                       the object is the commonest way a small model misses
                       a grammar and the one most likely to come right when
                       told. Once, never twice: the deterministic planner
                       underneath is a real answer, and a loop here burns
                       the day's budget on a model having a bad afternoon
    core/grounding.py  every figure in a draft against every figure in the
                       evidence it cites. Flags, never blocks. money() is
                       separate from figures(): the filing card totalled
                       every number it could find and reported "£46
                       mentioned" off a subject line reading "46 days
                       overdue"
    core/intray.py     the kinds the post gets sorted into, and what each
                       one does with a message — draft, card, file, count.
                       Rows, not a prompt constant: the triage kind, the
                       approval's category and the trust ledger's key are
                       one name, where they used to be three vocabularies
                       kept in step by remembering. The prompt and the
                       grammar are both built from the table, so a category
                       that exists is one the model has been told about
    core/models.py     Router + ServedModel (any OpenAI-compatible server).
                       SAMPLING says what a call is for; nothing sent a
                       temperature at all until recently
    core/backends.py   llama.cpp vs MLX rule, with the evidence in comments
    core/nightly.py    the night shift: when to sweep, and what window to read
    core/plan.py       shape -> per-tier plan
    core/servers.py    model server lifecycle + blokk.conf i/o, shared by GUI
                       and CLI. Writes logs/<tier>.log
    core/gguf.py       bounded GGUF header reader; KV cache arithmetic
    core/weights.py    the models/ folder: symlink a .gguf in, take it out
    core/sources.py    add/remove/peek a data source; shared by CLI and GUI
    core/permission.py one ledger for every door: apps on this Mac and
                       hosts off it, allow/block/ask, knocks recorded
    core/egress.py     the only way out: one allowlist (the ledger's net
                       half), no private addresses, redirects re-checked,
                       logs/egress.log
    core/local.py      what this Mac will hand over without a password
    core/backup.py     online snapshot of blokk.db, and verifying one
    core/regression.py twenty frozen examples and the assertions on them
    core/autoupdate.py updating on its own without going quiet about it:
                       off until switched on, once a day at most, a schema
                       change always left for a person, backed up first,
                       never over your edits, and every check and apply in
                       logs/update.log with the commit to go back to
    core/doctor.py     why the phone cannot reach this Mac, and why the
                       agent cannot reach a model
    core/preflight.py  the checks the run does on itself, and the one list
                       of why a phone cannot reach this Mac — rendered by
                       the doctor, the listener and the start-up banner.
                       Four surfaces each kept their own copy of the same
                       three causes and had already drifted: two of them
                       tested "python is NOT listed" and nothing else, so a
                       Mac where somebody had clicked Deny printed the link
                       in green with nothing to say it would be dropped.
                       Fast and local
                       only — nothing here touches the network or waits on
                       a subprocess, because it sits in front of somebody
                       waiting for their app. Silent when clean; worst
                       first; every finding carries its fix. Returns
                       findings and prints nothing, so the banner and the
                       doctor use one list and cannot disagree
    core/listen.py     `./blokk listen` — bind a port, print the link, and
                       report every connection that arrives and what it
                       said. Splits "the phone cannot reach the Mac" into
                       its two halves by observing which one it is, rather
                       than inferring it from the far side of a screenshot
    core/qr.py         QR for the phone URL, no dependency
    core/sandbox.py    where a script Blokk did not write is run: no network,
                       no home directory, a fresh environment, rlimits and a
                       timeout that kills the process *group*. Refuses rather
                       than running unconfined — and every path in its
                       wrapper is shell-quoted with a failed mount fatal,
                       because an unquoted scratch path with a space in it
                       made the binds fail, the exec run anyway, and run()
                       return ok on a script that had just read the real
                       /home
    core/skills.py     procedural memory over that boundary. A skill earns
                       `promoted` by running clean and is retired by failing,
                       the trust ledger's shape for the trust ledger's reason
    core/connectors/   iCloud IMAP + CalDAV, local Mail + Calendar, Messages,
                       ics_out (a .ics file per approved hold, keyed on the
                       booking so a replay overwrites) and calendar_app
                       (the same hold, put in Calendar.app through
                       osascript — AppleScript has no placeholders, so
                       _lit() is the whole injection surface),
                       weather and web (the two that leave, and only through
                       core/egress.py), keychain, and the fake world.
                       free_windows() is shared: the real calendar and the
                       sample world must not disagree about what "free on
                       Saturday morning" means
    flows/             workflow definitions
    api/server.py      control plane. Stdlib http.server. Holds credentials
    web/               dashboard, setup wizard, sources, phone, update and
                       appearance panels, PWA. The update panel carries
                       the automatic-update switch — the same three
                       words the CLI and the API take, built from the
                       same list, so a fourth position cannot appear in
                       one and not the others, and opening it reads
                       state rather than reaching GitHub.
                       Parity with connect.py is
                       deliberate: both call core/sources.py, neither
                       reimplements it. The look is **the board**: a
                       near-black (or light) room, and every tray item a
                       slab of its kind's colour — the intray table's
                       categories, worn as saturated tiles with white ink.
                       The hero tile carries the day's count at poster
                       size. The tile hues (--tile-*) are one set in both
                       themes, each deep enough that white clears 4.5:1
                       on its lightest gradient stop — the tiles are the
                       brand, the room flips around them. Long text never
                       sits on saturated colour: the why line, the
                       evidence and the figure warnings recess into a
                       dark well inside the tile. The primary verb is
                       solid white and takes the tile's hue as its ink,
                       which is what binds it to its tile. Chrome — bars,
                       sheets, the chat — stays Liquid Glass, and Reduce
                       Transparency wins over the in-app slider.
                       index.html, setup.html and demo/index.html share
                       one palette, one type scale and one material; when
                       you change one, change the others or they drift
                       into three products
    demo/              browser port of the engine + the test suites.
                       fakeserver.py is a real OpenAI-compatible server that
                       also misbehaves the ways real ones do — deliberately
                       not a mock, because a mock agrees with whatever you
                       believed when you wrote it
    brand/             the mark, generated parametrically. chatmark.py emits
                       the ask bubble's glyph from the same geometry — the
                       block's top face, RATIO 0.568, which is 92/162 off
                       blokk-mark.svg. Do not hand-edit the polygons in
                       the markup; regenerate. B27d checks

## Tests — run all six before committing

    python3 demo/hunt.py       adversarial pass over the server
    node demo/hunt_ui.js       adversarial pass over the front end
    node demo/contract.js      API satisfies what paint() reads
    node demo/journey.js       four end-to-end journeys
    node demo/measure.js       the same pages, measured in a real browser
    python3 demo/gate.py       every probe is made to fail on purpose

Or `./test.sh`. All of them must print `0 issues found` / `pass`.

The sixth asks the question the other five cannot: *does the suite work?* A
probe whose check can only pass is a green line indistinguishable from a
green line that means something, and nine of those got written here in one
week — a check for `"never reached"` against a sentence saying "ever
reached", a `"127."` matched by the docstring explaining the guard it
tested, a default read from a database the suite had already written to.
Every one was caught by hand, by remembering to try, and remembering is not
a mechanism.

`demo/mutations.py` holds one break per probe: a file, an exact string, and
what it becomes. `demo/gate.py` applies each, runs that one probe — hence
the filter argument on `hunt.py`, which turns 40s into 2s — and fails if the
probe stays green. It fails just as loudly when **the edit matched nothing**,
because a `find` string that is not there applies cleanly to nothing and
leaves the probe green, which reads exactly like a probe doing its job.
Twice in one afternoon a mutation named a CSS class this markup does not
have, and the pass that followed meant nothing.

The third failure mode — **the probe was red before the break** — was in
this paragraph for days before it was in the code, and the gap was not
hypothetical: A108 could not run under the single-probe filter at all (the
doctor parsed the probe's own argv and choked on "A108"), so it was red
before every mutation and both of its entries were vacuously green. The
gate runs each probe unbroken once, cached, before its mutations; the day
it learned to look it also exposed a stale entry whose words no probe
asserts any more, and — the recurring lesson wearing a new coat — a
mutation that was itself a no-op six days out of seven, because its break
only changed the answer when today was the weekday being resolved.

Coverage is printed, never assumed: 34 of 131 probes have an entry and the
gate says so on every run. A gate quietly covering a tenth of the suite is
the failure it exists to prevent. Adding a probe is half the job; adding the
mutation that proves it can fail is the other half.

The probes guarding the six invariants went first, because a green line that
cannot fail is most expensive exactly there: the write path (A49–A54),
untrusted content staying data (A44, A48, A52) and the one gate out (A43,
A43b). Each is broken the way the invariant would actually be lost — the
chat surface given an `UPDATE approval`, a proposal written into the queue
already decided, `reject` added to the list of decisions that run,
`validate()` skipped so a queued row is trusted, `egress_allow` unpinned so
opening a route out could graduate, the page-title injection flag dropped,
and `_NoRedirect` handing control back to urllib.

It has gone on earning its place. A125 — the probe that the holiday let
cannot grow back — went in with three checks that could not fail, and all
three were caught here rather than by me: it read `does()` through the
coercion that makes an unrecognised kind safe, so nothing it looked at could
be wrong; it asked `validate()` whether two entries clash, which is a
question `validate()` has no opinion about; and it searched a block of code
for the word "open_windows" while the comment directly above that code
explained the ordering using the same word.

It has already earned its place. A109 checked that `logs/https-on-http.json`
*existed* — which passed on a file left behind by an earlier run — and
fixing it to read the count, send the hello and watch for an increase
surfaced a real bug underneath: `_peers` and `_https` started at 0 in
memory, so the file reset to 1 after every restart and the arrivals count
could never exceed one run's worth. `_resume()` in `api/server.py` reads the
file back under the lock on first use.

`measure.js` is the fifth and the only one that needs a browser. Everything
this file claimed was "measured in a real browser, not asserted" — 44pt on
every surface, nothing past the right edge, zero text under 4.5:1 on
composited pixels in both themes — was measured once, by hand, and nothing
re-ran it. Those claims were true of a moment rather than of the code.

Playwright is a dev dependency and the stdlib-only rule is about the
*runtime*, which none of this is part of. So it is guarded: with no
Playwright, `measure.js` prints `skipped`, says how to install it, and
exits 0 — never `ok`, because a check that could not run must not look
like one that passed.

    npm i -D playwright && npx playwright install chromium

Two things it catches that reading the source cannot. A dialog is an empty
box until the row that fills it is clicked, so the sheets have to be opened
the way a person opens them — the first version called `showModal()` and
measured three sheets holding nothing but a Close button, reporting "1
control, all at least 44x44" while a control pinned to 30px inside them
passed clean. And contrast has to be composited: the token values can all
be right while a layer between them makes the result 2.25:1, which is
exactly what `--lab3` did.

`./test.sh` deletes `blokk.db` and re-seeds — the hunts mutate deliberately
and a half-swept database makes probes report defects that are not there. It
copies it to `backups/` first if it holds anything a person would miss, and
prints how to put it back. **Restoring is not `cp`**: the `-wal` beside the
file being replaced belongs to *that* database and SQLite applies it, so at
best you get "disk image is malformed" about a sound backup and at worst it
applies cleanly and you are silently reading the seed. `backup.restore()`
does it properly. A97 covers all of it.

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

The phrase list was the only half being checked. B33b does the numbers: the
clean approvals a category needs to graduate, and what a rejection resets
clean and auto to. A demo that graduates at fifteen while the product needs
twenty is a demo of a different product, and every suite stays green while
it says so. Anything else that has to be one number in two files goes in
that list.

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
  retention. The writer is `Ctx._span`, called from `_journal` so the two
  cannot drift — and the trap is `error`: an exception message like "no
  mailbox for Mrs Shaw" is personal data wearing a diagnostic's clothes, so
  only the type goes in and the journal row keeps the detail. A90 plants a
  name and address in a body, a draft and an exception, and fails if any of
  the three reaches a span.
* **44 points.** Every control is at least `var(--tap)` on every surface. It
  may look smaller — a slider track is 6px inside a 44px control, the way iOS
  draws one — but the target is not. `hunt_ui.js` B20 reads it off the
  stylesheet, so a control pinned under it fails the suite.
* **Markup carries values, never rules.** A `style=` attribute cannot be
  overridden, is not reached by a media query and does not exist as far as
  the Reduce Transparency and dark blocks are concerned. A bar width or a
  a category's colour is data: pass it as a custom property (`--w`, `--c`)
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
* a dead model server degrades the sweep rather than 500ing it
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
* a backup taken mid-write is a consistent snapshot, never overwrites,
  and restores — including over a file with another database's journal
  beside it, which a plain cp silently gets wrong
* the egress gate turns away a lookalike host, a host nobody put on the
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
* asked about something not connected, it says so and how to connect it —
  on the model path as well as the no-weights one. A rule that exists in
  only one of the two is a rule most people never meet
* a probe that builds the state it is checking for cannot see that state
  never being built. A93 wrote its own approval row with raw SQL and passed
  on a build where the sweep never filled the column it reads, so nothing a
  person would ever queue could be sent. It goes through `_queue` and the
  real sweep now
* a script Blokk did not write runs with no network, no /home, /Users or
  /root, none of the parent's environment, a memory ceiling, and a timeout
  that takes anything it forked — proved by making the child sleep past the
  kill and try to write a file. Where no boundary can be built it refuses
  rather than running unconfined, which is the branch the whole file rests on
* a reply can actually be sent, and only ever the one that was approved, to
  only the address on the row it was drafted against. Unwired, unapproved,
  no recorded recipient, a moved address, a Bcc smuggled into a recipient or
  a subject: each refused, each by its own rule
* an approved hold goes into Calendar.app itself where macOS allows it, and
  writes the .ics either way — the file first, so a Calendar that refuses
  never leaves somebody with no record. A guest called
  `Smith" & (do shell script "rm -rf ~") & "` is a name and not a command:
  every value goes in as an escaped AppleScript literal, a newline is escaped
  (a literal cannot span lines) and a control character is refused outright.
  The preview says which of the two this machine will actually do
* a diary entry refuses over something already at that time and names what
  it ran into; a shared day is written and what else is on it is named; a
  thing that ends at three and one that starts at three do not clash; the
  same entry approved twice is one file; and what it writes reads back
  through Blokk's own parser with the comma in the title intact
* an entry with a time on it is written with that time. Bookings are
  counted in nights, so everything here was a whole-day event and an
  appointment landed in Calendar as one — visibly the wrong thing, on the
  one surface a person actually looks at
* a reminder can be asked for, survives the day the Mac was shut, appears
  once, and says how late it is when it is late
* a one-line reply is drafted with the exchange above it — both sides,
  oldest first, quarantined line by line, in triage and the draft and on
  the card
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
* the model layer is exercised over a real socket: streaming and the
  all-at-once fallback, three separate ways a stream can be short (mid-object,
  no [DONE], one mangled chunk) each refused rather than returned, four kinds
  of 200-with-rubbish each named, a null content that becomes "" rather than
  None, and a 500 that does not tell you to start a server that is running
* every journalled step writes a span and every run writes a rollup, carrying
  the shape and the cost and none of the content. The error column is the
  exception's *type*: str(e) reads like a diagnostic and is often a guest's
  name. `./blokk doctor` prints what the week cost, by kind of work
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
* every control on every surface — dashboard, six sheets, ask panel and
  wizard — measures at least 44×44 at 360, 390, 768 and 1440, and nothing
  renders past the right edge. Measured in a real browser by
  `demo/measure.js` on every run, rather than measured once and asserted
  ever after
* the wizard's model table is a table on a Mac and a list of blocks on a
  phone, where six numeric columns rendered as "1.1G12.7G13.8G"
* the toolbar is one glass capsule holding four items, the sheet corners are
  the display's, and every control sized to its content is a capsule —
  the chrome is still iOS 26; the content is the board
* every tray tile clears 4.5:1 for its white ink on the *lightest stop* of
  its gradient, in both themes, measured on composited pixels. The checker
  had to be taught gradients twice to say so honestly: it read only
  background-color and fell through the tile to the page (passing dark by
  accident and failing light about pixels that were fine), and then only
  rgb() stops while Chromium serialises colour-mixed stops as color(srgb …).
  A checker that cannot see the ground is worse than none — it certifies
* light and dark both measure zero text below 4.5:1 across the dashboard,
  the wizard and the demo, checked on rendered pixels with the ground
  composited — not on the token values
* an explicit choice beats the OS in both directions, and system follows the
  OS while the app is open; theme-color follows the ground so the browser's
  own chrome does too
* the link for the phone is printed once, whole, with the port and the
  token in it, and the sentence under it says what typing the address on
  its own does — :80, nothing listening, and Safari calling that "the
  network connection was lost". The firewall is named there too, not only
  in a row further up, and a browser that arrives without the key gets a
  page rather than {"error": "token required"} — a page that carries no
  token
* "turn iCloud Private Relay off" is not in the doctor any more. Apple
  routes local-network connections around the relay, so it cannot be why a
  numeric link fails, and telling somebody to turn it off costs them a
  privacy feature and sends them away from the two things that do cause
  this — a phone on another network, and a router keeping its clients
  apart. Private Relay's one real part in this was the utun interface it
  puts on the Mac, which the old lan_ip() picked and printed. The `.local`
  link is the one a lookup can cost you, and it is labelled as such
* a browser that speaks HTTPS to the plain-HTTP port is answered with a
  fatal TLS alert, not with plaintext. Safari upgrades an address typed
  without a scheme, so what arrives is a ClientHello; this used to reply
  "HTTP/1.1 400" to a client waiting for a TLS record, and a hello with no
  0x0a in it hung the socket instead. The alert stops both — but it does
  **not** make Safari fall back to http://, and an earlier note here
  claiming it did was wrong. By the time the alert is sent the TCP
  connection is already accepted, so iOS sees "connected, then TLS failed"
  and reports "the network connection was lost" (-1005) with no retry.
  The distinction that carries the diagnosis, corrected once by a real
  iPhone: "the network connection was lost" (-1005) has exactly **two**
  causes and both are on the phone. Either the phone reached the Mac and
  Safari's silent HTTPS upgrade of a scheme-less address failed against the
  plain-HTTP port — or the phone never sent a packet at all, because iOS's
  own Local Network permission for Safari ("asked once, and a Don't Allow
  kept for ever" — the iOS twin of the macOS firewall Deny) killed the
  connection locally. The second was proven by a bare address on port 80:
  nothing listening should read "cannot connect", and it read "connection
  was lost", which no Mac can produce on a closed port. A first version of
  this note said -1005 "points at exactly one thing"; the same phone that
  disproved the fallback claim disproved that too. The https-on-http
  counter splits the two from the Mac's side — it moved, attempts arrived
  and it is the scheme; it never moved, it is the permission or the wrong
  network — and `why_not_reaching` names both, so the doctor, the listener
  and the banner all say them. Nothing server-side fixes either: the fixes
  are the QR (it carries the http://) and the phone's own Settings
* asked about the weather, it answers the question rather than printing the
  table. The day named is the day answered about — "tomorrow", not
  2026-08-25 — a weekday resolves against the days that actually came back,
  and a rain question gets a verdict with the figure it rests on. The
  measurements travel as numbers the whole way: peek used to flatten them
  into a sentence, so the only rain figure downstream was inside a string,
  nothing re-parsed it, and "will it rain this week" answered "looks dry"
  over a day at 85%. A figure that did not come back is said to be missing
  rather than counted as zero, and a rate limit from the far end reads as a
  sentence instead of arriving as its own JSON
* updating can happen on its own, and update.sh's objection to that still
  holds — "a machine that quietly fetches code is a machine whose behaviour
  you cannot pin to a moment". The answer is not to refuse, it is to write
  the moment down. `./blokk autoupdate notify|apply` switches it on; unset
  reads as off, so a Mac nobody has configured makes no call it was not
  asked to make. It looks once a day at most, backs up before applying,
  leaves a schema change for a person, refuses over edited files — and
  records every check and apply with the commit to reset back to. Untracked
  files are not edits: counting them meant an updater that refused every
  night over a stray file and reported itself switched on the whole time
* every POST route answers a wrong-typed field with a 4xx rather than a 500
  — 616 requests, every field holding the wrong kind of thing, no 5xx. And
  ten taps on the same approval at once produce exactly one decider: the
  claim is a single conditional UPDATE, so trust cannot move twice on a race
* the queue's last card always ends clear of the chat bubble. The composer
  is fixed to the bottom-right corner, so it floats over whatever is under
  it — measured at 360, 390, 430 and 600, the centre of every control is
  free and the bubble takes at most the button's bottom-right corner, which
  is what a floating control does. The case nobody can scroll out of is the
  last card, and `main`'s 84px bottom inset is the only thing stopping its
  Approve from sitting under 56 points of glass for ever. B37 pins that to
  the bubble's own height, so the round number cannot drift; B37b pins the
  wide layout's different guarantee — a centred column ending before the
  bubble begins — at the breakpoint where it is tightest
* the router knows the words people use, not the words the connectors are
  called. "Do I need a coat?", "should I take an umbrella tomorrow?", "how
  windy is it going to be?" and "is it warm this weekend?" all reach the
  forecast; "when are the Shaws coming?" reaches the diary; "did anything go
  wrong?" reaches the runs. The coat one was the worst of them and not
  because it missed: the bare word "need" matched the approval queue, so a
  question about the weather was answered with a list of things to approve.
  A confident answer to a question nobody asked is worse than "I do not
  know". A113 holds eighteen of these
* the firewall check reads the verdict, not the presence of a word.
  `socketfilterfw --listapps` lists an app whether it is allowed or blocked,
  with the verdict on the next line, so asking whether "python" appears
  anywhere told a Mac where somebody had clicked Deny that python was
  allowed — on the one screen they would go to for it. macOS asks that
  question once and never again. "Block all incoming" is checked too: it
  overrides the per-app list entirely, so every entry can say Allow and
  nothing gets in
* and "did anything arrive at all" is now observed rather than inferred.
  `./blokk listen` binds a port, prints the link and a QR, and reports every
  connection with where it came from and what it was — plain HTTP, a TLS
  hello (the address typed without http://), or a socket that opened and
  said nothing. Something arrives and the network is fine and the fault is
  in the app; nothing arrives and it names the three things it can be, in
  the order worth checking. It is a separate listener on a separate port on
  purpose: the answer must not depend on the database opening
* the run checks itself, so a diagnosis is not behind a command nobody
  knows to type. Starting Blokk names anything that would stop a phone
  reaching it — every firewall verdict that blocks, not just the one the
  banner happened to know about — and says whether anything has *ever*
  reached this Mac from another device. That last one is the half no check
  on this side can measure: "the phone cannot get through" and "nobody has
  opened it on a phone yet" are identical from here, and the difference is
  the whole diagnosis. The server records every non-loopback arrival, so
  the answer survives a restart. Loopback is excluded — the browser on this
  Mac, the suites and the doctor's own health check would otherwise make
  the record say yes on a machine no phone has touched. Silence is the
  normal output: a wall of green on every start is how a terminal stops
  being read
* every container insets its content by the same amount on all four sides:
  the cards 16, the run cards 12, the toolbar 3, and the cards sit 12 apart.
  Measured in a browser, not asserted

## Not built yet

* the sandbox is **not** gVisor and not a microVM, and a native escape gets
  out of it. Those are the right answer for genuinely hostile code and both
  are a dependency this project will not take. What is there is defence in
  depth against a script that is *wrong*, and a serious obstacle to one that
  is malicious — read it as that and no further. If code mode ever runs
  something a stranger wrote, this is the line to revisit first.
* the *quality* of what a model writes is still unmeasured — `./regress.py`
  is honest that stub prose makes its numbers meaningless, and they start
  counting when real weights are on. It measures a rate now rather than a
  coin flip, which is what makes "did that prompt change help" answerable
  at all — but 3/3 against a stub is 3/3 of nothing. The same caveat covers
  the sampling split and the shape retry: both are written and probed, and
  neither can be *demonstrated* without weights on a real Mac. The plumbing underneath is no longer
  unexercised: `demo/fakeserver.py` is a real OpenAI-compatible server and
  A91 drives every path over HTTP.
* sending exists and is off until you wire it. What is deliberately *not*
  built is anything that sends without a person deciding each one:
  `send_reply` is pinned for ever, and there is no batch, no "reply to all of
  these" and no scheduled send. That is not a gap to be filled in later.
* Calendar.app is written to through `osascript`, not EventKit — so there is
  no signed bundle and macOS still asks the person once, with its own dialog.
  What that leaves unbuilt is a *quieter* path: an EventKit build would not
  need the Automation prompt and could write without Calendar.app running.
  Not worth an app bundle for this.
* Ask's search ranks on whole words with the stopwords dropped, weights the
  subject and the sender above the body, and labels each hit strong, partial
  or weak. What it is not is an index: every search reads the rows and scores
  them, bounded by `FIND_SCAN`, so it stays honest on one Mac's archive and
  would not stay honest on ten. If that day comes the answer is SQLite's own
  FTS5, not a bigger loop.

## If you are picking this up cold

Start it with no model at all — `./setup.sh --stubs && ./run.sh` — and press
"Run the sweep". Every mechanism is real; only the prose is fake. That is the
fastest way to see what the system does before reading how.
