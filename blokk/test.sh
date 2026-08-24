#!/usr/bin/env bash
# Every suite. Run before committing.
set -uo pipefail
cd "$(dirname "$0")"
FAIL=0
run() {
  printf '\n\033[1m── %s\033[0m\n' "$1"; shift
  "$@" || FAIL=1
}
# The hunts need a clean database; they mutate deliberately. But this line
# used to delete whatever was there without a word, and blokk.db is the one
# file CLAUDE.md calls "the thing to back up": the wired credentials, the
# trust ledger, the facts it has learned and the corrections behind them.
# Running the suites before a commit is a thing anybody does, and losing a
# fortnight of approvals to it is not a reasonable price for running tests.
#
# Same reasoning as blokk.conf below, which has been protected all along.
# The database needed it more.
KEPT=$(python3 demo/realdb.py 2>/dev/null || true)
if [ -n "$KEPT" ]; then
  SAVED=$(python3 demo/realdb.py --save 2>/dev/null || true)
  if [ -z "$SAVED" ]; then
    printf '\033[31m  blokk.db holds %s and could not be backed up.\033[0m\n' "$KEPT"
    printf '  Nothing has been deleted. Move it aside yourself, then run this again.\n'
    exit 1
  fi
  printf '\033[33m  note: blokk.db held %s.\033[0m\n' "$KEPT"
  printf '  The suites need a clean one, so it was copied to\n'
  printf '    %s\n' "$SAVED"
  printf '  Put it back with:\n'
  printf '    rm -f blokk.db blokk.db-wal blokk.db-shm && cp %s blokk.db\n' "$SAVED"
  printf '  The rm matters. A -wal left beside a restored file belongs to the\n'
  printf '  database being replaced, and SQLite applies it: at best you get\n'
  printf '  "disk image is malformed" about a sound backup, at worst it applies\n'
  printf '  cleanly and you are silently reading the seed you just wrote.\n\n'
fi
rm -f blokk.db blokk.db-wal blokk.db-shm
python3 seed.py >/dev/null

# blokk.conf is NOT deleted — it is yours, and it may be a real setup. But it
# decides what the suites run against: with a model server configured and not
# running, every workflow fails on an unreachable endpoint and probes that
# expect a run to finish report a defect that is not there. Cost me an hour.
if [ -f blokk.conf ] && ! grep -q '^MODE=stubs' blokk.conf; then
  printf '\033[33m  note: blokk.conf is configured for a model server.\033[0m\n'
  printf '  The suites will use it. If it is not running they will fail on that,\n'
  printf '  not on the code. ./blokk doctor says which.\n'
fi

run "server: adversarial"   python3 demo/hunt.py
run "front end: adversarial" node demo/hunt_ui.js
run "API contract"          node demo/contract.js
run "engine journeys"       node demo/journey.js
run "unit"                  node demo/test.js
run "python parses"         python3 -m compileall -q core api flows

printf '\n'
if [ "$FAIL" = "0" ]; then printf '\033[32m  all suites green\033[0m\n\n'; else
  printf '\033[31m  FAILURES above\033[0m\n\n'; fi
exit $FAIL
