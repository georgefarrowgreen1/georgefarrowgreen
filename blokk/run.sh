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

# A server is up when it can list models. llama-server also has /health;
# mlx_lm.server does not, so /v1/models is the check that works for both.
alive() { curl -s --max-time 1 "http://127.0.0.1:$1/v1/models" >/dev/null 2>&1; }

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

start_tier() {
  local tier="$1" lt backend repo file alias port log pid
  lt="$(lower "$tier")"
  backend="$(eval echo "\${${tier}_BACKEND:-}")"
  [ -n "$backend" ] || return 0
  repo="$(eval echo "\${${tier}_REPO}")"
  file="$(eval echo "\${${tier}_FILE:-}")"
  alias="$(eval echo "\${${tier}_ALIAS}")"
  port="$(eval echo "\${${tier}_PORT}")"
  log="/tmp/blokk-${lt}.log"

  if alive "$port"; then
    echo "  ${lt} tier already up on :${port} (${backend})"
    return 0
  fi

  echo "  starting ${backend} for the ${lt} tier on :${port}..."
  case "$backend" in
    llama.cpp)
      # -cb continuous batching, -np slots, -fa flash attention.
      # Each slot carries its own KV cache, so -np scales memory linearly.
      llama-server -hf "${repo}:${file}" --alias "${alias}" --port "${port}" \
        -cb -np "${SLOTS:-4}" -c "${CTX:-32768}" -fa --log-disable \
        > "$log" 2>&1 &
      ;;
    mlx)
      mlx_lm.server --model "${repo}" --port "${port}" --max-tokens 2048 \
        > "$log" 2>&1 &
      ;;
    *)
      echo "  unknown backend '${backend}' for ${tier} — skipping"; return 0 ;;
  esac
  pid=$!
  PIDS+=("$pid")

  printf "  waiting"
  for _ in $(seq 1 240); do
    alive "$port" && { echo " up"; return 0; }
    kill -0 "$pid" 2>/dev/null || { echo; echo "  ${lt} tier died - see $log"; tail -3 "$log" || true; return 1; }
    printf "."; sleep 2
  done
  echo; echo "  ${lt} tier did not come up in time - see $log"
  return 1
}

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

exec python3 -m api.server "$PORT"
