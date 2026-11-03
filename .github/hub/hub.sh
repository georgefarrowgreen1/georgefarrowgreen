# InFlite's hub, from GitHub Actions: what .github/workflows/hub-key.yml and hub-off.yml do, one step at a time
# (Today First, spec §15.4). Sourced by each step (. .github/hub/hub.sh), which then calls one of these:
#   cf_account          → ACCOUNT: CLOUDFLARE_ACCOUNT_ID, or else the one account the token can see
#   give_key            → a new key, made here: the Pages project's production HUB_KEY first, and only once that's set,
#                         the Worker's (so the two never differ because one of them failed)
#   take_key_worker     → the Worker's HUB_KEY deleted (the hub at once not ready: Today links to each app's own address)
#   take_key_pages      → the Pages project's HUB_KEY deleted (and, with push=1, its HUB_PUSH var too)
#   pages_redeploy      → the production deployment that's live, built again: a Pages secret or var reaches only the
#                         deployments made after it's set
#   wait_hub true|false [seconds] → inflite.ai/api/hub asked until it says so
#   door_shut           → chat.inflite.ai/_hub/version is 404 to anyone without the key, a made-up one included
#   take_back_pushes    → the push rows the hub fanned out, deleted from D1 (via = 'hub'; spec §15.4's four statements)
# Cloudflare's API is asked with CLOUDFLARE_API_TOKEN, which never goes on a command line (curl reads its header from a
# pipe) nor into the log; a key made here is masked before anything else and only ever piped to wrangler. What's
# printed of an answer from Cloudflare is its error codes and messages, never the request.

