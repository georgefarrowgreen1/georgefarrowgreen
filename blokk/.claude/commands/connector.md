---
description: Scaffold a new read-only connector
argument-hint: [name] e.g. notes, reminders, ledger
---
Add a connector called `$ARGUMENTS` in `core/connectors/`.

Follow the contract in `core/connectors/__init__.py`:

* **Never hold a secret.** Take a Keychain service name; resolve at call time
  via `core.connectors.keychain.secret()`. The database stores the ref only.
* **`writes = False`** unless explicitly asked otherwise. A writing connector
  is only ever called inside `ctx.activity(..., side_effect=True)`.
* **Search, don't list.** Every read takes a filter and a limit.
* Return dicts carrying `provenance` — `"untrusted"` for anything from
  outside, `"self"` for the user's own content.
* Implement `check()` so `python3 connect.py test` can prove the credential
  works and say what it can see.

Then register the kind in `core.connectors.wire()` and in `connect.py:KINDS`,
and add it to `CONNECTING.md` with the exact `security add-generic-password`
line someone would need.

Do not wire it into `flows/morning_sweep.py` until it has been read-only for a
while — see the ordering at the bottom of `CONNECTING.md`.
