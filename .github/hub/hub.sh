# InFlite's hub, from GitHub Actions: what .github/workflows/hub-key.yml, hub-off.yml and hub-stage.yml do, one step at a
# time (Today First, spec §15.4). Each step is a shell of its own (bash -eo pipefail) that sources this file and calls one
# of these:
#   cf_account          → the Cloudflare account: CLOUDFLARE_ACCOUNT_ID, or else the one account the token can see;
#                         left for the steps after it as HUB_ACCOUNT (GITHUB_ENV), which this file reads when sourced
#   give_key HUBS       → one key for both site Workers and each Worker HUBS names (inflite.ai: inflite; next.inflite.ai: the staging inflite-next; both)
#   wait_ready HUBS     → each hub's /api/hub asked until it says it's ready
#   door_shut           → chat.inflite.ai/_hub/version is 404 to anyone without the key, a made-up one included
#   key_verdict         → hub-key.yml's last step: what's live now, from each step's outcome
#   take_key_worker [W] → a Worker's HUB_KEY deleted (inflite's: the hub at once not ready, Today links to each app's
#                         own address)
#   wait_hub true|false [seconds] [site] → a hub's /api/hub asked until it says so
#   take_back_pushes    → the push rows the hub fanned out, deleted from D1 (via = 'hub'; spec §15.4's four statements)
#   off_verdict         → hub-off.yml's last step
#   stage_origins       → preserve existing origins and add both hubs on both site Workers
#   stage_clone REF     → the inflite repo at REF (one of its own branches or tags, or a commit on one), fetched into
#                         the runner's temporary folder; its wrangler.toml checked (the staging Worker, at
#                         next.inflite.ai alone, nothing run as it's built) and its Today's build read
#   stage_deploy        → that build deployed to the staging Worker (inflite-next), wrangler told exactly what to read;
#                         never inflite
#   stage_check         → next.inflite.ai/version says that build, and its /api/hub answers as the hub; and, for the
#                         record only, what inflite.ai says (its Today, its hub on or off: live_said)
#   stage_verdict       → hub-stage.yml's last step
# And One roof's off switch (roof.yml; stage 1, spec §8.5, §11.2 level 1): Weather back to milestone 1's page at /weather/
# by a Worker secret, seconds, no build:
#   worker_settled W    → the Worker's newest version is the one deployed (else Cloudflare won't change its secrets:
#                         refused, saying what to do, nothing changed)
#   roof_set W off|on   → after worker_settled: ROOF_OFF "1" put (off), or deleted (on; none there is on already)
#   wait_roof SITE true|false [seconds] → a hub's /api/hub asked until its roof says so
#   roof_verdict        → roof.yml's last step (ROOF_UNSETTLED: the Workers the settled check refused)
# Cloudflare's API is asked with CLOUDFLARE_API_TOKEN, which never goes on a command line (curl reads its header from a
# pipe) nor into the log; a key made here is masked before anything else and only ever piped to wrangler. What's
# printed of an answer from Cloudflare is its error codes and messages, never the request.

PROJECT=inflite-apps      # the apps Worker; shared settings also go to gfg
WORKER=inflite                 # the Worker at inflite.ai (the inflite repo's wrangler.toml name)
STAGING=inflite-next           # the staging hub at next.inflite.ai (the inflite repo's [env.next]: hub-stage.yml deploys it)
DATABASE=bio-db                # the D1 database (this repo's Worker configurations, binding DB)
SITE=https://inflite.ai
STAGING_SITE=https://next.inflite.ai
STAGING_HOST=next.inflite.ai   # the staging Worker's one custom domain (the inflite repo's [env.next] routes)
CHAT=https://chat.inflite.ai
HOME_SITE=https://georgefarrowgreen.com   # where the passkeys' list of origins is (/.well-known/webauthn): the hubs' too
IFL_GIT=https://github.com/georgefarrowgreen1/inflite.git   # the inflite repo (public)
CF_API=https://api.cloudflare.com/client/v4
WRANGLER="npx --yes wrangler@4.149.0"
EVERY=${EVERY:-15}             # seconds between one check and the next
WORKER_PERM="Account › Workers Scripts › Edit"
D1_PERM="Account › D1 › Edit"
# (a Worker's custom domain is its zone's: Cloudflare makes the hostname's DNS record and certificate for the Worker, and
# wrangler finds the zone by the hostname; the "Edit Cloudflare Workers" token template has both)
DOMAIN_PERM="Zone › Workers Routes › Edit on inflite.ai (with Zone › Zone › Read)"

# The account, as the account step found it: HUB_ACCOUNT (a name no env: block in the workflows sets, so nothing there
# can stand in its way), else the CLOUDFLARE_ACCOUNT_ID secret. wrangler takes it as CLOUDFLARE_ACCOUNT_ID.
ACCOUNT=${HUB_ACCOUNT:-${CLOUDFLARE_ACCOUNT_ID:-}}
if [ -n "$ACCOUNT" ]; then export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT"; fi

# (a line for the log and the run's summary page; an error that says so on both, and fails the step)
say() { echo "$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "- $*" >> "$GITHUB_STEP_SUMMARY"; fi; return 0; }
fail() { echo "::error::$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "- **Failed:** $*" >> "$GITHUB_STEP_SUMMARY"; fi; return 1; }
heading() { echo "$*"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "### $*" >> "$GITHUB_STEP_SUMMARY"; fi; return 0; }

# cf METHOD PATH [JSON] → CF_OUT: the answer's result; or CF_ERR: what Cloudflare said was wrong (its codes and words),
# and CF_CODE: its HTTP status (000: no answer; none: never asked)
cf() {
  local method=$1 path=$2 data=${3-} out
  local args=(-sS --max-time 60 -X "$method" -H "Content-Type: application/json")
  if [ -n "$data" ]; then args+=(--data "$data"); fi
  CF_OUT="" CF_ERR="" CF_CODE=""
  case "$path" in
    /accounts//*) CF_CODE=none; CF_ERR="no Cloudflare account id reached this step (a fault in the workflow, not the token: the account step leaves it as HUB_ACCOUNT)"; return 1 ;;
  esac
  out=$(mktemp)
  if ! CF_CODE=$(curl "${args[@]}" -H @<(printf 'Authorization: Bearer %s\n' "$CLOUDFLARE_API_TOKEN") -o "$out" -w '%{http_code}' "$CF_API$path"); then
    rm -f "$out"; CF_CODE=000; CF_ERR="no answer from Cloudflare's API"; return 1
  fi
  if [ "$(jq -r '.success // false' "$out" 2>/dev/null)" != "true" ]; then
    CF_ERR="HTTP $CF_CODE: $(jq -r '[.errors[]? | "\(.code // "?"): \(.message // "")"] | if length == 0 then "no reason given" else join("; ") end' "$out" 2>/dev/null || echo "an answer that isn't JSON")"
    rm -f "$out"; return 1
  fi
  CF_OUT=$(jq -c '.result' "$out"); rm -f "$out"
}

# (what to say of the token after Cloudflare refused: a 401 or 403 is its permissions; anything else may not be)
lacks() {
  case "$CF_CODE" in
    401|403) echo "The token likely lacks $1." ;;
    none) echo "" ;;
    *) echo "If Cloudflare's words don't explain it, check the token has $1." ;;
  esac
}