PROJECT=georgefarrowgreen      # the Pages project (this repo's wrangler.toml name)
WORKER=inflite                 # the Worker at inflite.ai (the inflite repo's wrangler.toml name)
DATABASE=bio-db                # the D1 database (this repo's wrangler.toml, binding DB)
SITE=${SITE:-https://inflite.ai}
CHAT=${CHAT:-https://chat.inflite.ai}
CF_API=${CF_API:-https://api.cloudflare.com/client/v4}
WRANGLER=${WRANGLER:-npx --yes wrangler@4.149.0}
EVERY=${EVERY:-15}             # seconds between one check and the next
PAGES_PERM="Account › Cloudflare Pages › Edit"
WORKER_PERM="Account › Workers Scripts › Edit"
D1_PERM="Account › D1 › Edit"

# (a line for the log and the run's summary page; an error that says so on both, and fails the step)
say() { echo "$*"; [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- $*" >> "$GITHUB_STEP_SUMMARY"; return 0; }
fail() { echo "::error::$*"; [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- **Failed:** $*" >> "$GITHUB_STEP_SUMMARY"; return 1; }

# cf METHOD PATH [JSON] → CF_OUT: the answer's result, or CF_ERR: what Cloudflare said was wrong (its codes and words)
cf() {
  local method=$1 path=$2 data=${3-} out code
  local args=(-sS --max-time 60 -X "$method" -H "Content-Type: application/json")
  [ -n "$data" ] && args+=(--data "$data")
  CF_OUT="" CF_ERR=""
  out=$(mktemp)
  if ! code=$(curl "${args[@]}" -H @<(printf 'Authorization: Bearer %s\n' "$CLOUDFLARE_API_TOKEN") -o "$out" -w '%{http_code}' "$CF_API$path"); then
    rm -f "$out"; CF_ERR="no answer from Cloudflare's API"; return 1
  fi
  if [ "$(jq -r '.success // false' "$out" 2>/dev/null)" != "true" ]; then
    CF_ERR="HTTP $code: $(jq -r '[.errors[]? | "\(.code // "?"): \(.message // "")"] | if length == 0 then "no reason given" else join("; ") end' "$out" 2>/dev/null || echo "an answer that isn't JSON")"
    rm -f "$out"; return 1
  fi
  CF_OUT=$(jq -c '.result' "$out"); rm -f "$out"
}

# Which Cloudflare account: CLOUDFLARE_ACCOUNT_ID where it's set, else the token's own, if it can see only one
cf_account() {
  if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then ACCOUNT=$CLOUDFLARE_ACCOUNT_ID; say "Cloudflare account: from CLOUDFLARE_ACCOUNT_ID."; return 0; fi
  cf GET "/accounts?per_page=50" || { fail "Couldn't list the token's Cloudflare accounts ($CF_ERR). Set the CLOUDFLARE_ACCOUNT_ID secret, or check CLOUDFLARE_API_TOKEN is a live token."; return 1; }
  local n; n=$(jq 'length' <<<"$CF_OUT")
  case "$n" in
    1) ACCOUNT=$(jq -r '.[0].id' <<<"$CF_OUT"); say "Cloudflare account: the token's one ($(jq -r '.[0].name' <<<"$CF_OUT"))." ;;
    0) fail "The token can't see any Cloudflare account: give it $PAGES_PERM and $WORKER_PERM on the account, or set CLOUDFLARE_ACCOUNT_ID."; return 1 ;;
    *) fail "The token can see $n Cloudflare accounts: set the CLOUDFLARE_ACCOUNT_ID secret to the one with the Pages project $PROJECT and the Worker $WORKER."; return 1 ;;
  esac
}

# A new key for the hub, given to the Pages project (production) and then the Worker. Run where there's no wrangler
# config (the workflow runs it in the runner's temporary folder): both are named here.
give_key() {
  local key
  key=$(openssl rand -hex 32) || { fail "Couldn't make a key."; return 1; }
  echo "::add-mask::$key"
  [ ${#key} -eq 64 ] || { fail "The key made wasn't 64 hex digits."; return 1; }
  if ! printf '%s' "$key" | $WRANGLER pages secret put HUB_KEY --project-name "$PROJECT"; then
    fail "Couldn't set the Pages project's HUB_KEY ($PROJECT, production). The token likely lacks $PAGES_PERM. Nothing else was changed: the hub is as it was."
    return 1
  fi
  say "1. The Pages project's production secret HUB_KEY is the new key (it reaches the site with its next deployment)."
  if ! printf '%s' "$key" | $WRANGLER secret put HUB_KEY --name "$WORKER"; then
    fail "Couldn't set the Worker's HUB_KEY ($WORKER). The token likely lacks $WORKER_PERM. (If wrangler said the Worker's latest version isn't deployed, deploy it, or roll back to it, then run this again.) The Pages project now holds a key the Worker doesn't: the site goes on as it is until Pages next deploys, and after that the hub isn't ready (Today links to each app's own address) until this runs again and both take one key."
    return 1
  fi
  say "2. The Worker's secret HUB_KEY is the same key (live at once: until Pages has it too, the hub says it isn't ready)."
}

# The Worker's key taken away (hub-off.yml, first): with no HUB_KEY every hub path answers 503 and /api/hub says it
# isn't ready without asking any app (today/src/hub.js), so Today links to each app's own address at once
take_key_worker() {
  cf GET "/accounts/$ACCOUNT/workers/scripts/$WORKER/secrets" || { fail "Couldn't read the Worker's secrets ($WORKER: $CF_ERR). The token likely lacks $WORKER_PERM."; return 1; }
  if ! jq -e 'any(.[]; .name == "HUB_KEY")' <<<"$CF_OUT" >/dev/null; then say "1. The Worker ($WORKER) has no HUB_KEY: nothing to take away."; return 0; fi
  if ! $WRANGLER secret delete HUB_KEY --name "$WORKER"; then
    fail "Couldn't delete the Worker's HUB_KEY ($WORKER). The token likely lacks $WORKER_PERM. The hub is still on: delete it in the dashboard (Workers & Pages → $WORKER → Settings → Variables and Secrets)."
    return 1
  fi
  say "1. The Worker's HUB_KEY is deleted: the hub is off (each hub path 503, /api/hub not ready)."
}

# The Pages project's key taken away (hub-off.yml), and with push=1 its HUB_PUSH var (no more rows fanned out); both
# reach the site with the next deployment (pages_redeploy)
take_key_pages() {
  local push=${1:-0} k
  if [ "$push" = 1 ] && [ -f "${GITHUB_WORKSPACE:-.}/wrangler.toml" ] && grep -Eq '^[[:space:]]*HUB_PUSH[[:space:]]*=' "${GITHUB_WORKSPACE:-.}/wrangler.toml"; then
    fail "HUB_PUSH is set in wrangler.toml, which the Pages project reads at each deployment: take it out there and push to main, then run this again."
    return 1
  fi
  cf GET "/accounts/$ACCOUNT/pages/projects/$PROJECT" || { fail "Couldn't read the Pages project ($PROJECT: $CF_ERR). The token likely lacks $PAGES_PERM."; return 1; }
  local vars; vars=$(jq -c '.deployment_configs.production.env_vars // {}' <<<"$CF_OUT")
  for k in HUB_KEY $([ "$push" = 1 ] && echo HUB_PUSH); do
    if ! jq -e --arg k "$k" 'has($k) and .[$k] != null' <<<"$vars" >/dev/null; then say "2. The Pages project has no production $k: nothing to take away."; continue; fi
    if ! $WRANGLER pages secret delete "$k" --project-name "$PROJECT"; then
      fail "Couldn't delete the Pages project's $k ($PROJECT, production). The token likely lacks $PAGES_PERM."
      return 1
    fi
    say "2. The Pages project's production $k is deleted (it leaves the site with the next deployment)."
  done
}

# The production deployment that's live, built again from the same commit with the project's settings as they are now
# (Cloudflare's "Retry deployment"). One already under way is waited for first, so ours is the last to go live.
pages_redeploy() {
  local base="/accounts/$ACCOUNT/pages/projects/$PROJECT" waited=0 newest status live id stage sha
  while :; do
    cf GET "$base/deployments?env=production" || { fail "Couldn't list the Pages project's deployments ($PROJECT: $CF_ERR). The token likely lacks $PAGES_PERM."; return 1; }
    newest=$(jq -c '.[0] // empty' <<<"$CF_OUT")
    [ -n "$newest" ] || { fail "The Pages project $PROJECT has no production deployment to build again."; return 1; }
    # (done: deployed, or stopped; anything else is under way)
    jq -e '.latest_stage as $s | ($s.name == "deploy" and $s.status == "success") or $s.status == "failure" or $s.status == "canceled" or $s.status == "skipped"' <<<"$newest" >/dev/null && break
    (( waited >= ${PAGES_WAIT:-900} )) && { fail "A production deployment ($(jq -r .id <<<"$newest")) has been under way for $waited s: retry it in the dashboard once it's done (Workers & Pages → $PROJECT → Deployments)."; return 1; }
    echo "  a production deployment is under way ($(jq -r '.latest_stage.name' <<<"$newest")): waiting for it first"
    sleep "$EVERY"; waited=$((waited + EVERY))
  done
  cf GET "$base" || { fail "Couldn't read the Pages project ($PROJECT: $CF_ERR). The token likely lacks $PAGES_PERM."; return 1; }
  live=$(jq -r '.canonical_deployment.id // empty' <<<"$CF_OUT")
  [ -n "$live" ] || { fail "The Pages project $PROJECT has no live production deployment to build again."; return 1; }
  sha=$(jq -r '.canonical_deployment.deployment_trigger.metadata.commit_hash // "" | .[0:7]' <<<"$CF_OUT")
  cf POST "$base/deployments/$live/retry" '{}' || { fail "Couldn't build production again ($CF_ERR). The token likely lacks $PAGES_PERM. Retry the live deployment in the dashboard (Workers & Pages → $PROJECT → Deployments → … → Retry deployment)."; return 1; }
  id=$(jq -r '.id' <<<"$CF_OUT")
  say "3. Building production again from the live deployment (commit ${sha:-?}): deployment $id."
  waited=0
  while :; do
    sleep "$EVERY"; waited=$((waited + EVERY))
    cf GET "$base/deployments/$id" || { fail "Couldn't follow deployment $id ($CF_ERR)."; return 1; }
    stage=$(jq -r '.latest_stage.name // ""' <<<"$CF_OUT"); status=$(jq -r '.latest_stage.status // ""' <<<"$CF_OUT")
    if [ "$stage" = deploy ] && [ "$status" = success ]; then break; fi
    case "$status" in failure|canceled|skipped) fail "Deployment $id stopped at $stage ($status): see its build log (Workers & Pages → $PROJECT → Deployments)."; return 1 ;; esac
    (( waited >= ${PAGES_WAIT:-900} )) && { fail "Deployment $id isn't done after $waited s (at $stage, $status)."; return 1; }
    echo "  $waited s: $stage, $status"
  done
  cf GET "$base" && [ "$(jq -r '.canonical_deployment.id // ""' <<<"$CF_OUT")" = "$id" ] \
    && say "3. Deployment $id is live (after $waited s)." \
    || say "3. Deployment $id is built (after $waited s), though the project doesn't yet name it as live."
}

# inflite.ai/api/hub until it answers {"ready": <want>}. Its yes needs the Worker's key and Chat's host taking it
# (one request from the Worker to chat.'s /_hub/version with the hub's headers); each copy of the Worker keeps a no
# for a minute and a yes for five, so a no from before Pages took the key can last a minute after.
wait_hub() {
  local want=$1 limit=${2:-480} start=$SECONDS body code got
  while :; do
    body=$(curl -sS --max-time 20 -A "InFlite hub check (GitHub Actions)" -w '\n%{http_code}' "$SITE/api/hub" 2>/dev/null) || body=$'\n000'
    code=${body##*$'\n'}; body=${body%$'\n'*}
    got=$(jq -r 'if type == "object" and has("ready") then (.ready | tostring) else "?" end' <<<"$body" 2>/dev/null); got=${got:-?}
    if [ "$got" = "$want" ]; then say "$SITE/api/hub says ready: $got (after $((SECONDS - start)) s)."; return 0; fi
    # (off is off, too, where the Worker there has no hub at all: an older build's 404)
    if [ "$want" = false ] && [ "$code" = 404 ]; then say "$SITE/api/hub isn't there (404): the Worker live at $SITE has no hub, so it's off."; return 0; fi
    if (( SECONDS - start >= limit )); then
      if [ "$got" = "?" ]; then fail "$SITE/api/hub didn't say whether the hub is ready after $limit s (last answer: HTTP $code, $(printf '%.160s' "$body" | tr -d '\r\n')). Is the inflite repo's Today First build live?"
      else fail "$SITE/api/hub still says ready: $got after $limit s."; fi
      return 1
    fi
    echo "  $((SECONDS - start)) s: ready is $got; asking again in $EVERY s"
    sleep "$EVERY"
  done
}

# Chat's hub copy (/_hub/) is only for the hub, with its key (functions/_middleware.js): to anyone else, not found.
# Asked plainly, and with a made-up key and X-Hub-Ok said outright (only the key is believed, never that header).
door_shut() {
  local plain forged i
  for i in 1 2 3; do
    plain=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$CHAT/_hub/version" 2>/dev/null) || plain=000
    forged=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -H "X-Hub-Key: not-the-hub-key" -H "X-Hub-Ok: 1" "$CHAT/_hub/version" 2>/dev/null) || forged=000
    [ "$plain" = 404 ] && [ "$forged" = 404 ] && { say "$CHAT/_hub/version is 404 without the key (and with a made-up one): the hub's door is shut to everyone else."; return 0; }
    [ "$plain" = 200 ] || [ "$forged" = 200 ] && break
    sleep "$EVERY"
  done
  if [ "$plain" = 200 ] || [ "$forged" = 200 ]; then
    fail "$CHAT/_hub/version answered $plain without the key and $forged with a made-up one: Chat's hub copy is open to anyone. Run \"Turn InFlite's hub off\" now, and check functions/_middleware.js's /_hub/ rule."
  else
    fail "Couldn't confirm $CHAT/_hub/version is shut: $plain without the key, $forged with a made-up one (404 was wanted). Check it by hand: curl -sI $CHAT/_hub/version"
  fi
  return 1
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
# without it has no row of the hub's). td_push is Today's own and stays; the apps' own rows are never touched.
take_back_pushes() {
  local q tables="" t n sql=""
  d1 "SELECT (SELECT COUNT(*) FROM pragma_table_info('pg_push') WHERE name = 'via') AS pg_push, (SELECT COUNT(*) FROM pragma_table_info('mk_push') WHERE name = 'via') AS mk_push, (SELECT COUNT(*) FROM pragma_table_info('wx_devs') WHERE name = 'via') AS wx_devs" || return 1
  q=$(jq -c '.[0].results[0]' <<<"$D1_OUT")
  for t in pg_push mk_push wx_devs; do [ "$(jq -r --arg t "$t" '.[$t] // 0' <<<"$q")" -ge 1 ] && tables="$tables $t"; done
  [ -n "$tables" ] || { say "5. No table has the hub's via column: no push row was fanned out, nothing to take back."; return 0; }
  for t in $tables; do
    d1 "SELECT COUNT(*) AS n FROM $t WHERE via = 'hub'" || return 1
    n=$(jq -r '.[0].results[0].n' <<<"$D1_OUT"); say "5. $t: $n row(s) the hub fanned out."
    case "$t" in
      wx_devs) sql="$sql DELETE FROM wx_subs WHERE dev IN (SELECT dev FROM wx_devs WHERE via = 'hub'); DELETE FROM wx_devs WHERE via = 'hub';" ;;
      *) sql="$sql DELETE FROM $t WHERE via = 'hub';" ;;
    esac
  done
  d1 "$sql" || return 1
  say "5. Taken back:$(jq -r '[.[] | .meta.changes // 0 | tostring] | join(", ")' <<<"$D1_OUT") row(s) by statement ($sql )."
}
