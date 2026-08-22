#!/usr/bin/env bash
# Blokk. Pull the latest code and restart.
#
#   ./update.sh              fetch, show what is coming, pull, restart
#   ./blokk update           the same thing
#   ./update.sh --no-restart pull, but leave the running Blokk alone
#
# --no-restart is for the GUI, which streams this output into the browser and
# then restarts through its own endpoint. A script that pulls the rug out
# from under the connection printing its progress ends mid-sentence, and the
# page cannot tell that from a crash.
#
# Deliberately not automatic. Nothing here phones home on startup: a machine
# that quietly fetches code is a machine whose behaviour you cannot pin to a
# moment, and "nothing leaves the machine" should mean nothing, including a
# version ping. You update when you say so.
set -uo pipefail
cd "$(dirname "$0")"

NO_RESTART=0
[ "${1:-}" = "--no-restart" ] && NO_RESTART=1

BOLD=$'\033[1m'; DIM=$'\033[2m'; OK=$'\033[32m'; WARN=$'\033[33m'; OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s\n' "$BOLD" "$OFF" "$*"; }
warn() { printf '%s !  %s%s\n' "$WARN" "$*" "$OFF"; }
good() { printf '%s ok %s%s\n' "$OK" "$*" "$OFF"; }

step "Checking this is a clone"
REPO="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO" ]; then
  warn "Not a git clone, so there is nothing to pull."
  say ""
  say "  You are running a copy. To get updates from now on, clone it and"
  say "  carry your two state files across:"
  say ""
  say "    git clone https://github.com/georgefarrowgreen1/georgefarrowgreen.git"
  say "    cp blokk.db blokk.conf georgefarrowgreen/blokk/"
  say ""
  say "  ${DIM}blokk.db is the system; blokk.conf is which model you picked.${OFF}"
  exit 1
fi
good "clone at $REPO"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
[ "$BRANCH" = "HEAD" ] && { warn "Detached HEAD. 'git checkout main' first."; exit 1; }

# Refuse rather than clobber. Someone who edited a file wants to know.
step "Checking for local edits"
DIRTY="$(git status --porcelain -- . | head -20)"
if [ -n "$DIRTY" ]; then
  warn "You have uncommitted changes under blokk/:"
  say ""
  printf '%s\n' "$DIRTY" | sed 's/^/    /'
  say ""
  say "  Keep them:     git stash        (then ./update.sh, then git stash pop)"
  say "  Discard them:  git checkout -- ."
  exit 1
fi
good "working tree clean"

step "Fetching"
git fetch --quiet origin "$BRANCH" || { warn "Could not reach GitHub. Are you online?"; exit 1; }

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
if [ "$LOCAL" = "$REMOTE" ]; then
  good "already up to date ($(git log -1 --format=%h) on $BRANCH)"
  exit 0
fi

step "What is coming"
git --no-pager log --oneline --no-decorate "HEAD..origin/$BRANCH" -- . | sed 's/^/    /'

# A schema change is the one update that touches your data. Say so before,
# not after.
if ! git diff --quiet "HEAD..origin/$BRANCH" -- core/schema.sql; then
  say ""
  warn "This update changes core/schema.sql — your database is affected."
  warn "Back up blokk.db before continuing:  cp blokk.db blokk.db.backup"
fi

step "Pulling"
git merge --ff-only "origin/$BRANCH" >/dev/null 2>&1 || {
  warn "Could not fast-forward — your branch has commits that are not on origin."
  warn "Sort it out with: git pull --rebase"
  exit 1
}
good "now at $(git log -1 --format='%h %s')"

if [ "$NO_RESTART" = "1" ]; then
  say ""
  say "  Pulled. Nothing restarted — the caller asked to do that itself."
  exit 0
fi

step "Restarting"
# A control plane started by run.sh writes its pid and restarts on SIGUSR1,
# so there is nothing for you to stop. Model servers are left alone: they are
# detached and get reused, which is why this takes a second.
PID=""
[ -f .blokk.pid ] && PID="$(cat .blokk.pid 2>/dev/null || true)"
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  if kill -USR1 "$PID" 2>/dev/null; then
    good "told the running Blokk (pid $PID) to restart — no need to stop anything"
    say "  ${DIM}Its terminal will say so. The model servers keep running.${OFF}"
  else
    warn "Could not signal pid $PID. Stop it with Ctrl-C and run ./blokk."
  fi
elif launchctl list 2>/dev/null | grep -q com.blokk; then
  launchctl kickstart -k "gui/$(id -u)/com.blokk" 2>/dev/null \
    && good "launch agent restarted — it is already running the new code" \
    || warn "Could not restart the launch agent. Try: launchctl kickstart -k gui/$(id -u)/com.blokk"
else
  [ -n "$PID" ] && rm -f .blokk.pid       # a pid pointing at nothing
  say "  ${DIM}Blokk is not running, so there was nothing to restart.${OFF}"
  say "  Start it when you want it:"
  say ""
  say "    ./blokk"
fi
say ""
