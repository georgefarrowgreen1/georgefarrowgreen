# Rhythm 2.0 cycling beta

An opt-in replacement for ongoing cycling plans. Fitness → Today → Rhythm 2.0 opens the beta sheet.
Classic Rhythm remains the default and can be restored with the same switch. Event plans, running and swimming
continue using classic Rhythm in this first beta.

## Decisions

`fitness/rhythm2.js` is a pure planner shared by standalone Fitness and the InFlite module. It returns the existing
plan shape, plus an observed rider profile, exact workouts and an explicit engine identifier. It uses actual riding
and the rider's available time, not missed-workout debt. Recent activity governs the weekly time/load budget; focused
sessions require recovery spacing, and the check-in and recovery trends can ease the day. The next fourteen days are
provisional until the rider records a session. Manual choices remain explicit overrides.

The profile separates endurance, sustained power, repeatability, sprint evidence and late-ride power. Confidence
expresses evidence coverage, not physiological certainty. Power curve observations are not assumed to be maximal tests.
This beta does not automatically change FTP or present the classic percentage readiness score.

Intervals are composed from a work dose and recoveries, with exact warm-up/cool-down and remaining easy time. Two
independent, controlled reviews at the same dose can support one progression in duration or repetitions; an unusually
hard or reduced session reduces work. Traffic, time and equipment interruptions do not count as capability failures.
The stored dose is the one that actually fitted the slot. Missing power data is uncertain, not a failed workout.
These are conservative coaching heuristics, not a validated prediction of adaptation or recovery.

The 2.17 refinement adds evidence freshness, bounded duration progressions, rolling seven-day hard-session limits,
minority interval-work budgets and contextual recovery signals. See [research and exact decision rules](rhythm2-science.md)
for the 2024–2026 reviews, their limitations and the distinction between published evidence and product guardrails.
The beta sheet includes expandable planning explanations and direct research links.

## Prescriptions and feedback

`fx_rhythm2` stores account-owned immutable prescriptions with the original FTP, objective, full steps, date and engine.
Identical submissions are idempotent. A changed or moved session can create a new prescription, leaving the original
record intact. Downloads record generated sessions before exporting. FIT targets use absolute watts, so a device FTP
setting cannot rewrite a captured target. Display targets also preserve the originally prescribed watts after an FTP
change.

Feedback is separate and uses a revision check, preventing silent overwrites between devices. Optional activity links
must belong to the same account. The API accepts no FTP changes through feedback. Records are included in account
export and removed by account deletion. The normal record read is bounded to 180 recent records; full export includes
all retained history. There are no background communications to third parties.

- `GET /api/fitness/rhythm2` — recent prescriptions/reviews.
- `POST /api/fitness/rhythm2/prescriptions` — validated, immutable prescription.
- `POST /api/fitness/rhythm2/feedback` — bounded feedback with optimistic concurrency.

The new planner is lazy-loaded. Classic users make no training-record request until they open the beta, and active
beta sessions cannot be offered until the account's records load. Signing out or changing accounts invalidates pending
results. The existing Today snapshot carries the selected plan into the cross-app daily view.

## Validation and next stage

Unit tests cover dose progression, time/load limits, hard-day spacing, missing evidence, preserved watt targets,
absolute FIT export, immutable/idempotent storage, account boundaries, origin checks and feedback conflicts. Browser
checks use the real InFlite framework for opt-in/out, session recording, feedback and responsive layouts.

The first release keeps dated event planning and multi-sport coaching on classic Rhythm. Future work can extend the
planner to those goals, improve real-world interval matching using laps and pauses, and evaluate longer-term training
responses. The same engine and record API can support the native Mac client; this release does not replace its native
planning integration.
