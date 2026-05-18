# Cloudflare Tunnel setup for ild-server

Cloudflare Tunnel (cloudflared) keeps the host firewall closed: the daemon
makes an **outbound-only** connection to Cloudflare's edge and proxies
incoming HTTPS traffic to `http://127.0.0.1:8787`. No ports 80/443 need to
be opened — important on this box because VPN already lives there.

## 1. Install the binary

```bash
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

## 2. Authenticate

Two options — pick one.

### Option A: browser login (interactive)

```bash
cloudflared tunnel login
```

This prints a URL to open in a browser **on the host**. Since this server
is headless, copy-paste the URL into the browser on your laptop while
logged in to the same Cloudflare account. The certificate is saved to
`~/.cloudflared/cert.pem`.

### Option B: tunnel token (headless, recommended)

1. Create the tunnel in the Cloudflare dashboard:
   *Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared*.
2. Copy the **tunnel token** Cloudflare gives you.
3. Either use that token directly via `cloudflared service install <TOKEN>`
   (auto-creates a systemd unit), **or** continue with steps 3–6 below to
   use the explicit `config.yml` flow.

## 3. Create the tunnel (only for Option A or config.yml flow)

```bash
cloudflared tunnel create ild
```

Note the tunnel UUID printed at the end. A credentials JSON file is
written to `~/.cloudflared/<UUID>.json`.

## 4. Move credentials to the system location

```bash
sudo mkdir -p /etc/cloudflared
sudo install -m 0600 ~/.cloudflared/<UUID>.json /etc/cloudflared/<UUID>.json
```

## 5. Write the config

Copy the template from this repo and substitute the placeholders:

```bash
sudo install -m 0644 \
  /home/rmv/ild/server/deploy/cloudflared.example.yml \
  /etc/cloudflared/config.yml
sudo $EDITOR /etc/cloudflared/config.yml
# replace <TUNNEL_UUID> and <YOUR_HOSTNAME>
```

## 6. Route DNS

```bash
cloudflared tunnel route dns ild <YOUR_HOSTNAME>
```

This creates a proxied CNAME record `<YOUR_HOSTNAME> → <UUID>.cfargotunnel.com`
in your Cloudflare zone.

## 7. Install the systemd unit and start

Either let cloudflared install its own unit:

```bash
sudo cloudflared service install
```

Or copy the example unit from this repo (lets you tweak the resource
limits):

```bash
sudo install -m 0644 \
  /home/rmv/ild/server/deploy/cloudflared.service \
  /etc/systemd/system/cloudflared.service
sudo useradd -r -s /usr/sbin/nologin cloudflared || true
sudo chown -R cloudflared:cloudflared /etc/cloudflared
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
systemctl status cloudflared
journalctl -u cloudflared -n 50 --no-pager
```

## 8. Verify

```bash
# From your laptop:
curl -I https://<YOUR_HOSTNAME>/health
# Should return 200 (or whatever ild-server returns for /health) over HTTPS,
# with TLS terminated by Cloudflare.
```

## Notes on coexistence with VPN

- cloudflared is outbound-only — it does **not** bind 80/443 on the host.
- The example unit caps memory at 64M and CPU at 5% so it can't starve VPN.
- Do not run `cloudflared tunnel ingress validate` from a script that
  reloads the daemon unexpectedly; verify by hand and restart the unit
  explicitly.