# Which Cloudflare account: CLOUDFLARE_ACCOUNT_ID where it's set, else the token's own, if it can see only one. Left
# for the later steps (each a shell of its own) as HUB_ACCOUNT.
cf_account() {
  if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    ACCOUNT=$CLOUDFLARE_ACCOUNT_ID; say "Cloudflare account: from CLOUDFLARE_ACCOUNT_ID."
  else
    cf GET "/accounts?per_page=50" || { fail "Couldn't list the token's Cloudflare accounts ($CF_ERR). Set the CLOUDFLARE_ACCOUNT_ID secret, or check CLOUDFLARE_API_TOKEN is a live token."; return 1; }
    local n; n=$(jq 'length' <<<"$CF_OUT")
    case "$n" in
      1) ACCOUNT=$(jq -r '.[0].id' <<<"$CF_OUT"); say "Cloudflare account: the token's one ($(jq -r '.[0].name' <<<"$CF_OUT"))." ;;
      0) fail "The token can't see any Cloudflare account: give it $WORKER_PERM on the account, or set CLOUDFLARE_ACCOUNT_ID."; return 1 ;;
      *) fail "The token can see $n Cloudflare accounts: set the CLOUDFLARE_ACCOUNT_ID secret to the one with the site Workers $PROJECT and the Worker $WORKER."; return 1 ;;
    esac
  fi
  if ! [[ $ACCOUNT =~ ^[A-Za-z0-9]+$ ]]; then fail "CLOUDFLARE_ACCOUNT_ID isn't a Cloudflare account id (letters and digits only): check the secret."; return 1; fi
  export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT"
  if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_ACCOUNT=$ACCOUNT" >> "$GITHUB_ENV"; fi
}
# (each step that asks Cloudflare's API: the account found, or found now)
need_account() { if [ -n "$ACCOUNT" ]; then return 0; fi; cf_account; }

# The Workers a choice of hub means (the staging one first: should it fail, the live one is untouched), and the sites
hub_workers() { case "$1" in inflite.ai) echo "$WORKER" ;; next.inflite.ai) echo "$STAGING" ;; both) echo "$STAGING $WORKER" ;; *) return 1 ;; esac; }
hub_sites() { case "$1" in inflite.ai) echo "$SITE" ;; next.inflite.ai) echo "$STAGING_SITE" ;; both) echo "$SITE $STAGING_SITE" ;; *) return 1 ;; esac; }

# worker_secrets NAME → 0 and CF_OUT: the Worker's secrets (names only); 2: there's no Worker of that name; 1: refused
worker_secrets() {
  cf GET "/accounts/$ACCOUNT/workers/scripts/$1/secrets" && return 0
  if [ "$CF_CODE" = 404 ]; then return 2; fi
  return 1
}

