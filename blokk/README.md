# Blokk

A local agent runtime for several small businesses on one Mac. It reads mail
and calendars overnight, queues anything that needs a decision, acts alone on
the categories that have earned it, and learns from your corrections.

Nothing leaves the machine. Stdlib only — no `pip install` for Blokk itself.

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
approval queue and one trust gate. The chat surface is read-only by
construction, because it reads untrusted mail and holds private data, and
denying it an exit is the only defence that survives contact.

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
