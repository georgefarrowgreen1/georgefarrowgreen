---
description: Check a change against the six invariants
---
Review the current diff against the invariants in CLAUDE.md:

1. Workflow decides, activities do — any clock, network or randomness in
   `flows/`? Any side effect not behind `ctx.activity(side_effect=True)`?
2. One write path — anything that changes the world bypassing the approval
   queue? Any write tool added to `core/ask.py`?
3. Untrusted content is data — anything fetched reaching a model without
   `quarantine_read` and a `provenance` field?
4. Trust is per workspace + category — any autonomy that transfers?
5. Scope is data, not prompt — any isolation enforced by instruction rather
   than by SQL or the registry?
6. Fail loudly, degrade locally — any new silent failure? A truncated stream,
   a swallowed exception, a UI state that looks successful when nothing
   happened?

Also: does `demo/engine.js` still match the Python? Does any new shell use
bash 4 syntax?

Report anything that violates one, with the file and line.
