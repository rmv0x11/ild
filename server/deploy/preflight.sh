#!/usr/bin/env bash
# Run locally OR on target with `bash preflight.sh`.
# Read-only diagnostics: no mutating actions, safe to run alongside VPN.
set -u

echo "== preflight =="

# Go toolchain
if command -v go &>/dev/null; then
  go version
elif [ -x /snap/bin/go ]; then
  /snap/bin/go version
else
  echo "  go: NOT FOUND"
fi

echo -n "  systemd: "; command -v systemctl &>/dev/null && echo OK || echo "MISSING"
echo -n "  cloudflared: "
if command -v cloudflared &>/dev/null; then
  cloudflared --version | head -1
else
  echo "NOT INSTALLED"
fi

echo -n "  disk free at /home: "; df -h /home 2>/dev/null | tail -1 | awk '{print $4}'

echo "  listeners on :80/443/8787:"
ss -lntp 2>/dev/null | grep -E ':(80|443|8787)\s' || echo "    none"

echo -n "  ild-server unit: "; systemctl is-enabled ild-server 2>/dev/null || echo not-installed
echo -n "  cloudflared unit: "; systemctl is-enabled cloudflared 2>/dev/null || echo not-installed

echo "== done =="
