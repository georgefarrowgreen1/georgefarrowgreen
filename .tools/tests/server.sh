#!/bin/bash
# The local Worker for end-to-end tests on :8788 (run.sh calls this).
#   server.sh fresh    a new, empty database          server.sh keep    the same database, restarted
#   server.sh stop
# (InFlite's hub, Today First: HUB_KEY, the key the hub's Worker is known by (hubstack.mjs gives it the same);
#  HUB_ORIGINS, the hub's address on the tests' site; HUB_PUSH=1, Get Every App's Notifications Here offered;
#  TODAY_TEST_AT=1, a moment of the day a test may set with X-Today-At; MAIL_KEY, the key the account and Mail's Worker
#  share, and MAIL_VIA, where the account reaches Mail's Worker: hubstack.mjs's pass-through, for `// needs: hub mail`)
# (OPEN_SIGNUP=0 in the environment: new accounts by invite only, as on the real site; PIGEONS=0: new accounts with
#  pigeons off, as on the real site, where the kit's default is accounts as they were before, pigeons on and new chats
#  by pigeon; STREAK_ANYTIME=1: streak warnings at any hour; PULSE_MS: Chat's pulse pace; TYPING=0: no typing Worker,
#  so typing is off)
# Chat's typing dots come from a Worker of their own (workers/live, a Durable Object held in memory), run beside the
# site on :8790 and reached through the TYPING binding.
# Needs S (the state folder) and APP_ROOT (the repository) in the environment.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
kill_tree() { for c in $(pgrep -P "$1"); do kill_tree "$c"; done; kill "$1" 2>/dev/null; }
for p in $(pgrep -f "dev -c .tools/workers/dist/wrangler.test.json --port 8788"); do kill_tree "$p"; done
for p in $(pgrep -f "dev -c wrangler.worker.jsonc --port 8788"); do kill_tree "$p"; done
for p in $(pgrep -f "wrangler dev --port 8790"); do kill_tree "$p"; done
[ "${1:-fresh}" = stop ] && exit 0
sleep 1
if [ "${1:-fresh}" = fresh ]; then rm -rf "$S/wrstate"; : > "$S/mailbox.jsonl"; : > "$S/pushbox.jsonl"; : > "$S/weatherlog.jsonl"; : > "$S/marketslog.jsonl"; curl -s -o /dev/null -X POST http://127.0.0.1:8801/mode -d '{"reset":true}'; fi
cd "$APP_ROOT"
# the typing Worker first, so the site finds it (wrangler dev stops when its input closes: setsid, < /dev/null)
TYPINGB=(); [ "${TYPING:-1}" = 0 ] && TYPINGB=(TYPING_OFF=1)
if [ "${TYPING:-1}" != 0 ]; then
  (cd "$APP_ROOT/workers/live" && setsid "$HERE/node_modules/.bin/wrangler" dev --port 8790 --inspector-port 9230 --show-interactive-dev-session=false --persist-to "$S/livestate" < /dev/null >> "$S/live.log" 2>&1 &)
  for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/)" != 000 ] && break; sleep 0.5; done
fi
# Test variables are passed to the Worker with --var KEY:VALUE.
BINDS=(RESEND_API_KEY=test-key PIGEON_FROM=noreply@georgefarrowgreen.com PIGEON_ADMIN_EMAIL=owner@example.com RESEND_API_URL=http://127.0.0.1:8799/emails PIGEON_PUSH_URL=http://127.0.0.1:8798/push \
    PIGEON_TICK_SECRET=tick-test-secret WX_TRAFFIC_TICK=0 GIPHY_API_KEY=giphy-test-key GIPHY_API_URL=http://127.0.0.1:8797 GIPHY_MEDIA_URL=http://127.0.0.1:8797 \
    WEATHER_URL=http://127.0.0.1:8796 MET_URL=http://127.0.0.1:8796 SWPC_URL=http://127.0.0.1:8796 EONET_URL=http://127.0.0.1:8796 ENSEMBLE_URL=http://127.0.0.1:8796 \
    PIGEON_OPEN_SIGNUP=${OPEN_SIGNUP:-1} CHAT_HOST=chat.localhost,chat.ifl.test WEATHER_HOST=weather.localhost,weather.ifl.test FITNESS_HOST=fitness.localhost,fitness.ifl.test MARKETS_HOST=finance.localhost,finance.ifl.test MARKETS_DATA=http://127.0.0.1:8801 MARKETS_PAGE=http://127.0.0.1:8801 MARKETS_TTL=0 ACCOUNT_HOST=account.localhost,account.ifl.test AUTH_HOST=auth.ifl.test ACCOUNT_SITE=gfg.test APPS_SITE=ifl.test PASSKEY_SITE=ifl.test WXAPP_URL=http://127.0.0.1:8794 RAINVIEWER_URL=http://127.0.0.1:8794 AWC_URL=http://127.0.0.1:8794 METEOALARM_URL=http://127.0.0.1:8794 WARN_TTL=0 NWS_URL=http://127.0.0.1:8794 EA_URL=http://127.0.0.1:8794 PWNED_URL=http://127.0.0.1:8795 GARMIN_API=http://127.0.0.1:8793 STRAVA_API=http://127.0.0.1:8800 STRAVA_CLIENT_ID=4242 STRAVA_CLIENT_SECRET=test-strava-secret-for-local-tests PIGEON_PEPPER=test-pepper-for-local-tests-only PIGEON_COUNT_DB=1 WX_NET_DAY=1000 \
    HUB_KEY=hub-test-key HUB_ORIGINS=http://ifl.test:8788 HUB_PUSH=1 TODAY_TEST_AT=1 MAIL_KEY=mail-test-key MAIL_VIA=http://127.0.0.1:8807 \
    PIGEON_TEST_PIGEONS=${PIGEONS:-1} PIGEON_STREAK_ANYTIME=${STREAK_ANYTIME:-0} ${PULSE_MS:+PULSE_MS=$PULSE_MS} ${TYPINGB[@]+"${TYPINGB[@]}"})
# Build the same Worker used in production.
node "$APP_ROOT/.tools/workers/build.mjs" >> "$S/wrangler.log" 2>&1 || { echo "the Worker didn't build" >&2; exit 1; }
VARS=(); for b in "${BINDS[@]}"; do VARS+=(--var "${b%%=*}:${b#*=}"); done
# (its config less its addresses: given a domain, wrangler dev answers every request as that address, where the tests
# need each one's own host; .tools/workers/dist is the build's own, not kept)
node -e '
  const fs = require("fs"), c = JSON.parse(fs.readFileSync("wrangler.worker.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
  delete c.routes; delete c.$schema; c.main = "index.js"; c.assets.directory = "../../..";
  fs.writeFileSync(".tools/workers/dist/wrangler.test.json", JSON.stringify(c, null, 1));' || { echo "the Worker's test config wasn't made" >&2; exit 1; }
nohup "$HERE/node_modules/.bin/wrangler" dev -c .tools/workers/dist/wrangler.test.json --port 8788 --inspector-port 9233 --show-interactive-dev-session=false --persist-to "$S/wrstate" \
  "${VARS[@]}" < /dev/null >> "$S/wrangler.log" 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8788/pigeon/ && break; sleep 1; done
curl -s -o /dev/null -X POST http://127.0.0.1:8796/mode -d '{"speed":0,"down":false,"pattern":"","kp":2,"eonet":[]}'   # calm weather unless a test sets its own
