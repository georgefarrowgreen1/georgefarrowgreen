# demo/

A browser port of the engine, for showing the system without a Mac running.

    node test.js       14 unit checks
    node journey.js    the four end-to-end journeys

`engine.js` is a faithful port of `core/durable.py`, `core/harness.py` and
`flows/morning_sweep.py` — same journal, same replay, same idempotency keys,
same policy thresholds, same quarantine pattern. The store is in memory
instead of SQLite; nothing else differs.

`index.html` wraps it in the real dashboard plus a live inspector, so the
journal, trust ledger and event feed are visible while you use the phone UI.

Keep the two in step. If you change a threshold in `core/harness.py`, change
it here and re-run `journey.js`.

## contract.js

    node contract.js   API satisfies paint()

Asserts the API responses carry every field `web/index.html`'s `paint()`
reads. Run it after changing either side — the front end fails silently when
a field goes missing, and silently is the worst way to find out.

## hunt.py / hunt_ui.js

    python3 hunt.py     adversarial pass over the server
    node hunt_ui.js     adversarial pass over the front end

These try to break it rather than confirm it works. Both should print
`0 issues found`. When you add an endpoint, add a probe.

Two entries are deliberately not defects and stay in the suite so the choice
remains visible: loopback is trusted without a token (A1), and episodes
outlive the approvals they came from (A7).
