# InFlite's hub, from GitHub Actions: what .github/workflows/hub-key.yml, hub-off.yml and hub-stage.yml do, one step at a
# time (Today First, spec §15.4). Each step is a shell of its own (bash -eo pipefail) that sources this file and calls one
# of these:
#   cf_account          → the Cloudflare account: CLOUDFLARE_ACCOUNT_ID, or else the one account the token can see;
#                         left for the steps after it as HUB_ACCOUNT (GITHUB_ENV), which this file reads when sourced
#   give_key HUBS       → a new key, made here: the Pages project's production HUB_KEY first, and only once that's set,
#                         each Worker HUBS names (inflite.ai: inflite; next.inflite.ai: the staging inflite-next; both)
#   pages_redeploy      → the production deployment that's live, built again: a Pages secret or var reaches only the
#                         deployments made after it's set
#   wait_ready HUBS     → each hub's /api/hub asked until it says it's ready
#   door_shut           → chat.inflite.ai/_hub/version is 404 to anyone without the key, a made-up one included
#   key_verdict         → hub-key.yml's last step: what's live now, from each step's outcome
#   take_key_worker [W] → a Worker's HUB_KEY deleted (inflite's: the hub at once not ready, Today links to each app's
#                         own address)
#   pages_off PUSH ACTS → the Pages project's HUB_KEY deleted (PUSH=1: its HUB_PUSH too; ACTS=1: TODAY_ACTS set to "0")
#   wait_hub true|false [seconds] [site] → a hub's /api/hub asked until it says so
#   take_back_pushes    → the push rows the hub fanned out, deleted from D1 (via = 'hub'; spec §15.4's four statements)
#   off_verdict         → hub-off.yml's last step
#   stage_origins       → the Pages project's HUB_ORIGINS lists both hubs (inflite.ai and next.inflite.ai): set as a
#                         production secret only where it isn't set or lacks one of them
#   stage_clone REF     → the inflite repo at REF, fetched into the runner's temporary folder; its [env.next] checked
#                         (the staging Worker, at next.inflite.ai alone) and its Today's build read
#   stage_deploy        → that build deployed to the staging Worker (inflite-next), from its folder; never inflite
#   stage_check         → next.inflite.ai/version says that build, and its /api/hub answers as the hub; and, for the
#                         record only, what inflite.ai says (its Today, its hub on or off: live_said)
#   stage_verdict       → hub-stage.yml's last step
# Cloudflare's API is asked with CLOUDFLARE_API_TOKEN, which never goes on a command line (curl reads its header from a
# pipe) nor into the log; a key made here is masked before anything else and only ever piped to wrangler. What's
# printed of an answer from Cloudflare is its error codes and messages, never the request.

PROJECT=georgefarrowgreen      # the Pages project (this repo's wrangler.toml name)
WORKER=inflite                 # the Worker at inflite.ai (the inflite repo's wrangler.toml name)
STAGING=inflite-next           # the staging hub at next.inflite.ai (the inflite repo's [env.next], deployed by hand)
DATABASE=bio-db                # the D1 database (this repo's wrangler.toml, binding DB)
SITE=https://inflite.ai
STAGING_SITE=https://next.inflite.ai
STAGING_HOST=next.inflite.ai   # the staging Worker's one custom domain (the inflite repo's [env.next] routes)
CHAT=https://chat.inflite.ai
HOME_SITE=https://georgefarrowgreen.com   # where the passkeys' list of origins is (/.well-known/webauthn): the hubs' too
IFL_GIT=https://github.com/georgefarrowgreen1/inflite.git   # the inflite repo (public)
CF_API=https://api.cloudflare.com/client/v4
WRANGLER="npx --yes wrangler@4.149.0"
EVERY=${EVERY:-15}             # seconds between one check and the next
PAGES_WAIT=${PAGES_WAIT:-600}  # seconds to wait for a production deployment (one under way; then ours)
PAGES_PERM="Account › Cloudflare Pages › Edit"
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
      0) fail "The token can't see any Cloudflare account: give it $PAGES_PERM and $WORKER_PERM on the account, or set CLOUDFLARE_ACCOUNT_ID."; return 1 ;;
      *) fail "The token can see $n Cloudflare accounts: set the CLOUDFLARE_ACCOUNT_ID secret to the one with the Pages project $PROJECT and the Worker $WORKER."; return 1 ;;
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

