# Obsidian Vault Manager

Manage Obsidian vaults on a Synology NAS directly from the Claude iOS app. Two MCP servers (one per vault) expose filesystem tools over the MCP protocol, tunneled through Cloudflare to claude.ai. Obsidian Headless Sync keeps vaults on the NAS in sync with Obsidian Cloud — no Mac required as an intermediary.

## Architecture

```
Claude iOS / claude.ai  (your Max Plan)
        │
        │  HTTPS  (MCP Streamable HTTP)
        ▼
  Cloudflare Edge  (TLS, tunnel routing)
        │
        │  Cloudflare Tunnel
        ▼
┌──── cloudflared (Docker) ──────────────────────┐
│  audrey-vault.yourdomain.com → mcp-audrey:3001 │
│  taylor-vault.yourdomain.com → mcp-taylor:3002 │
└────────────────────────────────────────────────┘
        │                    │
   mcp-audrey            mcp-taylor
   /vault (audrey)       /vault (taylor)
        │                    │
  obsidian-sync-audrey   obsidian-sync-taylor
  (obsidian-headless)    (obsidian-headless)
        │                    │
        └── Obsidian Cloud ──┘
                 │
     Mac / iPhone (native Obsidian Sync)
```

**Services:**

| Container | Purpose |
|-----------|---------|
| `obsidian-sync-audrey` | Syncs Audrey's vault from Obsidian Cloud to NAS |
| `obsidian-sync-taylor` | Syncs Taylor's vault from Obsidian Cloud to NAS |
| `mcp-audrey` | MCP server scoped to Audrey's vault |
| `mcp-taylor` | MCP server scoped to Taylor's vault |
| `cloudflared` | Cloudflare Tunnel — exposes both MCP servers over HTTPS |

> **No Mac-side services needed.** Native Obsidian Sync handles Mac and iPhone devices automatically.

## Security Model

The vault data is protected by several layers:

