# Deploying `ild-server` to `magna.com` (Ubuntu 24.04)

Target: `rmv@77.83.87.234` (alias `magna.com`). The host already runs
**VPN services** — the ild-server deployment must coexist quietly:
- Bind only on `127.0.0.1:8787`, never on a public port.
- systemd unit caps memory at 128M, CPU at 15%, `Nice=10`.
- Public access goes through **Cloudflare Tunnel** (outbound-only) — no
  changes to iptables, no nginx, no port 80/443 listeners.

This `deploy/` directory contains everything needed for the rollout, but
the rollout itself is manual on purpose. Follow the steps below.

---

## 0. Pre-flight (read-only)

```bash
bash deploy/preflight.sh
```

Confirms Go, systemd, cloudflared presence, disk space, current listeners,
and existing ild-server unit state. Mutates nothing.

---

## 1. Things to create **by hand** before deploy

These produce secrets that must never be committed.

### 1.1 `COOKIE_SECRET`

Generate locally and paste into `.env` on the server:

```bash
openssl rand -base64 48
```

### 1.2 Google OAuth (optional, leave blank to disable)

1. Open https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web application.
3. Authorized redirect URI: `${BASE_URL}/api/v1/auth/google/callback`
   (e.g. `https://ild-api.example.com/api/v1/auth/google/callback`).
4. Save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for the `.env`.

### 1.3 SMTP for magic-link email (optional)

If `MAILER_MODE=stdout` (default) the magic links are logged to the
journal — fine for testing. For real email, pick a free provider:

- https://resend.com (free tier 3k emails/month)
- https://mailtrap.io (sandbox)

Fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in
the `.env` and set `MAILER_MODE=smtp`.

### 1.4 Cloudflare Tunnel + DNS

See [cloudflared-setup.md](./cloudflared-setup.md). Summary:

1. Sign in to Cloudflare → Zero Trust → Networks → Tunnels.
2. Create a tunnel named `ild` (or via CLI `cloudflared tunnel create ild`).
3. Add a public hostname (e.g. `ild-api.example.com`) pointing at
   `http://127.0.0.1:8787`. Cloudflare creates the proxied DNS record.
4. Save the credentials JSON / token for the host.

Set `BASE_URL=https://ild-api.example.com` in the `.env` to match.

---

## 2. Clone and install on the server

SSH in as `rmv`:

```bash
ssh rmv@77.83.87.234
```

Then on the server:

```bash
git clone https://github.com/rmv0x11/ild ~/ild
cd ~/ild/server
bash deploy/install.sh
```

`install.sh` is idempotent:
- Always rebuilds the binary into `~/ild/server/bin/ild-server` and
  installs it to `/home/rmv/ild-server/bin/ild-server`.
- Creates `/home/rmv/ild-server/{bin,data}` if missing.
- Copies `.env.example` → `/home/rmv/ild-server/.env` **only** if the
  `.env` does not exist yet (your edits are preserved on re-runs).
- Re-installs `/etc/systemd/system/ild-server.service` (idempotent — same
  bytes each time) and runs `daemon-reload`.
- Never starts or restarts the service. You do that explicitly.

---

## 3. Configure and start

```bash
# 1. Edit the env file (cookie secret, BASE_URL, OAuth, SMTP, etc.).
sudo $EDITOR /home/rmv/ild-server/.env
chmod 600 /home/rmv/ild-server/.env

# 2. Enable and start.
sudo systemctl enable --now ild-server

# 3. Verify.
systemctl status ild-server
journalctl -u ild-server -n 200 -f

# 4. Confirm it bound on loopback only.
ss -lntp | grep 8787   # should show 127.0.0.1:8787 LISTEN
```

Then start `cloudflared` per [cloudflared-setup.md](./cloudflared-setup.md)
and hit `https://<YOUR_HOSTNAME>/` from the public internet.

---

## 4. Update flow

```bash
cd ~/ild
git pull
cd server
bash deploy/install.sh
sudo systemctl restart ild-server
journalctl -u ild-server -n 100 --no-pager
```

If `deploy/ild-server.service` changes you also need
`sudo systemctl daemon-reload` (install.sh already runs it).

---

## 5. Logs and observability

```bash
journalctl -u ild-server -n 200 -f          # follow
journalctl -u ild-server --since "1h ago"   # last hour
journalctl -u ild-server -p err              # errors only
systemctl status ild-server                  # quick health + resource use
systemctl show ild-server -p MemoryCurrent,CPUUsageNSec
```

---

## 6. Backups

SQLite is single-file at `/home/rmv/ild-server/data/ild.db`. Use the
SQLite-native online backup so concurrent writes aren't corrupted:

```bash
sqlite3 /home/rmv/ild-server/data/ild.db ".backup /tmp/ild.bak.db"
gzip /tmp/ild.bak.db
```

Optionally pull to your laptop:

```bash
rsync -avz rmv@77.83.87.234:/tmp/ild.bak.db.gz ./backups/
```

A simple cron entry on the server (every 6h, keep last 28):

```cron
0 */6 * * * sqlite3 /home/rmv/ild-server/data/ild.db ".backup /home/rmv/ild-server/data/ild.bak.db" && mv /home/rmv/ild-server/data/ild.bak.db /home/rmv/ild-server/data/ild.bak.$(date +\%Y\%m\%d-\%H).db && ls -1t /home/rmv/ild-server/data/ild.bak.*.db | tail -n +29 | xargs -r rm
```

---

## 7. What NOT to touch

The same machine hosts **VPN services**. Treat its network and resource
budget as a shared, fragile resource.

- **Do not** edit `iptables`, `nftables`, or `ufw`. The VPN owns the
  network filter chain; even adding a "harmless" rule can change packet
  ordering and break clients.
- **Do not** bind ild-server (or anything else added by this deploy) on
  `0.0.0.0:*` or on ports 80/443. Loopback only — Cloudflare Tunnel
  handles ingress.
- **Do not** install Docker. The VPN stack is bare-metal; Docker would
  add another bridge interface and another iptables consumer.
- **Do not** install nginx/caddy/traefik to "front" the service —
  cloudflared replaces all of that and is outbound-only.
- **Do not** raise the systemd resource limits in `ild-server.service`
  (`MemoryMax=128M`, `CPUQuota=15%`, `Nice=10`) without explicit user
  approval. They exist so a runaway request handler can't starve VPN
  worker threads.
- **Do not** run heavy maintenance (large `git clone`, big builds,
  `apt upgrade`) at peak VPN usage — be polite with CPU.
- **Do not** modify the VPN units (`systemctl status` is fine; `restart`
  and `mask` are not).