# A new key for the hub, given to the Pages project (production) and then each Worker HUBS names. Run where there's no
# wrangler config (the workflow runs it in the runner's temporary folder): everything is named here. Nothing is changed
# until every Worker named is known to be there (wrangler's secret put makes an empty Worker where there's none of that
# name), and the staging hub alone is never given a new key while the hub at inflite.ai is on (it would turn it off).
give_key() {
  local hubs=${1:-inflite.ai} workers w key rc
  HUB_GAVE=""
  workers=$(hub_workers "$hubs") || { fail "No such choice of hub: \"$hubs\" (inflite.ai, next.inflite.ai or both). Nothing was changed."; return 1; }
  need_account || return 1
  for w in $workers; do
    rc=0; worker_secrets "$w" || rc=$?
    if [ "$rc" = 2 ]; then
      if [ "$w" = "$STAGING" ]; then fail "There's no Worker $STAGING (the staging hub): deploy it first from the inflite repo's Today First branch (npx wrangler deploy --env next), then run this again. Nothing was changed."
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
  if ! printf '%s' "$key" | $WRANGLER pages secret put HUB_KEY --project-name "$PROJECT"; then
    fail "Couldn't set the Pages project's HUB_KEY ($PROJECT, production): wrangler's words above say why. The token likely lacks $PAGES_PERM. Nothing was changed: the hub is as it was."
    return 1
  fi
  gave pages
  say "The Pages project's production secret HUB_KEY is the new key (it reaches the site with its next deployment)."
  for w in $workers; do
    if ! printf '%s' "$key" | $WRANGLER secret put HUB_KEY --name "$w"; then
      fail "Couldn't set the Worker's HUB_KEY ($w): wrangler's words above say why. The token likely lacks $WORKER_PERM; or the Worker's latest version isn't the one deployed (a push to another branch of the inflite repo uploads one), and Cloudflare won't change its secrets until its production branch is deployed again (Workers & Pages → $w → Deployments; never deploy that other version)."
      return 1
    fi
    gave "$w"
    say "The Worker $w's secret HUB_KEY is the same key (live at once: until Pages has it too, that hub isn't ready)."
  done
}

