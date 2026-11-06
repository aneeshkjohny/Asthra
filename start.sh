#!/bin/sh
# Asthra — interactive first-run setup + one-command launcher.
#
#   ./start.sh            set up (Ollama + a model), build, and serve on :8787
#   ./start.sh --dev      dev mode: Vite on :5173 (HMR) + backend on :8787
#   ./start.sh --setup    run the setup steps only, then stop (don't launch)
#   ./start.sh --yes      non-interactive: accept defaults, never prompt / sudo
#   ./start.sh --help     show this help
#
# POSIX-sh compatible: works under dash, bash, or `./start.sh`.
# Prompts only appear on an interactive terminal; piped / CI runs use defaults.

set -u
cd "$(dirname "$0")"

# --------------------------------------------------------------- settings --
PORT="${ASTHRA_PORT:-8787}"
HOST="${ASTHRA_HOST:-127.0.0.1}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_LOG="/tmp/asthra-ollama.log"

# ------------------------------------------------------------------ flags --
DEV=0
SETUP_ONLY=0
ASSUME_YES=0
for a in "$@"; do
  case "$a" in
    --dev) DEV=1 ;;
    --setup) SETUP_ONLY=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --help|-h)
      printf '%s\n' \
        "Asthra — a clean, private chat for fully local LLMs (Ollama)." \
        "" \
        "Usage: ./start.sh [options]" \
        "  (no options)   set up Ollama + a model, build the UI, serve on :$PORT" \
        "  --dev          dev mode: Vite :5173 (hot reload) + backend :$PORT" \
        "  --setup        run the setup steps only, then stop (don't launch)" \
        "  --yes, -y      non-interactive: accept defaults, never prompt / sudo" \
        "  --help, -h     show this help" \
        "" \
        "Environment:" \
        "  ASTHRA_PORT   backend port            (default 8787)" \
        "  ASTHRA_HOST   bind address            (default 127.0.0.1; 0.0.0.0 for LAN)" \
        "  OLLAMA_URL    where Ollama is running (default http://localhost:11434)"
      exit 0 ;;
    *) printf 'Unknown option: %s   (try --help)\n' "$a" >&2; exit 2 ;;
  esac
done

INTERACTIVE=0
[ -t 0 ] && [ -t 1 ] && INTERACTIVE=1

# --------------------------------------------------------------------- ui --
if [ -t 1 ]; then
  B="$(printf '\033[1m')"; G="$(printf '\033[32m')"; R="$(printf '\033[31m')"
  Y="$(printf '\033[33m')"; D="$(printf '\033[2m')"; Z="$(printf '\033[0m')"
else
  B=""; G=""; R=""; Y=""; D=""; Z=""
fi
step() { printf '\n%s==>%s %s\n' "$B" "$Z" "$1"; }
ok()   { printf '   %s[ok]%s  %s\n' "$G" "$Z" "$1"; }
warn() { printf '   %s[!!]%s  %s\n' "$Y" "$Z" "$1"; }
err()  { printf '   %s[xx]%s  %s\n' "$R" "$Z" "$1"; }
info() { printf '      %s\n' "$1"; }

# ask_yesno "question" -> exit 0 for yes, 1 for no (empty answer = yes)
ask_yesno() {
  q="$1"
  if [ "$ASSUME_YES" = 1 ]; then
    info "$q — yes (assumed)"
    return 0
  fi
  if [ "$INTERACTIVE" = 0 ]; then
    info "$q — skipped (not an interactive terminal)"
    return 1
  fi
  printf '   %s%s%s [Y/n]: ' "$B" "$q" "$Z"
  read -r ans || ans=""
  case "$ans" in
    [Nn]*) return 1 ;;
    *) return 0 ;;
  esac
}

# -------------------------------------------------- Ollama helpers ---------
ollama_server_up() {
  python3 - "$OLLAMA_URL" <<'PY' 2>/dev/null
import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1].rstrip('/') + '/api/version', timeout=3)
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
}
ollama_installed() { command -v ollama >/dev/null 2>&1; }

model_names() {
  python3 - "$OLLAMA_URL" <<'PY' 2>/dev/null
import sys, json, urllib.request
try:
    d = json.load(urllib.request.urlopen(sys.argv[1].rstrip('/') + '/api/tags', timeout=5))
    for m in d.get('models', []):
        if m.get('name'):
            print(m['name'])
except Exception:
    pass
PY
}

wait_for_ollama() {
  i=0
  while [ "$i" -lt "$1" ]; do
    ollama_server_up && return 0
    i=$((i + 1))
    sleep 1
  done
  ollama_server_up
}

start_ollama() {
  info "Starting 'ollama serve'  (logs: $OLLAMA_LOG)"
  nohup ollama serve >"$OLLAMA_LOG" 2>&1 &
  wait_for_ollama 30
}

install_ollama() {
  if command -v brew >/dev/null 2>&1; then
    info "Trying Homebrew (brew install ollama)…"
    if brew install ollama; then
      return 0
    fi
    warn "Homebrew install failed; trying the official installer."
  fi
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://ollama.com/install.sh | sh
    return 0
  fi
  err "Neither brew nor curl is available to install Ollama."
  info "Install it from https://ollama.com/download, then re-run ./start.sh"
  return 1
}

