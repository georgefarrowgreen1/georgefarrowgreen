#!/usr/bin/env bash
# Blokk setup. One question, one config file.
#
#   ./setup.sh            interactive
#   ./setup.sh --small    8B, one server
#   ./setup.sh --both     two tiers, and probably two backends
#   ./setup.sh --stubs    no model at all
#
# Everything lands in blokk.conf, which run.sh reads. No exports to forget.
# Written for bash 3.2, which is what macOS still ships.
set -euo pipefail
cd "$(dirname "$0")"

BOLD=$'\033[1m'; DIM=$'\033[2m'; OK=$'\033[32m'; WARN=$'\033[33m'; OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s\n' "$BOLD" "$OFF" "$*"; }
warn() { printf '%s !  %s%s\n' "$WARN" "$*" "$OFF"; }
good() { printf '%s ok %s%s\n' "$OK" "$*" "$OFF"; }
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

MODE="${1:-}"

step "Checking the Mac"
[ "$(uname -s)" = "Darwin" ] || warn "Not macOS. Blokk runs; the server section is Mac-only."
python3 -c 'import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)' \
  || { warn "Python 3.9+ required"; exit 1; }
good "python3 $(python3 -V | cut -d' ' -f2) — nothing to install for Blokk itself"

step "Sizing this machine"
python3 bench.py | sed -n '3,12p'

if [ "$MODE" = "--stubs" ]; then
  printf '# Written by setup.sh. Stubs: real mechanisms, placeholder prose.\nMODE=stubs\n' > blokk.conf
  good "Configured for stubs. ./run.sh — the banner will say so."
  exit 0
fi