# The production deployment that's live, built again from the same commit with the project's settings as they are now
# (Cloudflare's "Retry deployment"). One already under way is waited for first, so ours is the last to go live.
pages_redeploy() {
  need_account || return 1
  local base="/accounts/$ACCOUNT/pages/projects/$PROJECT" waited=0 newest status live id stage sha
  while :; do
    cf GET "$base/deployments?env=production" || { fail "Couldn't list the Pages project's deployments ($PROJECT: $CF_ERR). $(lacks "$PAGES_PERM")"; return 1; }
    newest=$(jq -c '.[0] // empty' <<<"$CF_OUT")
    [ -n "$newest" ] || { fail "The Pages project $PROJECT has no production deployment to build again."; return 1; }
    # (done: deployed, or stopped; anything else is under way)
    jq -e '.latest_stage as $s | ($s.name == "deploy" and $s.status == "success") or $s.status == "failure" or $s.status == "canceled" or $s.status == "skipped"' <<<"$newest" >/dev/null && break
    (( waited >= PAGES_WAIT )) && { fail "A production deployment ($(jq -r .id <<<"$newest")) has been under way for $waited s: retry the live one in the dashboard once it's done (Workers & Pages → $PROJECT → Deployments → … → Retry deployment)."; return 1; }
    echo "  a production deployment is under way ($(jq -r '.latest_stage.name' <<<"$newest")): waiting for it first"
    sleep "$EVERY"; waited=$((waited + EVERY))
  done
  cf GET "$base" || { fail "Couldn't read the Pages project ($PROJECT: $CF_ERR). $(lacks "$PAGES_PERM")"; return 1; }
  live=$(jq -r '.canonical_deployment.id // empty' <<<"$CF_OUT")
  [ -n "$live" ] || { fail "The Pages project $PROJECT has no live production deployment to build again."; return 1; }
  sha=$(jq -r '.canonical_deployment.deployment_trigger.metadata.commit_hash // "" | .[0:7]' <<<"$CF_OUT")
  cf POST "$base/deployments/$live/retry" '{}' || { fail "Couldn't build production again ($CF_ERR). $(lacks "$PAGES_PERM") Retry the live deployment in the dashboard (Workers & Pages → $PROJECT → Deployments → … → Retry deployment)."; return 1; }
  id=$(jq -r '.id' <<<"$CF_OUT")
  say "Building production again from the live deployment (commit ${sha:-?}): deployment $id."
  waited=0
  while :; do
    sleep "$EVERY"; waited=$((waited + EVERY))
    cf GET "$base/deployments/$id" || { fail "Couldn't follow deployment $id ($CF_ERR). See it in the dashboard (Workers & Pages → $PROJECT → Deployments)."; return 1; }
    stage=$(jq -r '.latest_stage.name // ""' <<<"$CF_OUT"); status=$(jq -r '.latest_stage.status // ""' <<<"$CF_OUT")
    if [ "$stage" = deploy ] && [ "$status" = success ]; then break; fi
    case "$status" in failure|canceled|skipped) fail "Deployment $id stopped at $stage ($status): see its build log (Workers & Pages → $PROJECT → Deployments)."; return 1 ;; esac
    (( waited >= PAGES_WAIT )) && { fail "Deployment $id isn't done after $waited s (at $stage, $status): see it in the dashboard (Workers & Pages → $PROJECT → Deployments)."; return 1; }
    echo "  $waited s: $stage, $status"
  done
  if cf GET "$base" && [ "$(jq -r '.canonical_deployment.id // ""' <<<"$CF_OUT")" = "$id" ]; then say "Deployment $id is live (after $waited s)."
  else say "Deployment $id is built (after $waited s), though the project doesn't yet name it as live."; fi
}

# A hub's /api/hub until it answers {"ready": <want>}. Its yes needs the Worker's key and Chat's host taking it (one
# request from the Worker to chat.'s /_hub/version with the hub's headers); each copy of the Worker keeps a no for a
# minute and a yes for five, so a no from before Pages took the key can last a minute after. An answer that isn't the
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
  local hubs=${HUBS:-inflite.ai} sites site workers bad=0
  sites=$(hub_sites "$hubs" 2>/dev/null) || sites=$SITE
  workers=$(hub_workers "$hubs" 2>/dev/null) || workers=$WORKER
  site=${sites%% *}
  heading "What's live now"
  if [ "${OUT_KEY:-}" != success ]; then
    bad=1
    case "${HUB_GAVE:-}" in
      "") say "Nothing was changed: the hub is as it was (the step that failed says why)." ;;
      pages) say "Only the Pages project's secret has the new key, and the live site hasn't taken it: nothing live has changed. But the next deployment of Pages (any push to main) takes that key, which no Worker has, and from then the hub is off (Today links to each app's own address): run this again once the cause is fixed, before that." ;;
      *) say "These have the new key: ${HUB_GAVE#pages }, and the Pages project's secret; the live site hasn't taken it, so each of those hubs is off now (every hub path 503; Today links to each app's own address). Run this again once the cause is fixed (it makes another key and gives it to each)." ;;
    esac
  elif [ "${OUT_REDEPLOY:-}" != success ]; then
    bad=1
    say "The Worker(s) $workers have the new key, live at once, but the site's live Pages deployment hasn't taken it: until Pages builds again, each hub is off (every hub path 503; Today links to each app's own address). Retry the live production deployment now (Workers & Pages → $PROJECT → Deployments → … → Retry deployment), then check: curl -s $site/api/hub"
  else
    if [ "${OUT_WAIT:-}" = success ]; then say "The hub is on at $sites: Today opens the apps in its own window."
    else bad=1; say "Pages has built again with the key, but not every hub said it's ready in time (the wait step says which). Check by hand: curl -s $site/api/hub (each copy of the Worker keeps a no for a minute). While it says not ready, Today links to each app's own address: nothing is broken; the Worker's logs say why (Workers & Pages → $WORKER → Logs, \"hub probe\")."; fi
  fi
  if [ "${OUT_KEY:-}" = success ] && [ "${OUT_DOOR:-}" != success ]; then
    bad=1; say "Chat's hub copy wasn't shown to be shut to anyone without the key (the door step says what it answered). If it answered 200, run \"Turn InFlite's hub off\" now."
  fi
  say "Run this again only when the hub is off or broken: on a live hub, the Worker takes the new key at once while Pages takes minutes to build, and every hub path answers 503 until it's done (until the next push to main, if that build fails)."
  return $bad
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