# hub_ask SITE → HUB_READY (true, false, or ? where the answer says neither), HUB_CODE, HUB_BODY: its /api/hub, once.
# Anything may come back (a Cloudflare error page, nothing at all): none of it ends the step.
hub_ask() {
  local body
  body=$(curl -sS --max-time 20 -A "InFlite hub check (GitHub Actions)" -w '\n%{http_code}' "$1/api/hub" 2>/dev/null) || body=$'\n000'
  HUB_CODE=${body##*$'\n'}; HUB_BODY=${body%$'\n'*}
  HUB_READY=$(jq -r 'if type == "object" and has("ready") then (.ready | tostring) else "?" end' <<<"$HUB_BODY" 2>/dev/null) || HUB_READY='?'
  HUB_READY=${HUB_READY:-?}
  return 0
}

# (what has the new key so far: for the verdict at the end, which can't see inside this step; names only)
gave() { HUB_GAVE="${HUB_GAVE:+$HUB_GAVE }$1"; if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_GAVE=$HUB_GAVE" >> "$GITHUB_ENV"; fi; return 0; }

# Update both site Workers, retaining overrides over encrypted settings.
site_secret() {
  local name=$1 value=$2 w
  need_account || return 1
  for w in "$PROJECT" gfg; do
    worker_settled "$w" || return 1
  done
  for w in "$PROJECT" gfg; do
    printf '%s' "$value" | $WRANGLER secret put "$name" --name "$w" || { fail "Couldn't set $name on $w; earlier Workers may already have changed. Run this again after fixing the error."; return 1; }
    say "$w: $name updated and live."
  done
}

# wrangler config (the workflow runs it in the runner's temporary folder): everything is named here. Nothing is changed
# until every Worker named is known to be there (wrangler's secret put makes an empty Worker where there's none of that
# name), and the staging hub alone is never given a new key while the hub at inflite.ai is on (it would turn it off).
give_key() {
  local hubs=${1:-inflite.ai} workers w key rc
  HUB_GAVE=""
  workers=$(hub_workers "$hubs") || { fail "No such choice of hub: \"$hubs\" (inflite.ai, next.inflite.ai or both). Nothing was changed."; return 1; }
  need_account || return 1
  for w in $workers; do
    worker_settled "$w" || return 1
    rc=0; worker_secrets "$w" || rc=$?
    if [ "$rc" = 2 ]; then
      if [ "$w" = "$STAGING" ]; then fail "There's no Worker $STAGING (the staging hub): run \"Put InFlite's staging hub up\" (hub-stage.yml) first, then this again. Nothing was changed."
      else fail "There's no Worker $w on this account. Nothing was changed."; fi
      return 1
    fi
    if [ "$rc" != 0 ]; then fail "Couldn't read the Worker's secrets ($w: $CF_ERR). $(lacks "$WORKER_PERM") Nothing was changed."; return 1; fi
  done
  if [ "$hubs" = next.inflite.ai ]; then
    hub_ask "$SITE"
    if [ "$HUB_READY" = true ]; then fail "The hub at $SITE is on: a new key for the staging hub alone would turn it off. Choose both instead. Nothing was changed."; return 1; fi
  fi
  key=$(openssl rand -hex 32) || { fail "Couldn't make a key. Nothing was changed."; return 1; }
  echo "::add-mask::$key"
  if [ ${#key} -ne 64 ]; then fail "The key made wasn't 64 hex digits. Nothing was changed."; return 1; fi
  site_secret HUB_KEY "$key" || return 1
  gave site
  for w in $workers; do
    if ! printf '%s' "$key" | $WRANGLER secret put HUB_KEY --name "$w"; then
      fail "Couldn't set the Worker's HUB_KEY ($w): wrangler's words above say why. The token likely lacks $WORKER_PERM; or the Worker's latest version isn't the one deployed (a push to another branch of the inflite repo uploads one), and Cloudflare won't change its secrets until its production branch is deployed again (Workers → $w → Deployments; never deploy that other version)."
      return 1
    fi
    gave "$w"
    say "The Worker $w's secret HUB_KEY is the same key (live at once: until the site has it too, that hub isn't ready)."
  done
}


# A hub's /api/hub until it answers {"ready": <want>}. Its yes needs the Worker's key and Chat's host taking it (one
# request from the Worker to chat.'s /_hub/version with the hub's headers); each copy of the Worker keeps a no for a
# hub's (an error page, no answer) is asked again, like a no.
wait_hub() {
  local want=$1 limit=${2:-480} site=${3:-$SITE} start=$SECONDS waited=0 el
  while :; do
    hub_ask "$site"
    el=$((SECONDS - start)); if (( waited > el )); then el=$waited; fi
    if [ "$HUB_READY" = "$want" ]; then say "$site/api/hub says ready: $HUB_READY (after $el s)."; return 0; fi
    # (off is off, too, where the Worker there has no hub at all: an older build's 404)
    if [ "$want" = false ] && [ "$HUB_CODE" = 404 ]; then say "$site/api/hub isn't there (404): the Worker live at $site has no hub, so it's off."; return 0; fi
    if (( el >= limit )); then
      if [ "$HUB_READY" = "?" ]; then fail "$site/api/hub didn't say whether the hub is ready after $limit s (last answer: HTTP $HUB_CODE, $(printf '%.160s' "$HUB_BODY" | tr -d '\r\n')). Is the inflite repo's Today First build live there?"
      else fail "$site/api/hub still says ready: $HUB_READY after $limit s."; fi
      return 1
    fi
    echo "  $el s: ready is $HUB_READY (HTTP $HUB_CODE); asking again in $EVERY s"
    sleep "$EVERY"; waited=$((waited + EVERY))
  done
}

# Each hub HUBS names, until it says it's ready
wait_ready() {
  local sites s rc=0
  sites=$(hub_sites "${1:-inflite.ai}") || { fail "No such choice of hub: \"${1:-}\"."; return 1; }
  for s in $sites; do wait_hub true 480 "$s" || rc=1; done
  return $rc
}

# Chat's hub copy (/_hub/) is only for the hub, with its key (functions/_middleware.js): to anyone else, not found.
# Asked plainly, and with a made-up key and X-Hub-Ok said outright (only the key is believed, never that header).
door_shut() {
  local plain forged i
  for i in 1 2 3; do
    plain=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$CHAT/_hub/version" 2>/dev/null) || plain=000
    forged=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -H "X-Hub-Key: not-the-hub-key" -H "X-Hub-Ok: 1" "$CHAT/_hub/version" 2>/dev/null) || forged=000
    if [ "$plain" = 404 ] && [ "$forged" = 404 ]; then say "$CHAT/_hub/version is 404 without the key (and with a made-up one): the hub's door is shut to everyone else."; return 0; fi
    if [ "$plain" = 200 ] || [ "$forged" = 200 ]; then break; fi
    sleep "$EVERY"
  done
  if [ "$plain" = 200 ] || [ "$forged" = 200 ]; then
    fail "$CHAT/_hub/version answered $plain without the key and $forged with a made-up one: Chat's hub copy is open to anyone. Run \"Turn InFlite's hub off\" now, and check functions/_middleware.js's /_hub/ rule."
  else
    fail "Couldn't confirm $CHAT/_hub/version is shut: $plain without the key, $forged with a made-up one (404 was wanted). Check it by hand: curl -sI $CHAT/_hub/version"
  fi
  return 1
}

# hub-key.yml's last step: what's live now. Reads each step's outcome (OUT_*), the choice of hub (HUBS) and what had
# the new key (HUB_GAVE); fails the run if anything did.
key_verdict() {
  heading "What's live now"
  if [ "${OUT_KEY:-}" != success ]; then
    fail "Key update failed; some Workers may have changed. Check the failed step and run this again."
    return 1
  fi
  if [ "${OUT_WAIT:-}" != success ] || [ "${OUT_DOOR:-}" != success ]; then
    fail "Keys were updated, but the hub readiness or private route check failed. See the checks above."
    return 1
  fi
  say "The selected hubs are ready and Chat's private route is closed to unauthenticated requests."
}

# A Worker's key taken away (hub-off.yml): with no HUB_KEY every hub path answers 503 and /api/hub says it isn't
# ready without asking any app (today/src/hub.js), so Today links to each app's own address at once
take_key_worker() {
  local w=${1:-$WORKER} rc=0
  need_account || return 1
  worker_secrets "$w" || rc=$?
  if [ "$rc" = 2 ]; then say "There's no Worker $w: no key to take away."; return 0; fi
  if [ "$rc" != 0 ]; then fail "Couldn't read the Worker's secrets ($w: $CF_ERR). $(lacks "$WORKER_PERM")"; return 1; fi
  if ! jq -e 'any(.[]?; .name == "HUB_KEY")' <<<"$CF_OUT" >/dev/null; then say "The Worker $w has no HUB_KEY: nothing to take away."; return 0; fi
  if ! $WRANGLER secret delete HUB_KEY --name "$w"; then
    fail "Couldn't delete the Worker's HUB_KEY ($w): wrangler's words above say why. The token likely lacks $WORKER_PERM; or the Worker's latest version isn't the one deployed (a push to another branch of the inflite repo uploads one), and Cloudflare won't change its secrets until its production branch is deployed again."
    return 1
  fi
  say "The Worker $w's HUB_KEY is deleted: its hub is off (each hub path 503, /api/hub not ready)."
}

# Disable explicitly: deleting a secret would restore the encrypted default.
site_off() {
  local push=${1:-0} acts=${2:-0}
  site_secret HUB_KEY '' || return 1
  if [ "$push" = 1 ]; then site_secret HUB_PUSH 0 || return 1; fi
  if [ "$acts" = 1 ]; then site_secret TODAY_ACTS 0 || return 1; fi
}

# d1 SQL → D1_OUT: wrangler d1 execute's answer (one entry per statement), or fails saying what D1 said
d1() {
  if ! D1_OUT=$($WRANGLER d1 execute "$DATABASE" --remote --json --command "$1"); then
    fail "D1 ($DATABASE) refused: $(jq -r '.error.text // .error.message // .error // empty' <<<"$D1_OUT" 2>/dev/null | head -c 300). The token likely lacks $D1_PERM."
    return 1
  fi
}

# The push rows the hub's one device route fanned out (functions/_devices.js, only while HUB_PUSH was "1"), taken back:
# spec §15.4's four statements, on the tables whose via column is there (made as the fan-out is first used: a table
# without it has no row of the hub's). The columns are read with PRAGMA table_info statements, as the site's own code
# reads them (functions/_retention.js, _sessions.js, _busy.js). td_push is Today's own and stays; the apps' own rows are
# never touched.
take_back_pushes() {
  local tables="" t i=0 n sql=""
  d1 'PRAGMA table_info("pg_push"); PRAGMA table_info("mk_push"); PRAGMA table_info("wx_devs")' || return 1
  if ! jq -e 'type == "array" and length == 3' <<<"$D1_OUT" >/dev/null 2>&1; then
    fail "D1's answer to the three tables' columns wasn't what was expected: $(printf '%.200s' "$D1_OUT" | tr -d '\r\n'). Nothing was taken back."
    return 1
  fi
  for t in pg_push mk_push wx_devs; do
    if jq -e --argjson i "$i" 'any(.[$i].results[]?; .name == "via")' <<<"$D1_OUT" >/dev/null; then tables="$tables $t"; fi
    i=$((i + 1))
  done
  [ -n "$tables" ] || { say "No table has the hub's via column: no push row was fanned out, nothing to take back."; return 0; }
  for t in $tables; do
    d1 "SELECT COUNT(*) AS n FROM $t WHERE via = 'hub'" || return 1
    n=$(jq -r '.[0].results[0].n // "?"' <<<"$D1_OUT" 2>/dev/null) || n='?'
    say "$t: $n row(s) the hub fanned out."
    case "$t" in
      wx_devs) sql="$sql DELETE FROM wx_subs WHERE dev IN (SELECT dev FROM wx_devs WHERE via = 'hub'); DELETE FROM wx_devs WHERE via = 'hub';" ;;
      *) sql="$sql DELETE FROM $t WHERE via = 'hub';" ;;
    esac
  done
  d1 "$sql" || return 1
  say "Taken back: $(jq -r '[.[]? | .meta.changes // 0 | tostring] | join(", ")' <<<"$D1_OUT" 2>/dev/null) row(s) by statement ($sql )."
}

# hub-off.yml's last step: what's off now. Reads each step's outcome (OUT_*) and the inputs (PUSHES, ACTS); fails the
# run if anything did.
off_verdict() {
  local bad=0
  heading "What's off now"
  for outcome in "${OUT_WORKER:-}" "${OUT_STAGING:-}" "${OUT_SITE:-}" "${OUT_DOOR:-}"; do
    [ "$outcome" = success ] || bad=1
  done
  if [ "${PUSHES:-0}" = 1 ] && [ "${OUT_D1:-}" != success ]; then bad=1; fi
  if [ "$bad" != 0 ]; then fail "The off switch did not complete every check. See the failed steps; some Workers may already have changed."; return 1; fi
  say "The hub keys are disabled, and Chat's private route is closed to unauthenticated requests."
}

# ---- The staging hub (hub-stage.yml): next.inflite.ai, the Worker inflite-next (spec §15.2; addendum A3) ----

# Preserve the published allowed origins and add both hubs on both site Workers.
stage_origins() {
  local w body list value
  need_account || return 1
  # The home site's related-origins document publishes the shared allowed origins.
  for w in "$PROJECT" gfg; do
    body=$(curl -fsS --max-time 20 "$HOME_SITE/.well-known/webauthn") || { fail "Couldn't read $w's current origins; nothing further changed."; return 1; }
    list=$(jq -er '.origins | if type == "array" then .[] else error("origins missing") end' <<<"$body") || return 1
    value=$( { printf '%s\n' "$list"; printf '%s\n' "$SITE" "$STAGING_SITE"; } | grep -E '^https://' | awk '!seen[$0]++' | paste -sd, -)
    worker_settled "$w" || return 1
    printf '%s' "$value" | $WRANGLER secret put HUB_ORIGINS --name "$w" || return 1
  done
  if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_ORIGINS_DID=set" >> "$GITHUB_ENV"; fi
  say "Both site Workers now allow both hubs, retaining their existing origins."
}

# HUB_PUSH "1" (functions/_devices.js, _todayapp.js): You at a hub that's ready shows Get Every App's Notifications Here,
# and a tap of it adds that phone to every app's table, each row marked via = 'hub' (hub-off.yml's pushes takes them
# back). George's check K1 needs it at the staging hub (spec §15.2, golive.md), so hub-stage.yml sets it only when its
# Nothing is sent anywhere new until someone taps that row.
stage_push() {
  site_secret HUB_PUSH 1
}

# The inflite repo's wrangler.toml, in the folder DIR, read and checked before anything is built or deployed from it.
# wrangler is told to read exactly that file (stage_deploy), and nothing in it may run on the runner or reach past the
# staging Worker:
# - wrangler.json or wrangler.jsonc beside it is refused (wrangler reads either before wrangler.toml; the Worker
#   inflite's build would follow it, the staging one wouldn't), as is a .env of wrangler's (it reads those into its own
#   environment, the token's, where CLOUDFLARE_API_BASE_URL would send the token elsewhere: stage_deploy names no .env,
#   and this says why the ref is refused);
# - no [build] at the top level (a command run as the Worker's built, inherited by [env.next]), and no top-level
#   triggers unless [env.next] has none of its own (a cron for inflite.ai would run on the staging Worker too);
# - [env.next] must be there (wrangler deploys the top-level Worker, inflite, where --env names no environment and none
#   is configured), with only the keys it has now: the staging Worker by name, at next.inflite.ai alone (a custom
#   domain: in a run with no terminal, wrangler moves a hostname that's another Worker's to this one without asking, so
#   inflite.ai there would take the live site), its vars (said), its version metadata and its logs. Anything else (a
#   binding to the site's database, a build of its own) is refused until this file allows it.
stage_config() {
  python3 - "$1" "$STAGING" "$STAGING_HOST" <<'PY'
import os, sys, tomllib
root, want, host = sys.argv[1:4]
def no(why):
    print(why); sys.exit(1)
for f in ("wrangler.json", "wrangler.jsonc"):
    if os.path.lexists(os.path.join(root, f)): no(f"it has a {f}, which wrangler reads before wrangler.toml: only a wrangler.toml is staged")
for f in (".env", ".env.local", ".env.next", ".env.next.local"):
    if os.path.lexists(os.path.join(root, f)): no(f"it has a {f}, which wrangler reads into its own environment (the token's): never staged")
try:
    conf = tomllib.load(open(os.path.join(root, "wrangler.toml"), "rb"))
except FileNotFoundError:
    no("it has no wrangler.toml")
except (tomllib.TOMLDecodeError, UnicodeDecodeError) as e:
    no(f"its wrangler.toml isn't TOML ({e})")
if "build" in conf: no("its wrangler.toml has a [build], a command run as the Worker's built (inherited by [env.next]): never staged")
env = (conf.get("env") or {}).get("next")
if not isinstance(env, dict): no("its wrangler.toml has no [env.next] (wrangler would deploy the live Worker instead)")
allowed = {"name", "workers_dev", "preview_urls", "routes", "vars", "version_metadata", "observability", "triggers"}
extra = sorted(k for k in env if k not in allowed)
if extra: no(f"its [env.next] has {', '.join(extra)}: only {', '.join(sorted(allowed - {'triggers'}))} are staged")
if "triggers" in env and env["triggers"] != {"crons": []}: no("its [env.next] has triggers: the staging Worker runs no cron")
if "triggers" in conf and "triggers" not in env: no("its wrangler.toml has top-level triggers, which [env.next] would inherit (a cron on the staging Worker too): give [env.next] triggers = { crons = [] }")
name = env.get("name")
if name != want: no(f"its [env.next] names the Worker {name!r}, not {want!r}")
routes = env.get("routes")
if not routes or not isinstance(routes, list): no(f"its [env.next] has no routes: {host} wouldn't reach the Worker")
for r in routes:
    pattern = r if isinstance(r, str) else (r or {}).get("pattern", "") if isinstance(r, dict) else ""
    if not isinstance(pattern, str) or pattern.split("/")[0] != host or not (isinstance(r, dict) and r.get("custom_domain") is True):
        no(f"its [env.next] has the route {r!r}: only the custom domain {host} is staged")
v = env.get("vars") or {}
if not isinstance(v, dict): no("its [env.next] vars aren't a table")
print(f"the Worker {name} at {host} (a custom domain); vars: " + (", ".join(f"{k}={v[k]}" for k in sorted(v)) or "none"))
if v.get("TODAY_AS") != "https://inflite.ai":
    print("WARN: TODAY_AS isn't https://inflite.ai, so Today at the staging hub won't speak to the account as inflite.ai")
PY
}

# (one of the inflite repo's refs, from git ls-remote's list: refs/heads/NAME or refs/tags/NAME, exactly)
has_ref() { awk -v r="$1" '$2 == r { f = 1 } END { exit !f }' <<<"$2"; }

# The inflite repo at REF, fetched into the runner's temporary folder: one of its own branches or tags (by default
# claude/inflite, the live branch: under addendum A3 the inflite repo is live before its staging hub), or a whole commit
# id that's on one of them. Never a pull request's ref (pull/…, refs/pull/…), nor a commit on no branch or tag of the
# repo's (GitHub serves a fork's commits by id from the public repo too): only the inflite repo's own work is staged.
# Then only a build with the hub (today/src/hub.js) and a wrangler.toml stage_config passes; Today's build
# (today/public/app.js BUILD) and the commit are left for the later steps (GITHUB_ENV).
stage_clone() {
  local ref=${1:-claude/inflite} dir="${RUNNER_TEMP:?}/inflite" sha build conf refs name full="" what
  if ! [[ $ref =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$ ]] || [[ $ref == *..* ]] || [[ $ref == *.lock ]] || [[ $ref == */ ]]; then
    fail "\"$ref\" isn't a branch, tag or commit id of the inflite repo. Nothing was changed."; return 1
  fi
  if [[ $ref == pull/* ]] || { [[ $ref == refs/* ]] && [[ $ref != refs/heads/* ]] && [[ $ref != refs/tags/* ]]; }; then
    fail "\"$ref\" isn't one of the inflite repo's own branches or tags (a pull request's is never staged). Nothing was changed."; return 1
  fi
  rm -rf "$dir"
  git -c init.defaultBranch=stage init -q "$dir"
  if ! refs=$(git ls-remote --heads --tags "$IFL_GIT"); then fail "Couldn't list the inflite repo's branches and tags ($IFL_GIT). Nothing was changed."; return 1; fi
  name=${ref#refs/heads/}; name=${name#refs/tags/}
  if [[ $ref != refs/tags/* ]] && has_ref "refs/heads/$name" "$refs"; then full=refs/heads/$name; what="branch $name"
  elif [[ $ref != refs/heads/* ]] && has_ref "refs/tags/$name" "$refs"; then full=refs/tags/$name; what="tag $name"
  elif ! [[ $ref =~ ^[0-9a-f]{40}$ ]]; then fail "\"$ref\" isn't a branch or tag of the inflite repo, nor a whole commit id. Nothing was changed."; return 1
  fi
  if [ -n "$full" ]; then
    if ! git -C "$dir" fetch -q --no-tags --depth 1 "$IFL_GIT" "$full"; then fail "Couldn't fetch the inflite repo's $what. Nothing was changed."; return 1; fi
    git -C "$dir" checkout -q --detach FETCH_HEAD
  else
    # (a commit: staged only if it's on one of the repo's own branches or tags, whose history is fetched to see)
    what="commit ${ref:0:7}"
    if ! git -C "$dir" fetch -q --no-tags "$IFL_GIT" '+refs/heads/*:refs/ifl/heads/*' '+refs/tags/*:refs/ifl/tags/*'; then fail "Couldn't fetch the inflite repo's branches and tags, to find $what on one. Nothing was changed."; return 1; fi
    if ! git -C "$dir" cat-file -e "$ref^{commit}" 2>/dev/null || [ -z "$(git -C "$dir" for-each-ref --count=1 --contains "$ref" refs/ifl)" ]; then
      fail "The inflite repo has no branch or tag with $what on it (a pull request's or a fork's commit is never staged). Nothing was changed."; return 1
    fi
    git -C "$dir" checkout -q --detach "$ref"
  fi
  sha=$(git -C "$dir" rev-parse HEAD)
  if [ ! -f "$dir/today/src/hub.js" ]; then fail "The inflite repo's $what (${sha:0:7}) is from before Today First (no today/src/hub.js): it has no hub to stage. Nothing was changed."; return 1; fi
  build=$(sed -n 's/^const BUILD = "\([0-9][0-9.]*\)".*/\1/p' "$dir/today/public/app.js" 2>/dev/null | head -1)
  if [ -z "$build" ]; then fail "The inflite repo's $what (${sha:0:7}) has no Today build (const BUILD in today/public/app.js). Nothing was changed."; return 1; fi
  if ! conf=$(stage_config "$dir"); then fail "The inflite repo's $what (${sha:0:7}) can't be staged: $conf. Nothing was changed."; return 1; fi
  if [ -n "${GITHUB_ENV:-}" ]; then printf 'HUB_STAGE_REF=%s\nHUB_STAGE_SHA=%s\nHUB_STAGE_BUILD=%s\n' "$ref" "$sha" "$build" >> "$GITHUB_ENV"; fi
  say "The inflite repo's $what: commit ${sha:0:7}, Today $build; its [env.next] is ${conf%%$'\n'*}."
  if [[ $conf == *$'\n'WARN:* ]]; then echo "::warning::${conf#*$'\n'WARN: }"; say "Note: ${conf#*$'\n'WARN: }."; fi
}

# That build deployed to the staging Worker: wrangler deploy --env next, which [env.next] (checked again here) makes the
# Worker inflite-next at next.inflite.ai, its custom domain. wrangler is told exactly what to read: the folder's
# wrangler.toml (--config: never a wrangler.json(c) nor a deploy redirect in .wrangler/), and no .env (--env-file
# /dev/null); and npx is run from the runner's temporary folder, so no .npmrc of the ref's chooses where wrangler
# comes from. A dry run first, so a build that doesn't bundle changes nothing. The Worker's secrets (its HUB_KEY, once
# hub-key.yml has given it one) stay as they are across a deploy.
stage_deploy() {
  local dir="${RUNNER_TEMP:?}/inflite" conf log out wr
  need_account || return 1
  if ! conf=$(stage_config "$dir"); then fail "The inflite repo's folder can't be staged: $conf. Nothing was changed."; return 1; fi
  wr=(deploy --cwd "$dir" --config "$dir/wrangler.toml" --env-file /dev/null --env next)
  cd "$RUNNER_TEMP" || { fail "No runner's temporary folder to run wrangler from. Nothing was changed."; return 1; }
  log=$(mktemp); out=$(mktemp -d)
  if ! $WRANGLER "${wr[@]}" --dry-run --outdir "$out" > "$log" 2>&1; then
    cat "$log"; rm -f "$log"
    fail "The inflite repo's Worker doesn't build (wrangler deploy --env next --dry-run): wrangler's words above say why. Nothing was changed."
    return 1
  fi
  if ! $WRANGLER "${wr[@]}" 2>&1 | tee "$log"; then
    if grep -q "Custom domains:" "$log"; then
      fail "The Worker $STAGING is uploaded, but its custom domain $STAGING_HOST wasn't attached (wrangler's words above), so nothing answers there yet. A custom domain is its zone's: the token likely lacks $DOMAIN_PERM, beside $WORKER_PERM. Add them (My Profile → API Tokens → the token → Edit) and run this again."
    elif grep -qiE "Authentication error|code: 10000|code: 9109" "$log"; then
      fail "Couldn't deploy the Worker $STAGING: Cloudflare refused the token (wrangler's words above). It likely lacks $WORKER_PERM (and, for the custom domain $STAGING_HOST, $DOMAIN_PERM)."
    else
      fail "Couldn't deploy the Worker $STAGING: wrangler's words above say why. If they don't, check the token has $WORKER_PERM and $DOMAIN_PERM."
    fi
    rm -f "$log"; return 1
  fi
  rm -f "$log"
  say "Deployed to the staging Worker $STAGING at $STAGING_SITE: the inflite repo at ${HUB_STAGE_REF:-?} (commit ${HUB_STAGE_SHA:0:7}, Today ${HUB_STAGE_BUILD:-?}). The Worker $WORKER isn't touched."
}

# next.inflite.ai/version asked until it says the build just deployed (a new custom domain's certificate can take some
# minutes, and each answer before it may be an error page or nothing), then its /api/hub: {"ready": false} until
# hub-key.yml gives the staging hub its key; an answer that isn't the hub's is asked again, a while.
stage_check() {
  local want=${HUB_STAGE_BUILD:-} limit=${1:-600} start=$SECONDS waited=0 el body code build=""
  if [ -z "$want" ]; then fail "No Today build to look for (the fetch step leaves it): nothing to check."; return 1; fi
  while :; do
    body=$(curl -sS --max-time 20 -A "InFlite hub check (GitHub Actions)" -w '\n%{http_code}' "$STAGING_SITE/version" 2>/dev/null) || body=$'\n000'
    code=${body##*$'\n'}; body=${body%$'\n'*}
    build=$(jq -r 'if type == "object" then (.build // "" | tostring) else "" end' <<<"$body" 2>/dev/null) || build=""
    el=$((SECONDS - start)); if (( waited > el )); then el=$waited; fi
    if [ "$code" = 200 ] && [ "$build" = "$want" ]; then say "$STAGING_SITE/version says build $build (after $el s): Today $want is live at the staging hub."; break; fi
    if (( el >= limit )); then
      fail "$STAGING_SITE/version didn't say build $want in $limit s (last answer: HTTP $code, build ${build:-none}). A new custom domain can take a while for its certificate: check Workers → $STAGING → Settings → Domains & Routes, then curl -s $STAGING_SITE/version."
      return 1
    fi
    echo "  $el s: HTTP $code, build ${build:-none}; asking again in $EVERY s"
    sleep "$EVERY"; waited=$((waited + EVERY))
  done
  start=$SECONDS; waited=0
  while :; do
    hub_ask "$STAGING_SITE"
    el=$((SECONDS - start)); if (( waited > el )); then el=$waited; fi
    case "$HUB_READY" in
      false|true) break ;;
    esac
    if (( el >= 120 )); then fail "$STAGING_SITE/api/hub didn't answer as the hub (last answer: HTTP $HUB_CODE, $(printf '%.160s' "$HUB_BODY" | tr -d '\r\n'))."; return 1; fi
    sleep "$EVERY"; waited=$((waited + EVERY))
  done
  if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_STAGE_READY=$HUB_READY" >> "$GITHUB_ENV"; fi
  if [ "$HUB_READY" = false ]; then say "$STAGING_SITE/api/hub says ready: false, as it should until the staging hub has its key."
  else say "$STAGING_SITE/api/hub says ready: true: the staging Worker already has a key the site Workers accept (from an earlier \"Give InFlite's hub its key\")."; fi
  live_said
}

# (what the live site says, for the record only: never fails a step. Under addendum A3 the inflite repo's Today First
# build is live at inflite.ai before its hub has a key, so Today there links to each app's own address)
live_said() {
  local body build
  body=$(curl -sS --max-time 20 -A "InFlite hub check (GitHub Actions)" "$SITE/version" 2>/dev/null) || body=""
  build=$(jq -r 'if type == "object" then (.build // "" | tostring) else "" end' <<<"$body" 2>/dev/null) || build=""
  hub_ask "$SITE"
  case "$HUB_READY" in
    false) say "For the record, $SITE (not changed here): Today ${build:-?}, its hub off (ready: false), so Today there links to each app's own address." ;;
    true) say "For the record, $SITE (not changed here): Today ${build:-?}, its hub on (ready: true)." ;;
    *) if [ "$HUB_CODE" = 404 ]; then say "For the record, $SITE (not changed here): Today ${build:-?}, with no hub (/api/hub 404): the inflite repo's Today First build isn't live there yet."
       else say "For the record, $SITE (not changed here): Today ${build:-?}; /api/hub answered HTTP $HUB_CODE."; fi ;;
  esac
  return 0
}

