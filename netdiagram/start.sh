#!/usr/bin/env bash
# NetDiagram — Start all services
# Usage: bash start.sh [stop]
#
# Backend  → http://localhost:3000  (API + serves built frontend)
# Frontend → http://localhost:3000/  (same server — no separate process needed)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
NODE="/Users/audreymorgan/n/bin/node"
BACKEND_LOG="/tmp/nd-backend.log"
PID_FILE="/tmp/nd-pids"

stop_all() {
  echo "Stopping NetDiagram services..."
  if [[ -f "$PID_FILE" ]]; then
    while IFS= read -r pid; do
      kill -9 "$pid" 2>/dev/null && echo "  Killed PID $pid"
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  pkill -9 -f "node.*nd-backend\|node.*dist/main" 2>/dev/null || true
  echo "Done."
}

build_all() {
  echo "Building frontend..."
  cd "$FRONTEND_DIR"
  "$NODE" node_modules/.bin/vite build 2>&1 | tail -4
  echo "Compiling backend..."
  cd "$BACKEND_DIR"
  "$NODE" node_modules/.bin/tsc -p tsconfig.json 2>&1 | head -5
  echo "Build complete."
}

if [[ "$1" == "stop" ]]; then
  stop_all
  exit 0
fi

if [[ "$1" == "build" ]]; then
  build_all
  exit 0
fi

# Stop any existing processes first
stop_all
sleep 1

echo ""
echo "Starting NetDiagram..."
echo "  Single server → http://localhost:3000"
echo "  (API + static frontend served by NestJS)"
echo ""

# Start backend (serves frontend too) — fully detached from terminal
cd "$BACKEND_DIR"
nohup "$NODE" dist/main.js >"$BACKEND_LOG" 2>&1 &
BPID=$!
disown "$BPID"
echo "$BPID" > "$PID_FILE"
echo "  ✓ Server started (PID $BPID)"

sleep 8

echo ""
echo "=== Checking port ==="
lsof -i :3000 2>/dev/null | grep LISTEN

echo ""
echo "=== Health check ==="
curl -s -o /dev/null -w "  API   /graph → HTTP %{http_code}\n" http://localhost:3000/graph
curl -s -o /dev/null -w "  UI    /      → HTTP %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "  Asset /assets → HTTP %{http_code}\n" \
  "http://localhost:3000/assets/$(ls "$FRONTEND_DIR/dist/assets/" | grep "^index" | head -1)"

echo ""
echo "✅ NetDiagram is ready!"
echo "   Open: http://localhost:3000"
echo ""
echo "   Log:  tail -f $BACKEND_LOG"
echo "   Stop: bash $0 stop"
echo "   Rebuild: bash $0 build && bash $0"
