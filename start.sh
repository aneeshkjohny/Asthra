#!/bin/sh
# Asthra — one-command launcher.
# POSIX-sh compatible: works under dash, bash, or `./start.sh`.
#
#   ./start.sh          -> build frontend if needed, serve everything on :8787
#   ./start.sh --dev    -> Vite dev server on :5173 (HMR) + backend on :8787
set -eu
cd "$(dirname "$0")"

PORT="${ASTHRA_PORT:-8787}"
BACKEND_PID=""
FRONT_PID=""

cleanup() {
  if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [ -n "$FRONT_PID" ]; then kill "$FRONT_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

# 1. Backend deps (skip if already present)
if ! python3 -c "import fastapi, uvicorn, httpx" 2>/dev/null; then
  echo "==> Installing Python deps"
  pip install -r backend/requirements.txt
fi

# 2. Frontend deps (skip if already present)
if [ ! -d frontend/node_modules ]; then
  echo "==> Installing npm deps"
  (cd frontend && npm install --no-audit --no-fund)
fi

if [ "${1:-}" = "--dev" ]; then
  echo "==> Dev mode: backend on :$PORT  +  Vite on :5173 (hot reload)"
  echo "    Open http://localhost:5173   (Ctrl-C to stop both)"
  python3 backend/main.py &
  BACKEND_PID=$!
  (cd frontend && npm run dev) &
  FRONT_PID=$!
  wait
else
  echo "==> Building frontend (if needed)"
  if [ ! -d frontend/dist ]; then
    (cd frontend && npm run build)
  fi
  echo "==> Starting Asthra on http://localhost:$PORT"
  echo "    Open it in your browser.  Ctrl-C to stop."
  exec python3 backend/main.py
fi