# (a name set in this repo's wrangler.toml, which the Pages project reads at each deployment, and no secret overrides)
in_toml() { local t="${GITHUB_WORKSPACE:-.}/wrangler.toml"; [ -f "$t" ] && grep -Eq "^[[:space:]]*$1[[:space:]]*=" "$t"; }

# The Pages project's key taken away (hub-off.yml); with PUSH=1 its HUB_PUSH too (no more rows fanned out); with ACTS=1
# TODAY_ACTS set to "0" (Today's morning stops acting on plans: functions/_todaymorning.js, for an IFL rollback). Each
# reaches the site with the next deployment (pages_redeploy).
pages_off() {
  local push=${1:-0} acts=${2:-0} k vars
  for k in $([ "$push" = 1 ] && echo HUB_PUSH) $([ "$acts" = 1 ] && echo TODAY_ACTS); do
    if in_toml "$k"; then fail "$k is set in wrangler.toml, which the Pages project reads at each deployment: take it out there and push to main, then run this again. Nothing was changed here."; return 1; fi
  done
  need_account || return 1
  cf GET "/accounts/$ACCOUNT/pages/projects/$PROJECT" || { fail "Couldn't read the Pages project ($PROJECT: $CF_ERR). $(lacks "$PAGES_PERM")"; return 1; }
  vars=$(jq -c '.deployment_configs.production.env_vars // {}' <<<"$CF_OUT")
  for k in HUB_KEY $([ "$push" = 1 ] && echo HUB_PUSH); do
    if ! jq -e --arg k "$k" 'has($k) and .[$k] != null' <<<"$vars" >/dev/null; then say "The Pages project has no production $k: nothing to take away."; continue; fi
    if ! $WRANGLER pages secret delete "$k" --project-name "$PROJECT"; then
      fail "Couldn't delete the Pages project's $k ($PROJECT, production): wrangler's words above say why. The token likely lacks $PAGES_PERM."
      return 1
    fi
    say "The Pages project's production $k is deleted (it leaves the site with the next deployment)."
  done
  if [ "$acts" = 1 ]; then
    if ! printf '0' | $WRANGLER pages secret put TODAY_ACTS --project-name "$PROJECT"; then
      fail "Couldn't set the Pages project's TODAY_ACTS to \"0\" ($PROJECT, production): wrangler's words above say why. The token likely lacks $PAGES_PERM."
      return 1
    fi
    say "The Pages project's production TODAY_ACTS is \"0\": once the site is built again, Today's morning no longer acts on anyone's plan."
  fi
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
  if [ "${OUT_ACCOUNT:-}" != success ]; then
    say "Nothing was changed: the hub is as it was (the step that failed says why). To turn it off by hand: delete HUB_KEY from the Worker $WORKER (Workers & Pages → $WORKER → Settings → Variables and Secrets); that alone turns it off at once."
    return 1
  fi
  if [ "${OUT_WORKER:-}" = success ]; then say "The Worker $WORKER has no HUB_KEY: the hub at $SITE is off (every hub path 503; Today links to each app's own address)."
  else bad=1; say "The Worker $WORKER still has its HUB_KEY: delete it by hand (Workers & Pages → $WORKER → Settings → Variables and Secrets), or run this again once the inflite repo's production branch is the Worker's latest version (Workers & Pages → $WORKER → Deployments)."; fi
  if [ "${OUT_STAGING:-}" = failure ]; then bad=1; say "The staging Worker $STAGING may still have its HUB_KEY: delete it by hand (Workers & Pages → $STAGING → Settings → Variables and Secrets)."; fi
  if [ "${OUT_WAIT1:-}" = failure ]; then bad=1; say "The Worker's key is gone, but $SITE/api/hub didn't say so in time: check it by hand (curl -s $SITE/api/hub)."; fi
  case "${OUT_PAGES:-}" in
    success)
      if [ "${OUT_REDEPLOY:-}" = success ]; then say "The Pages project's HUB_KEY$([ "${PUSHES:-0}" = 1 ] && echo " and HUB_PUSH")$([ "${ACTS:-0}" = 1 ] && echo ", and TODAY_ACTS \"0\""), live: the site is built again without them."
      else bad=1; say "The Pages project's secrets are changed, but the live deployment still has them as they were: retry it now (Workers & Pages → $PROJECT → Deployments → … → Retry deployment)."; fi ;;
    *) bad=1; say "The Pages project's HUB_KEY$([ "${PUSHES:-0}" = 1 ] && echo " and HUB_PUSH")$([ "${ACTS:-0}" = 1 ] && echo " (and TODAY_ACTS)") weren't changed: the step says why. By hand: npx wrangler pages secret delete HUB_KEY --project-name $PROJECT, then retry the live deployment." ;;
  esac
  if [ "${OUT_WAIT2:-}" = failure ]; then bad=1; say "$SITE/api/hub didn't say not ready in time after Pages let go of the key: check it by hand (curl -s $SITE/api/hub)."; fi
  if [ "${OUT_DOOR:-}" != success ]; then bad=1; say "Chat's hub copy wasn't shown to be shut (the door step says what it answered). If it answered 200, it's open to anyone: roll the site back (Workers & Pages → $PROJECT → Deployments → the production deployment before → Rollback) and check functions/_middleware.js's /_hub/ rule."; fi
  if [ "${PUSHES:-0}" = 1 ]; then
    if [ "${OUT_D1:-}" = success ]; then say "The push rows the hub fanned out are taken back."
    else bad=1; say "The push rows the hub fanned out weren't taken back (the step says why): run this again with the same inputs once that's fixed."; fi
  fi
  if [ "$bad" = 0 ]; then say "To turn the hub on again: \"Give InFlite's hub its key\" (a new key)."; fi
  return $bad
}

