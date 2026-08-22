# Adding your own data

Blokk ships wired to a sample world so it runs end to end before it touches
anything real. Replacing that is one source at a time, in this order.

Nothing below puts a password in the repo, in `blokk.db`, or in a `.env`.
The database stores a Keychain *service name*; Blokk reads the secret at call
time. A leaked `blokk.db` leaks metadata, not access.

    python3 connect.py list      what is wired
    python3 connect.py test      prove every credential works
    python3 connect.py peek …    see exactly what it would read

## 1. Messages — start here

No credential, nothing leaves the Mac, read-only. It proves the plumbing
before you hand anything an app password.

    System Settings → Privacy & Security → Full Disk Access → add Terminal
    python3 connect.py add cottages messages local
    python3 connect.py test
    python3 connect.py peek cottages messages 6

Opened `mode=ro&immutable=1`, so a sweep can never write to, lock, or corrupt
your message history. Without Full Disk Access it fails with "unable to open
database file", which is not a helpful error — check that first.

## 2. iCloud Mail — read-only, and leave it that way for a fortnight

1. appleid.apple.com → Sign-In and Security → App-Specific Passwords.
   Generate one called "Blokk". Apple shows it once.
2. Put it in the Keychain:

       security add-generic-password -s blokk-cottages-mail \
         -a you@icloud.com -w

3. Tell Blokk the service name:

       python3 connect.py add cottages imap blokk-cottages-mail
       python3 connect.py test
       python3 connect.py peek cottages mail 10

`peek` is the step people skip. It prints what the connector actually pulled
and flags anything shaped like an instruction, so you find out what your
inbox contains before an agent does.

The mailbox is opened `readonly=True`, so nothing is marked as read. The
connector has no send method at all — sending is a separate connector you
have to deliberately write, because the architecture rests on there being one
write path and it running through the approval queue.

Worth knowing: iCloud has no mail API, only IMAP. No labels API, no push,
weaker threading than Gmail. Don't design a workflow that assumes otherwise.

## 3. Calendar

Same app-specific password works.

    security add-generic-password -s blokk-cottages-cal -a you@icloud.com -w
    python3 connect.py add cottages caldav blokk-cottages-cal
    python3 connect.py test

## 4. Per workspace, not per account

Each business gets its own Keychain entry and its own row:

    python3 connect.py add biz2 imap blokk-biz2-mail

One leak should cost you one business. Never point two workspaces at the same
credential — the isolation is the credential, not a rule in a prompt.

## Writing your own

`core/connectors/__init__.py` has the contract. Three rules:

* **Never hold a secret.** Take a Keychain ref; resolve at call time.
* **`writes = False`** unless you mean it. A writing connector is only ever
  called inside `ctx.activity(..., side_effect=True)`, so the call carries an
  idempotency key and lands in the journal.
* **Search, don't list.** Every read takes a filter and a limit, and returns
  dicts carrying `provenance`. Anything marked `untrusted` goes through
  `quarantine_read` before it can reach a model.

A connector that raises is logged and skipped — the other workspaces still
sweep. Failing loudly at 04:00 with nobody watching is not a feature.

## The order that matters

1. Read-only for a fortnight, with nothing wired to a write path.
2. Read the logs. `python3 connect.py peek` and the journal in the UI.
   You will find out what your own mail actually looks like, which is never
   what you assumed.
3. Only then let one category start proposing.
4. Autonomy is earned in the queue, not switched on here.
