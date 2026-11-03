# Addendum to spec.md (from the integrator)

Points added during the build. Where they disagree with spec.md or handoff.md, this file wins.

## R1. Speed (George, 3 November)
George asked for this build to be done in the most time-efficient way. Build only what your brief and the spec ask for,
prove it with the checks named, and don't run end-to-end tests your brief doesn't name (two runs at a time machine-wide).

## R2. Markets amounts on Today (George, 3 November)
Today's own Markets card (and the morning line and evening wrap, which are George's own) keeps showing pounds. The
"percent only" rule (name, sym, pct, day) applies to cards that leave the account: anything sent to a friend through
Chat or Send. Stage 2's Markets module and connector follow this.

## R3 (George, 3 Nov, during stage 1 testing): speed and stages 2–4
- Plan: overlap. Design stages 2 (Markets + Fitness), 3 (Chats) and 4 (Mail) now; build stages 2 and 4 together; stage 3 right after. Each goes live separately, with its own rollback.
- Chat's keys: a dedicated background Worker holds keys, IndexedDB, decrypt and seal; the module UI in the page sees only what the core returns. Still end-to-end encrypted; nothing new reaches a server.
- One unlock per phone at inflite.ai is fine (a single tap where a passkey allows).
- Extra test capacity: yes (extra cloud sessions to run suite halves).
- Lighter process: specs reuse stage 1's contracts; deep adversarial review only for the risky parts (encryption, Mail's body boundary, shared Today code).