# ---- The staging hub (hub-stage.yml): next.inflite.ai, the Worker inflite-next (spec §15.2; addendum A3) ----
# None of these touch the Worker inflite or the Pages project's HUB_KEY: the staging hub's key is hub-key.yml's.

# The Pages project's HUB_ORIGINS (functions/_sites.js hubOrigins: the origins whose pages are this site's apps too,
# which Chat and WebAuthn take as their own) must list both hubs, or Chat at next.inflite.ai is refused. Set as a
# production secret (this repo's wrangler.toml is the project's configuration: the dashboard's plain variables can't be
# edited) only when it isn't set or lacks one of them. A secret can't be read back: then the live site's passkey list
# (/.well-known/webauthn, which carries the hubs' origins) says whether next.inflite.ai is in it already. Either way it
# reaches the site only with the next deployment of Pages, which hub-key.yml's retry builds.
stage_origins() {
  local need=("$SITE" "$STAGING_SITE") vars type list="" o missing=() value body live
  if in_toml HUB_ORIGINS; then fail "HUB_ORIGINS is set in wrangler.toml, which the Pages project reads at each deployment and no secret overrides: make it \"$SITE,$STAGING_SITE\" there and push to main. Nothing was changed here."; return 1; fi
  need_account || return 1
  cf GET "/accounts/$ACCOUNT/pages/projects/$PROJECT" || { fail "Couldn't read the Pages project ($PROJECT: $CF_ERR). $(lacks "$PAGES_PERM") Nothing was changed."; return 1; }
  vars=$(jq -c '.deployment_configs.production.env_vars // {}' <<<"$CF_OUT")
  type=$(jq -r '.HUB_ORIGINS.type // (if .HUB_ORIGINS == null then "" else "plain_text" end)' <<<"$vars")
  case "$type" in
    "") say "The Pages project has no production HUB_ORIGINS yet." ;;
    secret_text)
      # (unreadable: what the live deployment lists, its passkeys' origins with the hubs' among them)
      body=$(curl -sS --max-time 20 -A "InFlite hub check (GitHub Actions)" "$HOME_SITE/.well-known/webauthn?hub=$(date +%s)" 2>/dev/null) || body=""
      live=$(jq -r 'if type == "object" and (.origins | type) == "array" then .origins[] else empty end' <<<"$body" 2>/dev/null) || live=""
      if grep -qxF "$STAGING_SITE" <<<"$live" && grep -qxF "$SITE" <<<"$live"; then
        say "The Pages project's production HUB_ORIGINS is a secret (it can't be read back), and the live site already lists $SITE and $STAGING_SITE among its origins: left as it is."
        if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_ORIGINS_DID=kept" >> "$GITHUB_ENV"; fi
        return 0
      fi
      # (the live list's hub origins: what it lists beyond the apps' own addresses, kept)
      list=$(grep -E '^https://' <<<"$live" | grep -vE '^https://(chat|account|auth|weather|fitness|finance)\.inflite\.ai$' | paste -sd, -) || list=""
      say "The Pages project's production HUB_ORIGINS is a secret (it can't be read back), and the live site doesn't list $STAGING_SITE among its origins: it's set again below, keeping the hub origins the live site lists." ;;
    *) list=$(jq -r '.HUB_ORIGINS.value // ""' <<<"$vars") ;;
  esac
  for o in "${need[@]}"; do
    if ! tr ',' '\n' <<<"$list" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -qxF "$o"; then missing+=("$o"); fi
  done
  if [ "${#missing[@]}" = 0 ]; then
    say "The Pages project's production HUB_ORIGINS already lists $SITE and $STAGING_SITE: left as it is."
    if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_ORIGINS_DID=kept" >> "$GITHUB_ENV"; fi
    return 0
  fi
  value=$( { tr ',' '\n' <<<"$list"; printf '%s\n' "${missing[@]}"; } | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -E '^https://' | awk '!seen[$0]++' | paste -sd, -)
  if ! printf '%s' "$value" | $WRANGLER pages secret put HUB_ORIGINS --project-name "$PROJECT"; then
    fail "Couldn't set the Pages project's HUB_ORIGINS ($PROJECT, production): wrangler's words above say why. The token likely lacks $PAGES_PERM. Nothing was changed."
    return 1
  fi
  if [ -n "${GITHUB_ENV:-}" ]; then echo "HUB_ORIGINS_DID=set" >> "$GITHUB_ENV"; fi
  say "The Pages project's production secret HUB_ORIGINS is now $value. It counts only once Pages is deployed again: \"Give InFlite's hub its key\" (hub-key.yml) builds the live deployment again, as does any push to main."
}