# hub-stage.yml's last step: what's live now. Reads each step's outcome (OUT_*), the input HUB_PUSH_ON and what the
# steps left (HUB_ORIGINS_DID, HUB_STAGE_*); fails the run unless every step that should have run did, and succeeded (a
# step stopped part way, by hub-off.yml taking over or by hand, is "cancelled"; one never reached, "skipped").
stage_verdict() {
  local bad=0
  heading "What's live now"
  if [ "${OUT_ACCOUNT:-}" != success ]; then
    say "Nothing was changed (the step that failed says why). The Worker $WORKER and the site Workers’ HUB_KEY are never touched by this workflow."
    return 1
  fi
  case "${OUT_ORIGINS:-}" in
    success)
      if [ "${HUB_ORIGINS_DID:-}" = set ]; then say "The site Workers’ HUB_ORIGINS lists $SITE and $STAGING_SITE now; it is live immediately."
      else say "The site Workers’ HUB_ORIGINS already listed $SITE and $STAGING_SITE: unchanged."; fi ;;
    *) bad=1; say "The site Workers’ HUB_ORIGINS wasn't checked or set (the step says why). Until it lists $STAGING_SITE, Chat at the staging hub is refused. By hand: printf '%s' '$SITE,$STAGING_SITE' | npx wrangler secret put HUB_ORIGINS --name $PROJECT" ;;
  esac
  if [ "${HUB_PUSH_ON:-false}" = true ]; then
    case "${OUT_PUSH:-}" in
      success) say "The site Workers’ HUB_PUSH is \"1\"; it is live immediately." ;;
      *) bad=1; say "The site Workers’ HUB_PUSH wasn't set (the step says why). By hand, with no token: the Cloudflare dashboard → Workers → $PROJECT → Settings → Variables and Secrets → Production → Add, type Secret, HUB_PUSH, value 1; or run this again with hub_push." ;;
    esac
  fi
  case "${OUT_CLONE:-}" in
    success) ;;
    *) bad=1; say "Nothing was deployed: the inflite repo at ${HUB_STAGE_REF:-${IFL_REF:-?}} couldn't be fetched, or can't be staged (the fetch step says why). $STAGING_SITE is as it was." ;;
  esac
  case "${OUT_DEPLOY:-}" in
    success) say "The staging Worker $STAGING runs the inflite repo at ${HUB_STAGE_REF:-?} (commit ${HUB_STAGE_SHA:0:7}, Today ${HUB_STAGE_BUILD:-?}) at $STAGING_SITE." ;;
    failure) bad=1; say "The staging Worker $STAGING wasn't deployed, or its custom domain $STAGING_HOST wasn't attached (the deploy step says which, and what the token lacks)." ;;
    skipped|"") if [ "${OUT_CLONE:-}" = success ]; then bad=1; say "The deploy never ran (the run was stopped before it): $STAGING_SITE is as it was. Run this again."; fi ;;
    *) bad=1; say "The deploy was stopped part way (${OUT_DEPLOY}): the staging Worker $STAGING may or may not run the new build. Run this again." ;;
  esac
  case "${OUT_CHECK:-}" in
    success)
      if [ "${HUB_STAGE_READY:-}" = true ]; then say "$STAGING_SITE answers with Today ${HUB_STAGE_BUILD:-?}, and its hub is ready already: the staging hub had its key from before."
      else say "$STAGING_SITE answers with Today ${HUB_STAGE_BUILD:-?}; its hub isn't ready (no key yet), so Today there links to each app's own address."; fi ;;
    failure) bad=1; say "$STAGING_SITE didn't answer as it should (the check step says what came back)." ;;
    skipped|"") if [ "${OUT_DEPLOY:-}" = success ]; then bad=1; say "$STAGING_SITE wasn't checked (the run was stopped before it). Run this again, or check by hand: curl -s $STAGING_SITE/version"; fi ;;
    *) bad=1; say "The check of $STAGING_SITE was stopped part way (${OUT_CHECK}). Run this again, or check by hand: curl -s $STAGING_SITE/version" ;;
  esac
  say "The Worker $WORKER (inflite.ai) and the site Workers’ HUB_KEY weren't touched: this workflow never changes them."
  if [ "$bad" = 0 ] && [ "${HUB_STAGE_READY:-}" != true ]; then say "Next: \"Give InFlite's hub its key\" (hub-key.yml) with hub next.inflite.ai, which gives the staging hub its key and updates the Workers."; fi
  if [ "$bad" != 0 ]; then say "Don't go on to \"Give InFlite's hub its key\" until this run is green: fix what's said above and run this again."; fi
  return $bad
}

