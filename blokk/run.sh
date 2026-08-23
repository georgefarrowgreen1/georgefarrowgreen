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

# The model servers are started by the python block below, which then exits —
# so they are orphans by the time anything here could kill them, and PIDS was
# always empty. It was killing nothing while the header promised otherwise,
# which is how you end up with a half-loaded llama-server holding :8081 and a
# fresh Blokk deciding the tier is "already up".
MODEL_PIDS=.blokk.models.pid
cleanup() {
  [ -f "$MODEL_PIDS" ] || return 0
  while read -r pid; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done < "$MODEL_PIDS"
  rm -f "$MODEL_PIDS"
}
trap cleanup EXIT INT TERM

# A previous run that was killed rather than stopped leaves its servers behind.
# They may be fine, or they may be wedged mid-load — and a wedged one answers
# /v1/models, so alive() says yes and Blokk talks to it all night. Say so.
if [ -f "$MODEL_PIDS" ]; then
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "  note: a model server from a previous run is still going (pid $pid)."
      echo "        If Blokk cannot reach it, stop it with: kill $pid"
    fi
  done < "$MODEL_PIDS"
fi

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
import pathlib
import sys
sys.path.insert(0, ".")
from core.servers import SUPERVISOR, tiers_from_conf, alive

PIDFILE = pathlib.Path(".blokk.models.pid")
pids = []
for t in tiers_from_conf():
    if alive(t.port):
        print(f"  {t.name.lower()} tier already up on :{t.port} ({t.backend})")
        continue
    print(f"  starting {t.backend} for the {t.name.lower()} tier on :{t.port}...")
    beat = 0
    for ev in SUPERVISOR.start(t):
        kind = ev["type"]
        if kind == "READY":
            print(f"  {t.name.lower()} tier up after {ev.get('seconds', 0)}s")
        elif kind == "ERROR":
            # The message names the exit code. The tail names the cause, and
            # printing one without the other sends people to the wrong place.
            print(f"  {t.name.lower()} tier failed: {ev['message']}")
            for ln in (ev.get("log") or "").splitlines()[-6:]:
                print(f"      {ln[:100]}")
            if ev.get("log_file"):
                print(f"      full log: {ev['log_file']}")
            print("      Blokk will still start; it degrades per workspace "
                  "and says so. ./blokk doctor explains.")
        elif kind == "WAITING":
            # Every twelve seconds, not every three: often enough that it is
            # visibly alive, rare enough that it is not a wall of text while a
            # 12B model maps itself off the disk.
            if ev["seconds"] >= 6 and ev["seconds"] - beat >= 12:
                beat = ev["seconds"]
                tail = (ev.get("last") or "").strip()[:70]
                print(f"    still loading, {ev['seconds']}s"
                      + (f" — {tail}" if tail else " — nothing printed yet")
                      + f"  ({ev['log']})")
        elif kind == "LOG" and any(
                k in ev["line"].lower() for k in ("download", "%", "error", "failed")):
            print(f"    {ev['line'][:100]}")
    proc = SUPERVISOR.procs.get(t.name)
    if proc is not None and proc.poll() is None:
        pids.append(proc.pid)

# Written even when empty, so cleanup has something definite to read and a
# stale file from a previous run does not outlive the servers it names.
PIDFILE.write_text("".join(f"{p}\n" for p in pids))
PYSTART
fi

# Tells the control plane it is supervised, so its restart endpoint knows
# something will start it again. Unsupervised, exit 75 is just an exit.
set +e
BLOKK_SUPERVISED=1 python3 -m api.server "$PORT"
CODE=$?
set -e
[ "$CODE" = "75" ] || exit "$CODE"
done
