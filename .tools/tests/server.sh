#!/bin/bash
# The local site for the end-to-end tests: `wrangler pages dev` on :8788 (run.sh calls this).
#   server.sh fresh    a new, empty database          server.sh keep    the same database, restarted
#   server.sh stop
# (OPEN_SIGNUP=0 in the environment: new accounts by invite only, as on the real site)
# Needs S (the state folder) and APP_ROOT (the repository) in the environment.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
kill_tree() { for c in $(pgrep -P "$1"); do kill_tree "$c"; done; kill "$1" 2>/dev/null; }
for p in $(pgrep -f "pages dev . --port 8788"); do kill_tree "$p"; done
[ "${1:-fresh}" = stop ] && exit 0
sleep 1
if [ "${1:-fresh}" = fresh ]; then rm -rf "$S/wrstate"; : > "$S/mailbox.jsonl"; : > "$S/pushbox.jsonl"; : > "$S/weatherlog.jsonl"; : > "$S/marketslog.jsonl"; curl -s -o /dev/null -X POST http://127.0.0.1:8801/mode -d '{"reset":true}'; fi
cd "$APP_ROOT"
nohup "$HERE/node_modules/.bin/wrangler" pages dev . --port 8788 --persist-to "$S/wrstate" \
  --binding RESEND_API_KEY=test-key PIGEON_FROM=noreply@georgefarrowgreen.com PIGEON_ADMIN_EMAIL=owner@example.com RESEND_API_URL=http://127.0.0.1:8799/emails PIGEON_PUSH_URL=http://127.0.0.1:8798/push \
    PIGEON_TICK_SECRET=tick-test-secret WX_TRAFFIC_TICK=0 GIPHY_API_KEY=giphy-test-key GIPHY_API_URL=http://127.0.0.1:8797 GIPHY_MEDIA_URL=http://127.0.0.1:8797 \
    WEATHER_URL=http://127.0.0.1:8796 MET_URL=http://127.0.0.1:8796 SWPC_URL=http://127.0.0.1:8796 EONET_URL=http://127.0.0.1:8796 ENSEMBLE_URL=http://127.0.0.1:8796 \
    PIGEON_OPEN_SIGNUP=${OPEN_SIGNUP:-1} CHAT_HOST=chat.localhost,chat.ifl.test WEATHER_HOST=weather.localhost,weather.ifl.test FITNESS_HOST=fitness.localhost,fitness.ifl.test MARKETS_HOST=finance.localhost,finance.ifl.test MARKETS_DATA=http://127.0.0.1:8801 MARKETS_TTL=0 ACCOUNT_HOST=account.localhost,account.ifl.test ACCOUNT_SITE=gfg.test APPS_SITE=ifl.test PASSKEY_SITE=ifl.test WXAPP_URL=http://127.0.0.1:8794 RAINVIEWER_URL=http://127.0.0.1:8794 AWC_URL=http://127.0.0.1:8794 METEOALARM_URL=http://127.0.0.1:8794 WARN_TTL=0 NWS_URL=http://127.0.0.1:8794 EA_URL=http://127.0.0.1:8794 PWNED_URL=http://127.0.0.1:8795 GARMIN_API=http://127.0.0.1:8793 STRAVA_API=http://127.0.0.1:8800 STRAVA_CLIENT_ID=4242 STRAVA_CLIENT_SECRET=test-strava-secret-for-local-tests PIGEON_PEPPER=test-pepper-for-local-tests-only PIGEON_COUNT_DB=1 WX_NET_DAY=1000 >> "$S/wrangler.log" 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8788/pigeon/ && break; sleep 1; done
curl -s -o /dev/null -X POST http://127.0.0.1:8796/mode -d '{"speed":0,"down":false,"pattern":"","kp":2,"eonet":[]}'   # calm weather unless a test sets its own
