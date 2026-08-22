---
description: Add a regression probe for a bug just fixed
argument-hint: [what broke]
---
Add a probe for `$ARGUMENTS` to `demo/hunt.py` (server) or `demo/hunt_ui.js`
(front end).

A probe returns `(found, detail)` where `found=True` means the bug is present.
Write it so it **fails against the unfixed code** — verify that by reverting
your fix mentally and checking the probe would catch it.

Give it the next `A<n>` or `B<n>` number, and make the detail string say what
the consequence is, not just what the condition is. "one malformed row takes
down the whole queue endpoint" beats "evidence parse failed".

Then run `./test.sh`.
