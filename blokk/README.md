# Blokk

A local agent runtime for several small businesses on one Mac. It reads mail
and calendars overnight — at 04:00 by default, or when the lid next opens if
the Mac was asleep — queues anything that needs a decision, acts alone on the
categories that have earned it, and learns from your corrections.

Your mail and calendars never leave the machine. A few sources have to reach
outwards — a forecast is not on your Mac — so the rule is stated exactly:
nothing leaves except requests you allowed, to hosts you named, and
`logs/egress.log` says what left. Stdlib only — no `pip install` for Blokk
itself.

```bash
./blokk
```

Unconfigured, that opens a setup wizard in your browser. Configured, the same
command starts the model servers and the app. It prints a link for your phone.

## Start here

Run it with no model at all:

```bash
./setup.sh --stubs && ./run.sh
```

Press **Run the sweep**. Every mechanism is real — the journal, the approval
queue, the quarantine, the trust ledger — only the prose is fake. It is the
fastest way to see what the system does before reading how.

Then, in order:

| | |
|---|---|
| `./blokk` | attach a model through the wizard |
| `python3 bench.py --serve http://127.0.0.1:8081/v1` | confirm the batching gain is real |
| `python3 connect.py add cottages messages local` | your own data, read-only |
| `python3 connect.py add cottages ics_out local` | somewhere to put holds — the one that writes |
| `python3 connect.py add personal weather "Newcastle"` | a forecast. A lat and a lon leave; nothing else |
| `python3 connect.py egress` | what each may reach — `egress log`, what left |

## Docs

* **[CLAUDE.md](CLAUDE.md)** — architecture, the six invariants, conventions.
  Read this before changing anything.
* **[MAC-SETUP.md](MAC-SETUP.md)** — model servers, llama.cpp vs MLX, picking
  a model, keeping it running.
* **[CONNECTING.md](CONNECTING.md)** — wiring iCloud Mail, Messages and
  Calendar, one source at a time.
* **[demo/README.md](demo/README.md)** — the browser port and the test suites.

## The idea

**The workflow decides, activities do.** Every side effect is journalled with
an idempotency key, so a crash at 05:00 costs you the downtime and not the
night — completed steps replay for free and the email that already went does
not go twice.

**One write path.** Everything that changes the world funnels through one
approval queue and one trust gate. Ask reads your mail, your calendar and
your queue, holds a conversation about them and proposes changes — but it
cannot carry them out: it has no executor and no way to reach one, because it
reads untrusted mail and holds private data, and denying it an exit is the
only defence that survives contact. You approve, and the queue runs it — then
tells you what it did.

**Autonomy is earned per category and never transfers.** Twenty clean
approvals and a category stops appearing in your queue. Some are pinned to
manual and never graduate. The queue emptying itself is the point.

## Tests

```bash
./test.sh
```

Four suites, two of them adversarial — they try to break it rather than
confirm it works. All must be green before committing.

## Licence

MIT.