# Anything already on disk beats anything to download. Listed before the
# menu so the numbering below is stable whether or not models/ has files.
LOCAL_N=0
LOCAL_FILES=""
if [ -d models ]; then
  for f in models/*.gguf; do
    [ -f "$f" ] || continue                 # the glob itself when empty
    LOCAL_N=$((LOCAL_N + 1))
    LOCAL_FILES="${LOCAL_FILES}${f}
"
  done
fi

step "Choosing a model"
say "${DIM}One model is enough to start. Two tiers is a real optimisation — most"
say "agent work is triage and does not need a big model — but it is a second"
say "server to keep alive, so reach for it after measuring your own mix.${OFF}"
say ""
say "  1  Qwen3-8B                   one model, one server. 24GB Macs and up"
say "  2  Qwen3.6-35B-A3B            one model, MoE. Knows more. 48GB and up"
say "  3  both: 8B triage + 35B MoE  two tiers, and probably two backends"
if [ "$LOCAL_N" -gt 0 ]; then
  say ""
  say "  ${BOLD}already in models/${OFF} — nothing to download"
  i=0
  printf '%s\n' "$LOCAL_FILES" | while read -r f; do
    [ -n "$f" ] || continue
    i=$((i + 1))
    printf '  l%-2s%-28s %s\n' "$i" "$(basename "$f")" \
      "$(du -h "$f" 2>/dev/null | cut -f1)"
  done
fi
say ""
case "$MODE" in
  --small) CHOICE=1 ;;
  --both)  CHOICE=3 ;;
  --local) CHOICE=l1 ;;
  *) read -r -p "Which? [1] " CHOICE; CHOICE="${CHOICE:-1}" ;;
esac

# A local file short-circuits the plan: core/backends.py chooses between
# llama.cpp and MLX by model shape, and that choice is already made — MLX
# cannot read GGUF. One tier, one server, pointed at the file.
case "$CHOICE" in
  l*|L*)
    LOCAL_I="$(printf '%s' "$CHOICE" | tr -dc '0-9')"
    [ -n "$LOCAL_I" ] || LOCAL_I=1
    GGUF="$(printf '%s\n' "$LOCAL_FILES" | sed -n "${LOCAL_I}p")"
    [ -n "$GGUF" ] && [ -f "$GGUF" ] || { warn "No such local model: $CHOICE"; exit 1; }

    step "Installing backends"
    if command -v llama-server >/dev/null 2>&1; then good "llama-server present"
    elif command -v brew >/dev/null 2>&1; then
      read -r -p "Install llama.cpp with Homebrew? [Y/n] " yn
      case "$yn" in [Nn]*) warn "skipped" ;; *) brew install llama.cpp && good "installed" ;; esac
    else warn "No Homebrew — see https://brew.sh"; fi

    step "Writing blokk.conf"
    ALIAS="$(basename "$GGUF" .gguf)"
    {
      echo "# Written by setup.sh on $(date +%Y-%m-%d). Edit freely; run.sh reads it."
      echo "MODE=servers"
      echo "SLOTS=4"
      echo "CTX=32768"
      echo ""
      echo "# SMALL — local weights, read from disk, never downloaded"
      echo "SMALL_BACKEND=llama.cpp"
      echo "SMALL_PATH=$GGUF"
      echo "SMALL_ALIAS=$ALIAS"
      echo "SMALL_PORT=8081"
      echo ""
      echo "BLOKK_SMALL_URL=http://127.0.0.1:8081/v1"
      echo "BLOKK_SMALL_MODEL=$ALIAS"
      echo "BLOKK_LARGE_URL=http://127.0.0.1:8081/v1"
      echo "BLOKK_LARGE_MODEL=$ALIAS"
    } > blokk.conf
    good "blokk.conf written — both tiers point at $(basename "$GGUF")"
    say ""
    say "  ${BOLD}./run.sh${OFF}   starts it and then Blokk. Nothing to download."
    say ""
    exit 0
    ;;
esac

SLOTS=4
CTX=32768

# The rule lives in core/backends.py, so setup.sh and the docs cannot drift.
PLAN="$(python3 core/plan.py "$CHOICE" "$SLOTS" $((CTX/1000)))"

say ""
printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read -r tier backend repo file alias port why; do
  [ -n "$tier" ] || continue
  printf '  %-6s %-10s %s\n' "$(lower "$tier")" "$backend" "$repo"
  printf '  %-6s %-10s %s%s%s\n' "" "" "$DIM" "$why" "$OFF"
done

step "Installing backends"
if printf '%s' "$PLAN" | grep -q 'llama\.cpp'; then
  if command -v llama-server >/dev/null 2>&1; then good "llama-server present"
  elif command -v brew >/dev/null 2>&1; then
    read -r -p "Install llama.cpp with Homebrew? [Y/n] " yn
    case "$yn" in [Nn]*) warn "skipped" ;; *) brew install llama.cpp && good "installed" ;; esac
  else warn "No Homebrew — see https://brew.sh"; fi
fi
if printf '%s' "$PLAN" | grep -q "$(printf '\tmlx\t')"; then
  if command -v mlx_lm.server >/dev/null 2>&1; then good "mlx_lm.server present"
  else
    read -r -p "Install mlx-lm with pip? [Y/n] " yn
    case "$yn" in [Nn]*) warn "skipped" ;; *) python3 -m pip install --quiet mlx-lm && good "installed" ;; esac
  fi
fi

step "Writing blokk.conf"
{
  echo "# Written by setup.sh on $(date +%Y-%m-%d). Edit freely; run.sh reads it."
  echo "MODE=servers"
  echo "SLOTS=$SLOTS"
  echo "CTX=$CTX"
  echo ""
  printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read -r tier backend repo file alias port why; do
    [ -n "$tier" ] || continue
    echo "# $tier — $why"
    echo "${tier}_BACKEND=$backend"
    echo "${tier}_REPO=$repo"
    [ "$file" = "-" ] || echo "${tier}_FILE=$file"
    echo "${tier}_ALIAS=$alias"
    echo "${tier}_PORT=$port"
    echo ""
  done
  SP=$(printf '%s' "$PLAN" | grep '^SMALL' | cut -f6)
  SA=$(printf '%s' "$PLAN" | grep '^SMALL' | cut -f5)
  LP=$(printf '%s' "$PLAN" | grep '^LARGE' | cut -f6 || true)
  LA=$(printf '%s' "$PLAN" | grep '^LARGE' | cut -f5 || true)
  echo "BLOKK_SMALL_URL=http://127.0.0.1:${SP}/v1"
  echo "BLOKK_SMALL_MODEL=${SA}"
  echo "BLOKK_LARGE_URL=http://127.0.0.1:${LP:-$SP}/v1"
  echo "BLOKK_LARGE_MODEL=${LA:-$SA}"
} > blokk.conf
good "blokk.conf written — no environment variables to remember"

step "Done"
say ""
say "  ${BOLD}./run.sh${OFF}   starts every server the config declares, then Blokk"
say ""
say "  First start downloads the weights, once. run.sh prints the phone link."
say ""
say "  ${DIM}Then, in order:"
say "    python3 bench.py --serve http://127.0.0.1:8081/v1"
say "                              confirm the batching gain is real"
if [ "$CHOICE" = "3" ]; then
say "    python3 bench.py --compare http://127.0.0.1:8081/v1 http://127.0.0.1:8082/v1"
say "                              settle llama.cpp vs mlx on YOUR machine"
fi
say "    python3 connect.py add cottages messages local"
say "    see CONNECTING.md${OFF}"
say ""
