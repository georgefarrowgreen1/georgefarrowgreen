# Adding your own data

Blokk ships wired to a sample world so it runs end to end before it touches
anything real. Replacing that is one source at a time, in this order.

Nothing below puts a password in the repo, in `blokk.db`, or in a `.env`.
The database stores a Keychain *service name*; Blokk reads the secret at call
time. A leaked `blokk.db` leaks metadata, not access.

    python3 connect.py list      what is wired
    python3 connect.py test      prove every credential works
    python3 connect.py peek …    see exactly what it would read
    python3 connect.py ask "…"   the chat, with every step printed

Local sources take a folder as well as the word `local`. `local` means
wherever the Apple app keeps it; a path means that path — an exported
mailbox, a maildir from any other client, a folder of `.ics` files. Both
readers take plain formats now, not only Apple's own layouts.

**All of this is in the app too.** The ⚯ button on the dashboard does
workspaces, sources, the peek, the Full Disk Access check and the credential
test; ⇧ pulls an update and restarts. The commands here are the same code
underneath (`core/sources.py`), so use whichever is in front of you — the
terminal is not the privileged one. What has no button, on purpose, is
putting a password anywhere near a browser: that stays in a terminal, and
Blokk only ever stores the service name. `connect.py add` now asks for it
there and puts it away for you — hidden, straight to `security`, never in
argv, the database or the log — so it is one command rather than two.

**Or just say so.** The chat box can do all of this: "what can I connect?",
then "connect my mail", then approve the card. It proposes; the approval
queue runs it; nothing happens without your tap. It picks the route that
needs no password wherever one exists, which for Mail, Calendar and Messages
on this Mac is all three of them.

## 0. A workspace of your own

The four that ship — cottages, biz2, biz3, personal — are invented, and the
fake connectors fill gaps *by workspace id*, so a real business living in one
of them gets handed invented guests for anything not yet wired. Make your own
before you wire anything real:

    python3 connect.py workspace add georgefg "George Farrow Green"
    python3 connect.py workspace              # what exists now
    python3 connect.py local                  # what this Mac will hand over

Then, once you have your own and it works, take the sample world out:

    python3 connect.py clean --yes

### If a source tests ok but peeks empty

Two different things look identical from the outside, so the panel now says
which: **what it found** (`3 calendar(s)`, `1705 message(s), newest 12 Aug`)
and **the window it looked at** (mail: the last 60 days; calendar: the next
90). "Nothing in the last 60 days, 1705 on disk, newest from June" is a
readable source with old mail. "0 calendars, and here is where I looked" is
Full Disk Access, or a Mac that syncs nothing locally.

If the layout on your Mac is unusual — mail on another volume, say — point
them somewhere else:

    BLOKK_MAIL_ROOT=/Volumes/Archive/Mail ./blokk
    BLOKK_CALENDAR_ROOT=~/Library/Calendars ./blokk

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

## 3a. Somewhere to put holds — the one that writes

Everything else here reads. This one writes, and it is the only one that does:

    python3 connect.py add cottages ics_out local

`local` means `~/Blokk/Holds`; give a folder instead if you want it somewhere
you will see it, like `~/Desktop/Holds`. Blokk creates it.

When you approve a set of dates, a `.ics` file appears in there. You open it
and Calendar asks whether to add the event. **Blokk does not put it in your
diary** — writing into Calendar.app needs EventKit, a signed bundle and a
consent dialog, which is a different kind of program from this one. Nothing
in Blokk will ever tell you an entry was added, because it was not.

Two things it does do. It refuses to write over a night your calendar already
has something on, and names the nights rather than saying "clash" — so wire
your calendar first, or it has nothing to check against. And the filename
comes from the booking rather than the clock, so approving the same dates
twice replaces one file instead of leaving two.

Holds are `pinned`: they never graduate to happening on their own, however
many you approve. A file appearing in a folder off the back of a sentence in
a guest's email is exactly what the queue is there to stop.

## 4. Per workspace, not per account

Each business gets its own Keychain entry and its own row:

    python3 connect.py add biz2 imap blokk-biz2-mail

One leak should cost you one business. Never point two workspaces at the same
credential — the isolation is the credential, not a rule in a prompt.

## 5. The two that reach off the machine

Everything above reads something you already have. These two do not, so they
go through `core/egress.py` and they are the only things that can.

    python3 connect.py add personal weather "Newcastle upon Tyne"
    python3 connect.py add personal web https://www.gov.uk/bank-holidays

Adding one allows exactly the hosts it needs, for that workspace only, and
removing it takes them away again:

    python3 connect.py egress            what each workspace may reach
    python3 connect.py egress log 20     what has actually left, and when
    python3 connect.py egress deny personal www.gov.uk

**Weather** sends a latitude and a longitude, rounded, and nothing else. No
key, no account, no credential to keep. It returns days as numbers and a word
from a code table, so nothing writes prose you would have to trust.

**Web** reads one page, when you ask — `connect.py peek personal web`. Nothing
fetches it on its own: not the nightly sweep, and never Ask, which holds your
mail and calendar in the same context and so must never be given a tool that
names a URL. What comes back is text and a title with the markup gone and the
quarantine flag already on it. Text hidden with `display:none` is kept on
purpose: that is where an instruction meant for a model and not for you goes.

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