# ---- One roof's switches (roof.yml; stage 1, spec §8.5, §11.2; stages 2–4, roof/s24-contracts.md §12) ----
# One switch per module on the hub's Workers, and ROOF_OFF over them all. A Worker secret's change makes a new version of
# the code that's deployed and deploys it: seconds, no build. Cloudflare makes it only while the Worker's newest version is
# the deployed one (a push to another branch of the inflite repo uploads a newer one that isn't); so that's checked first,
# and where it isn't so, nothing is changed and the words say what to do. Never `wrangler versions secret put`: that
# builds on the newest version, which may be another branch's.
#   app all (stage 1's): ROOF_OFF "1" put (off: every module off) or deleted (on)
#   app weather: ROOF_OFF_WEATHER "1" (off) or "0" (on)
#   app markets | fitness | mail | chats (stage 3): ROOF_<APP> "1" (on) or "0" (off): opt-in, so a Worker without it is off;
#     on refused while ROOF_OFF is set (every module off: turn them all on first). For mail, Mail's own Worker
#     (inflite-email) first, both ways: HUB_API (inflite.ai) or HUB_API_NEXT (next.inflite.ai) "1" or "0".
MAIL_WORKER=inflite-email
MAIL_SITE=https://email.inflite.ai
ROOF_APPS="weather markets fitness mail chats"

