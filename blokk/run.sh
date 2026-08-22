#!/usr/bin/env bash
# Blokk. Starts whatever model servers blokk.conf declares, then the control
# plane. Ctrl-C stops all of them.
#
# One tier or two, one backend or both — it is the same loop. Blokk only ever
# sees OpenAI-compatible endpoints, so llama-server and mlx_lm.server are
# interchangeable from here up.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"

[ -f blokk.conf ] || { echo "No blokk.conf — run ./setup.sh first."; exit 1; }
# shellcheck disable=SC1091
set -a; source ./blokk.conf; set +a
[ -f blokk.db ] || { echo "First run — seeding…"; python3 seed.py; }

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# Supervise rather than exec, so ./blokk update can replace the code without
# you stopping anything. The control plane exits 75 when it has been asked to
# restart; every other exit is a real one and ends the script.
#
# The tier block is inside the loop on purpose: it is idempotent (alive()
# skips a server already up), so a restart costs a second and nothing is
# reloaded, but a model server that died in the meantime gets started again.
while :; do

# The GUI and this script start servers through core/servers.py, so there is
# one implementation rather than two that drift.
if [ "${MODE:-stubs}" != "stubs" ]; then
  python3 - <<'PYSTART' || true
import sys
sys.path.insert(0, ".")
from core.servers import SUPERVISOR, tiers_from_conf, alive
for t in tiers_from_conf():
    if alive(t.port):
        print(f"  {t.name.lower()} tier already up on :{t.port} ({t.backend})")
        continue
    print(f"  starting {t.backend} for the {t.name.lower()} tier on :{t.port}...")
    for ev in SUPERVISOR.start(t):
        if ev["type"] == "READY":
            print(f"  {t.name.lower()} tier up")
        elif ev["type"] == "ERROR":
            print(f"  {t.name.lower()} tier failed: {ev['message']}")
        elif ev["type"] == "LOG" and any(
                k in ev["line"].lower() for k in ("download", "%", "error", "failed")):
            print(f"    {ev['line'][:100]}")
PYSTART
fi

set +e
python3 -m api.server "$PORT"
CODE=$?
set -e
[ "$CODE" = "75" ] || exit "$CODE"
done