- **Cloudflare Tunnel** — the MCP servers are not exposed to the public internet. Traffic routes through an encrypted Cloudflare Tunnel, which terminates TLS at the Cloudflare edge. No ports are opened on your router or firewall.
- **Localhost-only ports** — MCP ports (3001, 3002) are bound to `127.0.0.1` on the NAS. They are not reachable from other devices on the LAN.
- **Vault isolation** — each MCP container mounts only its own vault directory. Even if the path validation in `server.js` had a bug, one vault's MCP server cannot access the other vault's files.
- **Path traversal protection** — all file paths are resolved and validated against the vault root before any filesystem operation. Requests that attempt to escape the vault directory are rejected.
- **Non-root containers** — all containers (sync and MCP) run as `user: 1026:100`, matching the Synology NAS user. No container runs as root.
- **Resource limits** — each container has memory and CPU limits to prevent a runaway process from starving other NAS services.
- **Optional: Cloudflare Access** — for additional authentication, you can add Cloudflare Access policies that require email verification before allowing traffic through the tunnel (see [Cloudflare Access](#optional-cloudflare-access)).

**Known limitations:**
- The MCP endpoints have no application-level authentication. Security relies on the Cloudflare Tunnel being the only ingress path. Enabling Cloudflare Access is strongly recommended for production use.
- Both vaults share a single Obsidian account/password. If per-vault credentials are needed, update `.env` and `docker-compose.yml` to use separate variables.
- Obsidian credentials are passed as CLI arguments to `ob login`, which makes them visible in process listings (`ps aux`) inside the container.

## Prerequisites

- Synology NAS (DS920+ or similar) with Docker / Container Manager
- A domain managed by Cloudflare DNS (free tier works)
- A Cloudflare account (free)
- Claude Pro or Max subscription
- Obsidian Sync Plus subscription (single account, supports up to 10 vaults)

## 1. NAS Folder Setup

```bash
# SSH into your NAS
sudo mkdir -p /volume1/obsidian/{audrey-vault,taylor-vault}

# Set ownership to your NAS user (typically UID 1026, GID 100 on Synology)
sudo chown -R 1026:100 /volume1/obsidian

# Set permissions — 775 on the parent, 770 on vault directories
sudo chmod 775 /volume1/obsidian
sudo chmod 770 /volume1/obsidian/audrey-vault /volume1/obsidian/taylor-vault
```

> **Why this matters:** All containers run as `user: "1026:100"` (matching your Synology NAS user). Both the parent directory and vault subdirectories must be owned and traversable by UID 1026 — otherwise MCP tool calls and sync writes will fail with `EACCES: permission denied`. See [Troubleshooting → Permission denied](#permission-denied-eacces-from-mcp-tools) for details.

## 2. Obsidian Sync Setup

A single [Obsidian Sync Plus](https://obsidian.md/sync) subscription covers both vaults (up to 10). The vaults must already exist in Obsidian Sync — create them from the Obsidian desktop or mobile app first, then the headless containers will pull them down to the NAS automatically.

No additional configuration is needed beyond the `.env` file. The containers handle login, vault setup, and continuous sync on startup.

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `CLOUDFLARE_TUNNEL_TOKEN` — from Cloudflare Zero Trust dashboard (see Step 3)
- `OBSIDIAN_EMAIL` / `OBSIDIAN_PASSWORD` — your Obsidian account credentials
- `AUDREY_VAULT_NAME` / `TAYLOR_VAULT_NAME` — vault names exactly as they appear in Obsidian Sync (case-sensitive)
- `ENCRYPTION_PASSWORD` — only if E2EE is enabled on the vaults (optional)

> **That's it.** The `entrypoint.sh` in each sync container runs `ob login`, `ob sync-setup`, and `ob sync --continuous` automatically using these credentials. Login failures are retried up to 5 times with exponential backoff to avoid account lockout.

## 3. Cloudflare Tunnel Setup

### Create the Tunnel

1. Log in to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. Go to **Networks → Tunnels**
3. Click **Create a tunnel** → select **Cloudflared** connector
4. Name it (e.g., `obsidian-vault`)
5. Copy the **tunnel token** — paste it into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`

### Configure Public Hostnames

In the tunnel config on the dashboard, add two public hostnames:

| Public Hostname | Service |
|-----------------|---------|
| `audrey-vault.yourdomain.com` | `http://mcp-audrey:3001` |
| `taylor-vault.yourdomain.com` | `http://mcp-taylor:3002` |

Cloudflare creates DNS CNAME records automatically, each pointing to `<tunnel-id>.cfargotunnel.com`.

### Rebuilding or Replacing a Tunnel

If you ever delete a tunnel and create a new one (e.g., to rotate the token), the new tunnel gets a **new UUID** — but the existing DNS CNAME records still point to the old tunnel ID. This causes **Cloudflare Error 1033** ("Argo Tunnel error") because the CNAME routes traffic to a tunnel that no longer exists.

**To fix after a tunnel rebuild:**

1. Go to **Cloudflare dashboard → DNS → Records** for your domain
2. Find the CNAME records for your MCP hostnames (e.g., `audrey-vault`, `taylor-vault`)
3. Each will point to something like `old-tunnel-id.cfargotunnel.com`
4. Update both records to point to `new-tunnel-id.cfargotunnel.com`
5. The new tunnel ID is visible in **Zero Trust → Networks → Tunnels** — click the tunnel name to see its ID

Alternatively, delete the old CNAME records and re-add the public hostnames in the new tunnel's configuration — Cloudflare will create fresh CNAME records automatically.

> **Tip:** If you only need to rotate the token (not rebuild the tunnel), use the **Regenerate token** button in the tunnel settings. This keeps the same tunnel ID and DNS records — just update `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and restart cloudflared.

### Optional: Cloudflare Access

For extra security, add Access policies under **Access → Applications**:
- Create a self-hosted app for each hostname
- Add an Allow rule by email address
- Users authenticate with a one-time email code

> **Note:** Cloudflare Access may add an interstitial page that interferes with the MCP handshake. Test before relying on it. Consider using [Service Auth tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/) as an alternative that works cleanly with programmatic clients.

## 4. Deploy

```bash
# Clone to your NAS
cd /volume1/docker
git clone https://github.com/youruser/obsidian-vault-manager.git
cd obsidian-vault-manager

# Ensure NAS directories exist with correct permissions (see Step 1)

# Copy and fill in environment variables (see Step 2)
cp .env.example .env
# Edit .env with your credentials

# Build and start
sudo docker compose up -d --build

# Verify all containers are healthy
sudo docker ps

# Check sync logs
sudo docker logs obsidian-sync-audrey --tail 20
sudo docker logs obsidian-sync-taylor --tail 20

# Check Cloudflare tunnel connection
sudo docker logs obsidian-cloudflared --tail 10
# Look for: "INF Connection established"

# Test health endpoints (localhost only)
curl http://localhost:3001/health
curl http://localhost:3002/health
```

> **Private repo?** If the GitHub repo is private, use a [personal access token](https://github.com/settings/tokens) in the clone URL:
> ```bash
> git clone https://<your-token>@github.com/youruser/obsidian-vault-manager.git
> ```

## 5. Register Connectors in Claude

### Audrey's Connector

1. Go to [claude.ai](https://claude.ai) → profile icon → **Settings → Connectors**
2. Click **Add custom connector**
3. Enter URL: `https://audrey-vault.yourdomain.com/mcp`
4. Leave authentication blank (authless — Cloudflare Tunnel handles security)
5. Click **Add** — Claude discovers the vault tools automatically

### Taylor's Connector

Repeat with URL: `https://taylor-vault.yourdomain.com/mcp`

> Each person should add **only their own** connector in their own claude.ai account.

## 6. iPhone & Mac Access

**iPhone:** Connectors configured on claude.ai sync automatically to the Claude iOS app. Open the Claude app and your vault tools are available.

**Obsidian Sync:** Enable Obsidian Sync in the Obsidian app on your Mac and iPhone. Vaults sync automatically between all devices and the NAS — no additional setup needed.

## MCP Tools Available

Each vault server exposes these tools to Claude:

| Tool | Description |
|------|-------------|
| `list_directory` | List files and folders (relative path or root) |
| `read_file` | Read a file's contents |
| `write_file` | Create or overwrite a file |
| `delete_file` | Delete a file |
| `search_files` | Search by filename (case-insensitive) |
| `create_directory` | Create a folder (with parents) |

All paths are relative to the vault root. Path traversal is blocked.

## Local Ports

| Port | Service | Purpose |
|------|---------|---------|
| 3001 | mcp-audrey | Audrey's MCP server (localhost only) |
| 3002 | mcp-taylor | Taylor's MCP server (localhost only) |

## Testing Locally

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test before connecting to claude.ai:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL: http://localhost:3001/mcp
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel token from Cloudflare Zero Trust dashboard |
| `OBSIDIAN_EMAIL` | Obsidian account email |
| `OBSIDIAN_PASSWORD` | Obsidian account password |
| `AUDREY_VAULT_NAME` | Audrey's vault name in Obsidian Sync |
| `TAYLOR_VAULT_NAME` | Taylor's vault name in Obsidian Sync |
| `ENCRYPTION_PASSWORD` | Vault E2EE password (optional) |

## Updating

To pull changes and redeploy:

```bash
cd /volume1/docker/obsidian-vault-manager
git pull
sudo docker compose up -d --build
```

Docker will rebuild only the images that changed. Vault data on the NAS is unaffected.

## Backup

The `delete_file` MCP tool is irreversible, and sync bugs could propagate deletions. Protect your vault data with one of these approaches:

- **Btrfs snapshots** (recommended for DS920+): Enable scheduled snapshots on the `/volume1/obsidian` shared folder via DSM → Snapshot Replication. Snapshots are instant and space-efficient.
- **Hyper Backup**: Schedule daily backups of `/volume1/obsidian` to an external drive or cloud target.
- **Obsidian Sync version history**: Obsidian Sync retains file version history (up to 12 months on Plus plans), which can recover individual file deletions from the Obsidian app.

## Teardown

To stop and remove all containers:

```bash
cd /volume1/docker/obsidian-vault-manager
sudo docker compose down
```

This stops containers and removes the Docker network. Vault data in `/volume1/obsidian/` is **not** deleted.

To fully clean up:
1. Delete the tunnel in Cloudflare Zero Trust → Networks → Tunnels
2. Remove DNS CNAME records for the MCP hostnames
3. Remove connectors from claude.ai → Settings → Connectors
4. Optionally remove vault data: `sudo rm -rf /volume1/obsidian`

## Troubleshooting

### Sync container won't start / restart loop

```bash
sudo docker logs obsidian-sync-audrey --tail 30
```
- `OBSIDIAN_EMAIL is required` → check `.env` has the credential variables set
- `Login failed after 5 attempts` → verify email/password, check if MFA is required on the account
- Vault not found → run `ob sync-list-remote` locally to confirm the vault name

### MCP servers won't start

The MCP containers depend on sync containers being healthy (`depends_on: condition: service_healthy`). Check the sync logs first — MCP services wait until sync is running and healthy before starting.

If a large vault takes longer than expected for the initial sync, the MCP container may time out waiting. The `start_period: 120s` in the sync container healthcheck should cover most vaults, but you can increase it in `docker-compose.yml` if needed.

### Cloudflare Error 1033 (tunnel ID mismatch)

If you see **Error 1033** ("Argo Tunnel error") when hitting your MCP URLs, the DNS CNAME records are pointing to an old tunnel ID. This happens when you delete and recreate a tunnel — the new tunnel gets a new UUID but the CNAME records still reference the old one.

**Fix:**
1. Go to **Cloudflare dashboard → DNS → Records** for your domain
2. Find the CNAME records for your MCP hostnames (e.g., `audrey-vault`, `taylor-vault`)
3. Update each CNAME target from `old-tunnel-id.cfargotunnel.com` to `new-tunnel-id.cfargotunnel.com`
4. Find the new tunnel ID in **Zero Trust → Networks → Tunnels** — click the tunnel name

See [Rebuilding or Replacing a Tunnel](#rebuilding-or-replacing-a-tunnel) for details.

### Cloudflared stops after startup

The `start_period: 30s` healthcheck gives it time to establish the tunnel. Check logs:
```bash
sudo docker logs obsidian-cloudflared --tail 20
```
Look for `INF Connection established` — this confirms the tunnel is connected. A `ERR` line with `failed to connect` usually means the token is wrong or expired.

### Permission denied (EACCES) from MCP tools

If Claude discovers your vault tools but tool execution fails with `EACCES: permission denied, scandir '/vault'`, the MCP container can't read the vault files on disk.

All containers run as `user: "1026:100"` (set in `docker-compose.yml`) to match the default Synology NAS user. They mount the vault directory as `/vault` inside the container. The vault directories must be owned by 1026:100.

**Fix:**
```bash
sudo chown -R 1026:100 /volume1/obsidian
sudo chmod 775 /volume1/obsidian
sudo chmod -R 770 /volume1/obsidian/audrey-vault /volume1/obsidian/taylor-vault
sudo docker compose restart mcp-audrey mcp-taylor
```

**Verify from inside the container:**
```bash
# Confirm the process runs as 1026
sudo docker exec obsidian-mcp-audrey id
# Expected: uid=1026 gid=100(users)

# Confirm the vault is readable
sudo docker exec obsidian-mcp-audrey ls -la /vault/
```

> **Synology ACL note:** Synology DSM uses POSIX ACLs that can override standard Unix permissions. If `chown`/`chmod` alone doesn't fix it, the ACLs may be blocking access. Running `chmod` on Synology typically resets the ACLs to match, but if issues persist, check ACLs via DSM → Control Panel → Shared Folder → Permissions.

### Files not syncing

- Verify Obsidian Sync is enabled and working on your Mac/iPhone first
- Check sync container logs for errors
- Ensure the vault name in `.env` matches the vault name in Obsidian exactly (case-sensitive)