# (rollback level 2's words, for when the switch can't be used)
ROOF_LEVEL2="rollback level 2: revert the One roof merge on the inflite repo's claude/inflite and dist7t and push (Workers Builds deploys the Today before it in minutes; golive.md)"

# (each module's name, and what it is with its switch off and on, for the words)
roof_name() { case "$1" in all) echo "Every module" ;; weather) echo Weather ;; markets) echo Markets ;; fitness) echo Fitness ;; mail) echo Mail ;; chats) echo Chats ;; *) echo "$1" ;; esac; }
roof_off_words() { case "$1" in all) echo "every module is the hub's milestone-1 page again (Weather at /weather/, and the others), its files not found" ;; mail) echo "Mail is back to its framed page at /mail/, its module's files not found" ;; *) echo "$(roof_name "$1") is back to its own page at /$1/, its module's files not found" ;; esac; }
roof_on_words() { case "$1" in all) echo "each module as its own switch says (Weather in InFlite's one page)" ;; *) echo "$(roof_name "$1") opens in InFlite's one page at /$1/" ;; esac; }

# roof_secret APP STATE → "NAME VALUE" on stdout, VALUE "-" for a delete: the one table of the switches' names (§12)
roof_secret() {
  local app=${1:-} state=${2:-}
  case "$state" in off|on) ;; *) fail "No such state: \"$state\" (off or on). Nothing was changed."; return 1 ;; esac
  case "$app" in
    all) [ "$state" = off ] && echo "ROOF_OFF 1" || echo "ROOF_OFF -" ;;
    weather) [ "$state" = off ] && echo "ROOF_OFF_WEATHER 1" || echo "ROOF_OFF_WEATHER 0" ;;
    markets|fitness|mail|chats) echo "ROOF_$(tr '[:lower:]' '[:upper:]' <<<"$app") $([ "$state" = on ] && echo 1 || echo 0)" ;;
    *) fail "No such module: \"$app\" (all, $ROOF_APPS). Nothing was changed."; return 1 ;;
  esac
}
# mail_gate W → the name of Mail's own switch on inflite-email for that hub's Worker: HUB_API (inflite.ai), HUB_API_NEXT
mail_gate() { case "$1" in "$WORKER") echo HUB_API ;; "$STAGING") echo HUB_API_NEXT ;; *) fail "No hub Worker \"$1\" for Mail's switch. Nothing was changed."; return 1 ;; esac; }