# [env.next] in the inflite repo's wrangler.toml (FILE), read and checked before anything is deployed from it: the
# staging Worker by name, at next.inflite.ai alone (a custom domain: in a run with no terminal, wrangler moves a hostname
# that's another Worker's to this one without asking, so inflite.ai there would take the live site), and its vars said.
# wrangler deploys the top-level Worker (inflite) where --env names no environment and none is configured, so a
# wrangler.toml without [env.next] is refused here too.
stage_config() {
  python3 - "$1" "$STAGING" "$STAGING_HOST" <<'PY'
import sys, tomllib
path, want, host = sys.argv[1:4]
def no(why):
    print(why); sys.exit(1)
try:
    conf = tomllib.load(open(path, "rb"))
except FileNotFoundError:
    no("it has no wrangler.toml")
except tomllib.TOMLDecodeError as e:
    no(f"its wrangler.toml isn't TOML ({e})")
env = (conf.get("env") or {}).get("next")
if not isinstance(env, dict): no("its wrangler.toml has no [env.next] (wrangler would deploy the live Worker instead)")
name = env.get("name")
if name != want: no(f"its [env.next] names the Worker {name!r}, not {want!r}")
routes = env.get("routes") or ([env["route"]] if env.get("route") else [])
if not routes: no(f"its [env.next] has no route: {host} wouldn't reach the Worker")
for r in routes:
    pattern = r if isinstance(r, str) else (r or {}).get("pattern", "")
    if pattern.split("/")[0] != host or (isinstance(r, dict) and r.get("custom_domain") is not True):
        no(f"its [env.next] has the route {r!r}: only the custom domain {host} is staged")
v = env.get("vars") or {}
print(f"the Worker {name} at {host} (a custom domain); vars: " + (", ".join(f"{k}={v[k]}" for k in sorted(v)) or "none"))
if v.get("TODAY_AS") != "https://inflite.ai":
    print("WARN: TODAY_AS isn't https://inflite.ai, so Today at the staging hub won't speak to the account as inflite.ai")
PY
}

