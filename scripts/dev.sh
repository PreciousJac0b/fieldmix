#!/usr/bin/env bash
# Start the FastAPI backend on :8000 and Vite on :5173 (LAN-visible, /api proxied).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -x "$ROOT/server/.venv/bin/uvicorn" ]; then
  echo "Missing server venv. Run: python3.12 -m venv server/.venv && server/.venv/bin/pip install -r server/requirements.txt" >&2
  exit 1
fi
if [ ! -d "$ROOT/web/node_modules" ]; then
  echo "Missing web deps. Run: (cd web && npm install)" >&2
  exit 1
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$ROOT/server" && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &
(cd "$ROOT/web" && npm run dev) &

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo "Backend:  http://localhost:8000/api/health"
echo "Web:      http://localhost:5173"
[ -n "${LAN_IP:-}" ] && echo "Phone:    http://$LAN_IP:5173"
wait