choose_and_pull() {
  info "Pick a model to download (or type a custom Ollama model name):"
  printf '   %s 1)%s  llama3.2:3b   light & fast, runs almost anywhere   (~2 GB)\n' "$B" "$Z"
  printf '   %s 2)%s  gemma4:12b    balanced quality and size            (~7 GB)\n' "$B" "$Z"
  printf '   %s 3)%s  qwen3.8       Asthra all-rounder, tools + vision   (~17 GB)\n' "$B" "$Z"
  printf '   %s 4)%s  custom…       e.g. mistral, phi3, llama3.1\n' "$B" "$Z"
  printf '   Choose [1-4, default 1]: '
  read -r choice || choice="1"
  case "$choice" in
    "" | 1) target="llama3.2:3b" ;;
    2) target="gemma4:12b" ;;
    3) target="qwen3.8" ;;
    4)
      printf '   Model name: '
      read -r target || target=""
      if [ -z "$target" ]; then
        warn "No model name given — nothing pulled."
        return 1
      fi
      ;;
    *) target="$choice" ;;
  esac
  info "Pulling '$target' — this can take a few minutes…"
  if ollama pull "$target"; then
    ok "Installed '$target'."
  else
    warn "Pull failed. Retry later with:  ollama pull $target"
  fi
}

# =============================================================== banner ====
printf '\n%sAsthra%s — a clean, private chat for local LLMs (Ollama)\n' "$B" "$Z"

# -------------------------------------------------------- 1. python ========
step "1/5  Python backend"
if ! command -v python3 >/dev/null 2>&1; then
  err "python3 not found. Install Python 3.8+ (e.g. 'sudo apt install python3 python3-pip'), then re-run."
  exit 1
fi
if python3 -c "import fastapi, uvicorn, httpx" 2>/dev/null; then
  ok "backend dependencies present"
else
  info "Installing backend dependencies…"
  if python3 -m pip install -r backend/requirements.txt; then
    ok "backend dependencies installed"
  else
    err "Could not install backend dependencies (see backend/requirements.txt)."
    exit 1
  fi
fi

# ------------------------------------------------------ 2. frontend dep ====
step "2/5  Frontend (Node.js)"
if command -v node >/dev/null 2>&1; then
  if [ ! -d frontend/node_modules ]; then
    info "Installing npm dependencies…"
    (cd frontend && npm install --no-audit --no-fund)
  fi
  ok "node $(node --version 2>/dev/null) present"
else
  if [ -d frontend/dist ]; then
    warn "node not found, but a prebuilt frontend/dist exists — OK to continue."
  else
    err "node/npm not found and no frontend/dist. Install Node 18+ to build the UI."
    exit 1
  fi
fi

# ----------------------------------------------------------- 3. ollama =====
step "3/5  Ollama (local model runtime)"
if ollama_server_up; then
  ok "Ollama is running at $OLLAMA_URL"
elif ollama_installed; then
  info "Ollama is installed but not running — starting it (local prerequisite)…"
  if start_ollama; then
    ok "Ollama is up"
  else
    warn "Ollama is still starting — check $OLLAMA_LOG"
  fi
else
  warn "Ollama was not found on this system."
  if ask_yesno "Install Ollama now? (this may ask for your password)"; then
    if install_ollama; then
      hash -r 2>/dev/null || true
      if start_ollama; then
        ok "Ollama is up"
      else
        warn "Ollama is still starting — check $OLLAMA_LOG"
      fi
    fi
  fi
fi

if ! ollama_server_up; then
  err "Ollama is not reachable at $OLLAMA_URL."
  info "Start it ('ollama serve') or point OLLAMA_URL at a running instance, then re-run."
  exit 1
fi

# ---------------------------------------------------------------- 4. model =
step "4/5  Model"
count="$(model_names | grep -c . || true)"
if [ "${count:-0}" -ge 1 ] 2>/dev/null; then
  ok "Found $count model(s) you can chat with:"
  model_names | while IFS= read -r n; do
    if [ -n "$n" ]; then
      info "  • $n"
    fi
  done
  info "You can switch models anytime in the app (bottom-left corner)."
  if [ "$INTERACTIVE" = 1 ] && [ "$ASSUME_YES" = 0 ]; then
    if ask_yesno "Download another model now?"; then
      choose_and_pull
    fi
  fi
else
  warn "No models are installed yet — you'll need at least one to chat."
  if [ "$INTERACTIVE" = 1 ] || [ "$ASSUME_YES" = 1 ]; then
    choose_and_pull
  else
    info "Non-interactive: skipped. Grab one later with:  ollama pull <name>"
  fi
fi

# ------------------------------------------------------------ 5. build =====
step "5/5  Frontend build"
if [ -d frontend/dist ]; then
  ok "frontend/dist present (serving the prebuilt UI)"
elif command -v node >/dev/null 2>&1; then
  info "Building the frontend (first run)…"
  if (cd frontend && npm run build); then
    ok "frontend built"
  else
    warn "Frontend build failed. The API will still run; fix the build and re-run."
  fi
else
  warn "No node to build the frontend. The API will run without the web UI."
fi

# ----------------------------------------------------------------- summary =
printf '\n%sSetup complete.%s\n' "$B" "$Z"
if [ "$SETUP_ONLY" = 1 ]; then
  info "Stopped here (--setup). Launch with './start.sh' whenever you're ready."
  exit 0
fi

# ------------------------------------------------------------- launch ======
BACKEND_PID=""
FRONT_PID=""
cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null
  return 0
}
trap cleanup EXIT INT TERM

if [ "$DEV" = 1 ]; then
  step "Launching (dev mode)"
  info "Backend  →  http://localhost:$PORT"
  info "Frontend →  http://localhost:5173   (Vite hot reload)"
  info "Open the frontend URL above.  Ctrl-C to stop both."
  python3 backend/main.py &
  BACKEND_PID=$!
  (cd frontend && npm run dev) &
  FRONT_PID=$!
  wait
else
  step "Launching"
  info "Open http://localhost:$PORT in your browser.  Ctrl-C to stop."
  exec python3 backend/main.py
fi