# worker_settled W → 0 when the Worker's newest uploaded version is the one its active deployment serves, alone (all of
# its traffic); else fails with what to do, having changed nothing. W: a hub's Worker, or Mail's (inflite-email)
worker_settled() {
  local w=${1:-$WORKER} deployed newest dep
  case "$w" in "$WORKER"|"$STAGING"|"$MAIL_WORKER"|"$PROJECT"|gfg) ;; *) fail "No such Worker of the hub's: \"$w\" ($WORKER, $STAGING or $MAIL_WORKER). Nothing was changed."; return 1 ;; esac
  need_account || return 1
  if ! cf GET "/accounts/$ACCOUNT/workers/scripts/$w/deployments"; then
    if [ "$CF_CODE" = 404 ]; then fail "There's no Worker $w on this account$([ "$w" = "$STAGING" ] && echo " (the staging hub: run \"Put InFlite's staging hub up\" first, or choose inflite.ai)"). Nothing was changed."
    else fail "Couldn't read the Worker's deployments ($w: $CF_ERR). $(lacks "$WORKER_PERM") Nothing was changed."; fi
    return 1
  fi
  dep=$(jq -c '(.deployments // [])[0] // empty' <<<"$CF_OUT")
  [ -n "$dep" ] || { fail "The Worker $w has no deployment. Nothing was changed."; return 1; }
  deployed=$(jq -r 'if ((.versions // []) | length) == 1 and (.versions[0].percentage // 0) == 100 then .versions[0].version_id else "" end' <<<"$dep")
  if [ -z "$deployed" ]; then
    fail "The Worker $w is part way through a gradual deployment (two versions sharing its traffic): Cloudflare won't change this Worker's secrets until one version has all of it (Workers → $w → Deployments). Or use $ROOF_LEVEL2. Nothing was changed."
    return 1
  fi
  if ! cf GET "/accounts/$ACCOUNT/workers/scripts/$w/versions"; then
    fail "Couldn't read the Worker's versions ($w: $CF_ERR). $(lacks "$WORKER_PERM") Nothing was changed."; return 1
  fi
  newest=$(jq -r '(.items // []) | max_by(.number // 0) | .id // empty' <<<"$CF_OUT")
  [ -n "$newest" ] || { fail "The Worker $w has no versions listed. Nothing was changed."; return 1; }
  if [ "$newest" != "$deployed" ]; then
    fail "The Worker $w's newest version (${newest:0:8}) isn't the one deployed (${deployed:0:8}): a push to another branch of the inflite repo uploads one, and Cloudflare won't change this Worker's secrets until its production branch is deployed again (Workers → $w → Deployments; never deploy that other version). Or use $ROOF_LEVEL2. Nothing was changed."
    return 1
  fi
  say "The Worker $w is settled: its newest version (${newest:0:8}) is the one deployed."
}

# roof_refused APP STATE W → fails (with the words) when an app's on (Weather's too) is asked while every module is off on
# that Worker (ROOF_OFF set: its name is in the Worker's secrets; only ever put as "1"). Reads names only, never a value.
roof_refused() {
  local app=${1:-} state=${2:-} w=${3:-} rc=0
  [ "$app" != all ] && [ "$state" = on ] || return 0
  worker_secrets "$w" || rc=$?
  if [ "$rc" != 0 ]; then fail "Couldn't read the Worker's secrets ($w: $CF_ERR). $(lacks "$WORKER_PERM") Nothing was changed."; return 1; fi
  if jq -e 'any(.[]?; .name == "ROOF_OFF")' <<<"$CF_OUT" >/dev/null; then
    fail "Every module is off (ROOF_OFF). Turn them all on first. ($w: nothing was changed.)"; return 1
  fi
  return 0
}

# roof_set W NAME VALUE → the Worker's secret NAME put as VALUE ("1", "0"), or deleted for "-" (where it's there at all).
# After worker_settled. (Stage 1's form, roof_set W off|on, is ROOF_OFF's.)
roof_set() {
  local w=${1:-} name=${2:-} value=${3:-} rc=0 site
  case "$name" in off|on) [ -z "$value" ] && { set -- "$w" $(roof_secret all "$name") || return 1; name=$2; value=$3; } ;; esac
  case "$name" in ROOF_OFF|ROOF_OFF_WEATHER|ROOF_MARKETS|ROOF_FITNESS|ROOF_MAIL|ROOF_CHATS|HUB_API|HUB_API_NEXT) ;; *) fail "No such switch: \"$name\". Nothing was changed."; return 1 ;; esac
  case "$value" in 1|0|-) ;; *) fail "No such value for $name: \"$value\" (1, 0, or - to delete). Nothing was changed."; return 1 ;; esac
  case "$w" in "$WORKER") site=$SITE ;; "$STAGING") site=$STAGING_SITE ;; "$MAIL_WORKER") site=$MAIL_SITE ;; *) fail "No such Worker of the hub's: \"$w\" ($WORKER, $STAGING or $MAIL_WORKER). Nothing was changed."; return 1 ;; esac
  worker_settled "$w" || return 1
  if [ "$value" != "-" ]; then
    if ! printf '%s' "$value" | $WRANGLER secret put "$name" --name "$w"; then
      fail "Couldn't set the Worker's $name ($w): wrangler's words above say why. The token likely lacks $WORKER_PERM. Or use $ROOF_LEVEL2."
      return 1
    fi
    say "The Worker $w's secret $name is \"$value\" (live at once, $site)."
  else
    worker_secrets "$w" || rc=$?
    if [ "$rc" != 0 ]; then fail "Couldn't read the Worker's secrets ($w: $CF_ERR). $(lacks "$WORKER_PERM") Nothing was changed."; return 1; fi
    if ! jq -e --arg n "$name" 'any(.[]?; .name == $n)' <<<"$CF_OUT" >/dev/null; then say "The Worker $w has no $name: $([ "$name" = ROOF_OFF ] && echo "the roof is on there already" || echo "nothing to delete")."; return 0; fi
    # (no prompt where nothing can answer one: wrangler asks only in a terminal, and has no --force for this)
    if ! $WRANGLER secret delete "$name" --name "$w" </dev/null; then
      fail "Couldn't delete the Worker's $name ($w): wrangler's words above say why. The token likely lacks $WORKER_PERM."
      return 1
    fi
    say "The Worker $w's $name is deleted (live at once, $site)."
  fi
}