# The inflite repo at REF (a branch, tag or commit; by default claude/inflite, the live branch: under addendum A3 the
# inflite repo is live before its staging hub), fetched into the runner's temporary folder. Only a build with the hub
# (today/src/hub.js) and a wrangler.toml whose [env.next] stage_config passes; Today's build (today/public/app.js
# BUILD) and the commit are left for the later steps (GITHUB_ENV).
stage_clone() {
  local ref=${1:-claude/inflite} dir="${RUNNER_TEMP:?}/inflite" sha build conf
  if ! [[ $ref =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$ ]] || [[ $ref == *..* ]] || [[ $ref == *.lock ]] || [[ $ref == */ ]]; then
    fail "\"$ref\" isn't a branch, tag or commit id of the inflite repo. Nothing was changed."; return 1
  fi
  rm -rf "$dir"
  git -c init.defaultBranch=stage init -q "$dir"
  if ! git -C "$dir" fetch -q --depth 1 "$IFL_GIT" "$ref"; then
    fail "Couldn't fetch \"$ref\" from the inflite repo (a branch, a tag, or a whole commit id there?). Nothing was changed."; return 1
  fi
  git -C "$dir" checkout -q --detach FETCH_HEAD
  sha=$(git -C "$dir" rev-parse HEAD)
  if [ ! -f "$dir/today/src/hub.js" ]; then fail "The inflite repo at $ref (${sha:0:7}) is from before Today First (no today/src/hub.js): it has no hub to stage. Nothing was changed."; return 1; fi
  build=$(sed -n 's/^const BUILD = "\([0-9][0-9.]*\)".*/\1/p' "$dir/today/public/app.js" 2>/dev/null | head -1)
  if [ -z "$build" ]; then fail "The inflite repo at $ref (${sha:0:7}) has no Today build (const BUILD in today/public/app.js). Nothing was changed."; return 1; fi
  if ! conf=$(stage_config "$dir/wrangler.toml"); then fail "The inflite repo at $ref (${sha:0:7}) can't be staged: $conf. Nothing was changed."; return 1; fi
  if [ -n "${GITHUB_ENV:-}" ]; then printf 'HUB_STAGE_REF=%s\nHUB_STAGE_SHA=%s\nHUB_STAGE_BUILD=%s\n' "$ref" "$sha" "$build" >> "$GITHUB_ENV"; fi
  say "The inflite repo at $ref: commit ${sha:0:7}, Today $build; its [env.next] is ${conf%%$'\n'*}."
  if [[ $conf == *$'\n'WARN:* ]]; then echo "::warning::${conf#*$'\n'WARN: }"; say "Note: ${conf#*$'\n'WARN: }."; fi
}

