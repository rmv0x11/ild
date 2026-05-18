#!/usr/bin/env bash
# Run on the target host (`magna.com`) as user rmv after `git pull`.
# This script:
#   1. Builds the Go binary into ./bin/ild-server (static, no CGO).
#   2. Creates ~/ild-server/{bin,data} layout.
#   3. Copies the systemd unit to /etc/systemd/system (needs sudo).
#   4. Does NOT start the service — review .env first, then `systemctl start`.
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)
TARGET=/home/rmv/ild-server

echo "[install] building ild-server (CGO_ENABLED=0)…"
cd "$HERE"
CGO_ENABLED=0 /snap/bin/go build -trimpath -ldflags="-s -w" -o bin/ild-server ./

mkdir -p "$TARGET/bin" "$TARGET/data"
install -m 0755 bin/ild-server "$TARGET/bin/ild-server"

if [ ! -f "$TARGET/.env" ]; then
  install -m 0600 deploy/.env.example "$TARGET/.env"
  echo "[install] created $TARGET/.env from example — EDIT IT BEFORE STARTING"
fi

sudo install -m 0644 deploy/ild-server.service /etc/systemd/system/ild-server.service
sudo systemctl daemon-reload

echo "[install] done. Next: edit $TARGET/.env, then:"
echo "  sudo systemctl enable --now ild-server"
echo "  systemctl status ild-server"
echo "  journalctl -u ild-server -f"