# roof_now SITE APP → ROOF_SAID: what the hub's /api/hub says of that app now: true, false, none (a Worker from before
# the roof, or before stages 2–4 for an app it doesn't name: off) or ? (no answer worth reading); ROOF_CODE, ROOF_BODY.
# For all: true when roof or any module in apps is (ROOF_OFF gone: Weather may be off by its own switch), false when roof
# and every module in apps are off; ROOF_STILL_OFF: the modules apps says are off (by their own switches, once true).
roof_now() {
  local site=$1 app=$2 body
  body=$(curl -sS --max-time 20 -A "InFlite hub check (GitHub Actions)" -w '\n%{http_code}' "$site/api/hub" 2>/dev/null) || body=$'\n000'
  ROOF_CODE=${body##*$'\n'}; ROOF_BODY=${body%$'\n'*}
  ROOF_SAID=$(jq -r --arg a "$app" '
    if type != "object" then "?"
    elif $a == "all" then (if has("roof") then (if .roof == true or ((.apps // {}) | any(. == true)) then "true" elif .roof == false and ((.apps // {}) | all(. == false)) then "false" else "?" end) elif has("ready") then "none" else "?" end)
    elif $a == "weather" then (if (.apps // {}) | has("weather") then (.apps.weather | tostring) elif has("roof") then (.roof | tostring) elif has("ready") then "none" else "?" end)
    else (if (.apps // {}) | has($a) then (.apps[$a] | tostring) elif has("ready") then "none" else "?" end) end' <<<"$ROOF_BODY" 2>/dev/null) || ROOF_SAID='?'
  ROOF_SAID=${ROOF_SAID:-?}
  ROOF_STILL_OFF=$(jq -r 'if type == "object" then [(.apps // {}) | to_entries[] | select(.value == false) | .key] | join(" ") else "" end' <<<"$ROOF_BODY" 2>/dev/null) || ROOF_STILL_OFF=""
  if [ "$ROOF_CODE" = 404 ]; then ROOF_SAID=none; fi
  return 0
}

# mail_now SITE WANT → 0 when Mail's own Worker says the same for that hub: a preflight from the hub's origin answered
# with its Access-Control-Allow-Origin (on) or without (off); on, /body/ 200 as well (off, it may still answer the other
# hub, whose switch is its own)
mail_now() {
  local site=$1 want=$2 acao body
  acao=$(curl -sS --max-time 20 -o /dev/null -X OPTIONS -H "Origin: $site" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,x-inflite" -w '%header{access-control-allow-origin}' "$MAIL_SITE/api/session" 2>/dev/null) || acao=""
  body=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$MAIL_SITE/body/" 2>/dev/null) || body=000
  if [ "$want" = true ]; then [ "$acao" = "$site" ] && [ "$body" = 200 ]; else [ -z "$acao" ]; fi
}

# wait_roof SITE [APP] true|false [seconds] → the hub's /api/hub asked until it says so of that app (stage 1's form,
# wait_roof SITE true|false [seconds], is all's). A Worker from before (none) is off, never on. For mail, Mail's own
# Worker is asked too (mail_now).
wait_roof() {
  local site=${1:-$SITE} app=all want limit start=$SECONDS waited=0 el mailok
  case "${2:-}" in true|false) want=$2; limit=${3:-120} ;; *) app=${2:-all}; want=${3:-true}; limit=${4:-120} ;; esac
  while :; do
    roof_now "$site" "$app"
    mailok=yes; if [ "$app" = mail ] && ! mail_now "$site" "$want"; then mailok=no; fi
    el=$((SECONDS - start)); if (( waited > el )); then el=$waited; fi
    if { [ "$ROOF_SAID" = "$want" ] || { [ "$want" = false ] && [ "$ROOF_SAID" = none ]; }; } && [ "$mailok" = yes ]; then
      if [ "$ROOF_SAID" = none ] && [ "$app" = all ]; then say "$site/api/hub has no roof (a Worker from before it): Weather there is milestone 1's page, so the roof is off (after $el s)."
      elif [ "$ROOF_SAID" = none ]; then say "$site/api/hub has no switch for $(roof_name "$app") (a Worker from before it): there it's the hub's page, so off (after $el s)."
      elif [ "$app" = all ]; then
        local still="" a; for a in $ROOF_STILL_OFF; do still="$still${still:+, }$(roof_name "$a")"; done
        say "$site/api/hub says roof: $ROOF_SAID (after $el s).$([ "$want" = true ] && [ -n "$still" ] && echo " Off by their own switches still: $still.")"
      else say "$site/api/hub says $app: $ROOF_SAID$([ "$app" = mail ] && echo ", and Mail's own Worker agrees") (after $el s)."; fi
      return 0
    fi
    if (( el >= limit )); then
      fail "$site/api/hub still says $([ "$app" = all ] && echo roof || echo "$app"): $ROOF_SAID$([ "$mailok" = no ] && echo " (Mail's own Worker doesn't agree yet)") after $limit s (last answer: HTTP $ROOF_CODE, $(printf '%.160s' "$ROOF_BODY" | tr -d '\r\n')). Each copy of the Worker takes a secret's change within seconds; check by hand: curl -s $site/api/hub$([ "$app" = all ] && [ "$want" = true ] && echo " (every module off there by its own switch, ROOF_OFF_WEATHER and ROOF_<APP>, reads the same as ROOF_OFF: see the Worker's secrets)")"
      return 1
    fi
    echo "  $el s: $([ "$app" = all ] && echo roof || echo "$app") is $ROOF_SAID (HTTP $ROOF_CODE); asking again in $EVERY s"
    sleep "$EVERY"; waited=$((waited + EVERY))
  done
}

# roof.yml's last step: what's live now. Reads each step's outcome (OUT_*), the inputs (ROOF_APP, ROOF_STATE,
# ROOF_WHERE); fails the run if anything did, naming rollback level 2 where the switch was refused.
roof_verdict() {
  local app=${ROOF_APP:-all} state=${ROOF_STATE:-?} where=${ROOF_WHERE:-both} sites workers bad=0 what name pair
  sites=$(hub_sites "$where" 2>/dev/null) || sites=$SITE
  workers=$(hub_workers "$where" 2>/dev/null) || workers=$WORKER
  pair=$(roof_secret "$app" "$state" 2>/dev/null) || pair="ROOF_OFF ?"
  name=${pair% *}
  what=$([ "$state" = off ] && roof_off_words "$app" || roof_on_words "$app")
  heading "What's live now"
  if [ "$app" = all ]; then say "Asked: the roof $state at $where, by ${GITHUB_ACTOR:-someone} at $(date -u '+%Y-%m-%d %H:%M UTC')."
  else say "Asked: $(roof_name "$app") $state at $where, by ${GITHUB_ACTOR:-someone} at $(date -u '+%Y-%m-%d %H:%M UTC')."; fi
  if [ "${OUT_ACCOUNT:-}" != success ]; then
    say "Nothing was changed: $([ "$app" = all ] && echo "the roof is" || echo "$(roof_name "$app") is") as it was (the step that failed says why)."; return 1
  fi
  case "${OUT_SETTLED:-}" in
    success) ;;
    *) if [ "$where" = both ] && [ "${ROOF_UNSETTLED:-}" = "$STAGING" ]; then
         say "Refused, nothing changed: the live Worker $WORKER is settled, only the staging Worker $STAGING isn't (the step says why). To switch the live hub now, run this again with where: inflite.ai (seconds); next.inflite.ai can follow once $STAGING's production branch is deployed again."
       else
         say "Refused, nothing changed: not every Worker (${ROOF_UNSETTLED:-$workers}) is settled (its newest version isn't the one deployed, or it couldn't be read; the step says which). Deploy its production branch again and run this again, or use $ROOF_LEVEL2."
       fi
       return 1 ;;
  esac
  case "${OUT_ALLOWED:-success}" in
    success) ;;
    *) say "Refused, nothing changed: every module is off (ROOF_OFF) on $workers. Turn them all on first (this with app all, state on), then $(roof_name "$app")."; return 1 ;;
  esac
  case "${OUT_SET:-}" in
    success)
      if [ "${OUT_WAIT:-}" = success ]; then
        if [ "$app" = all ]; then say "The roof is $state at $sites: $what."; else say "$(roof_name "$app") is $state at $sites: $what."; fi
      else bad=1; say "$name is $([ "$app" = all ] && [ "$state" = on ] && echo deleted || echo set) on $workers$([ "$app" = mail ] && echo " (and Mail's own switch on $MAIL_WORKER)"), but not every hub said so in time (the wait step says which): check by hand, curl -s <site>/api/hub."; fi ;;
    *) bad=1; say "$name wasn't changed on every Worker (the step says which; one before it may have been). Run this again once the cause is fixed, or use $ROOF_LEVEL2." ;;
  esac
  if [ "$bad" = 0 ]; then
    if [ "$state" = off ]; then say "Pages open at $([ "$app" = all ] && echo "a module" || roof_name "$app") learn it the next time they come back in sight (within five minutes) and go to its own page once nothing is unsaved. To undo: this again with state on."
    else say "Pages open learn it the next time they come back in sight (within five minutes). To turn it off again: this with state off."; fi
  fi
  return $bad
}
