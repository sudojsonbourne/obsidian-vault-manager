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
   /vaults/audrey-vault  /vaults/taylor-vault
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

## Prerequisites

- Synology NAS (DS920+ or similar) with Docker / Container Manager
- A domain managed by Cloudflare DNS (free tier works)
- A Cloudflare account (free)
- Claude Pro or Max subscription
- Obsidian Sync subscription (one per account — Audrey and Taylor each need one)

## 1. NAS Folder Setup

```bash
# SSH into your NAS
mkdir -p /volume1/obsidian/audrey-vault
mkdir -p /volume1/obsidian/taylor-vault
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `CLOUDFLARE_TUNNEL_TOKEN` — from Cloudflare Zero Trust dashboard
- `OBSIDIAN_EMAIL_AUDREY` / `OBSIDIAN_PASSWORD_AUDREY` — Audrey's Obsidian account
- `OBSIDIAN_EMAIL_TAYLOR` / `OBSIDIAN_PASSWORD_TAYLOR` — Taylor's Obsidian account
- `AUDREY_VAULT_NAME` / `TAYLOR_VAULT_NAME` — vault names as they appear in Obsidian Sync
- `*_ENCRYPTION_PASSWORD` — only if E2EE is enabled on the vault (optional)

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

Cloudflare creates DNS records automatically.

### Optional: Cloudflare Access

For extra security, add Access policies under **Access → Applications**:
- Create a self-hosted app for each hostname
- Add an Allow rule by email address
- Users authenticate with a one-time email code

> **Note:** Cloudflare Access may add an interstitial page that interferes with the MCP handshake. Test before relying on it. The tunnel URL alone is unguessable and not indexed.

## 4. Deploy

```bash
# Clone to your NAS
cd /volume1/docker
git clone https://github.com/sudojsonbourne/Projects.git
cd Projects/obsidian-vault-manager

# Ensure NAS directories exist (see Step 1)
sudo mkdir -p /volume1/obsidian/{audrey-vault,taylor-vault}

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

# Test health endpoints
curl http://localhost:3001/health
curl http://localhost:3002/health
```

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
| 3001 | mcp-audrey | Audrey's MCP server |
| 3002 | mcp-taylor | Taylor's MCP server |

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
| `OBSIDIAN_EMAIL_AUDREY` | Audrey's Obsidian account email |
| `OBSIDIAN_PASSWORD_AUDREY` | Audrey's Obsidian account password |
| `AUDREY_VAULT_NAME` | Audrey's vault name in Obsidian Sync |
| `AUDREY_ENCRYPTION_PASSWORD` | Audrey's vault E2EE password (optional) |
| `OBSIDIAN_EMAIL_TAYLOR` | Taylor's Obsidian account email |
| `OBSIDIAN_PASSWORD_TAYLOR` | Taylor's Obsidian account password |
| `TAYLOR_VAULT_NAME` | Taylor's vault name in Obsidian Sync |
| `TAYLOR_ENCRYPTION_PASSWORD` | Taylor's vault E2EE password (optional) |

## Troubleshooting

**Sync container won't start / restart loop:**
```bash
sudo docker logs obsidian-sync-audrey --tail 30
```
- `OBSIDIAN_EMAIL is required` → check `.env` has the credential variables set
- Login failure → verify email/password, check if MFA is required on the account
- Vault not found → run `ob sync-list-remote` locally to confirm the vault name

**MCP servers won't start:**
The MCP containers depend on sync containers being healthy. Check the sync logs first — MCP services wait until sync is running.

**Cloudflared stops after startup:**
The `start_period: 30s` healthcheck gives it time to establish the tunnel. Check logs:
```bash
sudo docker logs obsidian-cloudflared --tail 20
```

**Files not syncing:**
- Verify Obsidian Sync is enabled and working on your Mac/iPhone first
- Check sync container logs for errors
- Ensure the vault name in `.env` matches the vault name in Obsidian exactly

## Mac Cleanup (if migrating from Syncthing)

If you previously used the Syncthing + vault-bridge setup, remove the old components:

```bash
# Stop and remove the vault bridge
launchctl unload ~/Library/LaunchAgents/com.vaultbridge.sync.plist
rm ~/Library/LaunchAgents/com.vaultbridge.sync.plist
sudo rm /usr/local/bin/vault-bridge.sh

# Uninstall Syncthing
brew services stop syncthing
brew uninstall syncthing

# Remove the staging directory (no longer needed)
rm -rf ~/Vaults
```