# That build deployed to the staging Worker, from its folder (the working directory): wrangler deploy --env next, which
# [env.next] (checked again here) makes the Worker inflite-next at next.inflite.ai, its custom domain. A dry run first,
# so a build that doesn't bundle changes nothing. The Worker's secrets (its HUB_KEY, once hub-key.yml has given it one)
# stay as they are across a deploy.
stage_deploy() {
  local conf log
  need_account || return 1
  if ! conf=$(stage_config wrangler.toml); then fail "This folder's wrangler.toml can't be staged: $conf. Nothing was changed."; return 1; fi
  log=$(mktemp)
  if ! $WRANGLER deploy --env next --dry-run --outdir "$(mktemp -d)" > "$log" 2>&1; then
    cat "$log"; rm -f "$log"
    fail "The inflite repo's Worker doesn't build (wrangler deploy --env next --dry-run): wrangler's words above say why. Nothing was changed."
    return 1
  fi
  if ! $WRANGLER deploy --env next 2>&1 | tee "$log"; then
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
      fail "$STAGING_SITE/version didn't say build $want in $limit s (last answer: HTTP $code, build ${build:-none}). A new custom domain can take a while for its certificate: check Workers & Pages → $STAGING → Settings → Domains & Routes, then curl -s $STAGING_SITE/version."
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
  else say "$STAGING_SITE/api/hub says ready: true: the staging Worker already has a key the Pages project takes (from an earlier \"Give InFlite's hub its key\")."; fi
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

# hub-stage.yml's last step: what's live now. Reads each step's outcome (OUT_*) and what the steps left (HUB_ORIGINS_DID,
# HUB_STAGE_*); fails the run if anything did.
stage_verdict() {
  local bad=0
  heading "What's live now"
  if [ "${OUT_ACCOUNT:-}" != success ]; then
    say "Nothing was changed (the step that failed says why). The Worker $WORKER and the Pages project's HUB_KEY are never touched by this workflow."
    return 1
  fi
  case "${OUT_ORIGINS:-}" in
    success)
      if [ "${HUB_ORIGINS_DID:-}" = set ]; then say "The Pages project's HUB_ORIGINS lists $SITE and $STAGING_SITE now; it counts once Pages is deployed again, which \"Give InFlite's hub its key\" does."
      else say "The Pages project's HUB_ORIGINS already listed $SITE and $STAGING_SITE: unchanged."; fi ;;
    *) bad=1; say "The Pages project's HUB_ORIGINS wasn't checked or set (the step says why). Until it lists $STAGING_SITE, Chat at the staging hub is refused. By hand: printf '%s' '$SITE,$STAGING_SITE' | npx wrangler pages secret put HUB_ORIGINS --project-name $PROJECT" ;;
  esac
  case "${OUT_CLONE:-}" in
    success) ;;
    *) bad=1; say "Nothing was deployed: the inflite repo at ${HUB_STAGE_REF:-${IFL_REF:-?}} couldn't be fetched, or can't be staged (the fetch step says why). $STAGING_SITE is as it was." ;;
  esac
  case "${OUT_DEPLOY:-}" in
    success) say "The staging Worker $STAGING runs the inflite repo at ${HUB_STAGE_REF:-?} (commit ${HUB_STAGE_SHA:0:7}, Today ${HUB_STAGE_BUILD:-?}) at $STAGING_SITE." ;;
    failure) bad=1; say "The staging Worker $STAGING wasn't deployed, or its custom domain $STAGING_HOST wasn't attached (the deploy step says which, and what the token lacks)." ;;
  esac
  case "${OUT_CHECK:-}" in
    success)
      if [ "${HUB_STAGE_READY:-}" = true ]; then say "$STAGING_SITE answers with Today ${HUB_STAGE_BUILD:-?}, and its hub is ready already: the staging hub had its key from before."
      else say "$STAGING_SITE answers with Today ${HUB_STAGE_BUILD:-?}; its hub isn't ready (no key yet), so Today there links to each app's own address."; fi ;;
    failure) bad=1; say "$STAGING_SITE didn't answer as it should (the check step says what came back)." ;;
  esac
  say "The Worker $WORKER (inflite.ai) and the Pages project's HUB_KEY weren't touched: this workflow never changes them."
  if [ "$bad" = 0 ] && [ "${HUB_STAGE_READY:-}" != true ]; then say "Next: \"Give InFlite's hub its key\" (hub-key.yml) with hub next.inflite.ai, which gives the staging hub its key and deploys Pages again."; fi
  return $bad
}
