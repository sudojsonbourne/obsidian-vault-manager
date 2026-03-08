# Obsidian Vault Manager

Manage Obsidian vaults on a Synology NAS directly from the Claude iOS app. Two MCP servers (one per vault) expose filesystem tools over the MCP protocol, tunneled through Cloudflare to claude.ai. No API keys, no custom web UI — just your Claude Max Plan.

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
  /volume1/obsidian  (Syncthing ↔ Mac ~/Documents)
```

**Services:**

| Container | Purpose |
|-----------|---------|
| `syncthing` | Bidirectional sync between NAS and Mac |
| `mcp-audrey` | MCP server scoped to Audrey's vault |
| `mcp-taylor` | MCP server scoped to Taylor's vault |
| `cloudflared` | Cloudflare Tunnel — exposes both MCP servers over HTTPS |

## Prerequisites

- Synology NAS (DS920+ or similar) with Docker / Container Manager
- A domain managed by Cloudflare DNS (free tier works)
- A Cloudflare account (free)
- Claude Pro or Max subscription

## 1. NAS Folder Setup

```bash
# SSH into your NAS or use File Station
mkdir -p /volume1/obsidian/audrey-vault
mkdir -p /volume1/obsidian/taylor-vault
```

## 2. Syncthing Setup (Mac Side)

```bash
brew install syncthing
brew services start syncthing
```

1. Open `http://localhost:8384` (Mac Syncthing UI)
2. Add the NAS as a remote device — get its Device ID from `http://NAS_IP:8384`
3. Share two folders:
   - **audrey-vault:** Mac `~/Documents/audrey-vault` ↔ NAS `/volume1/obsidian/audrey-vault`
   - **taylor-vault:** Mac `~/Documents/taylor-vault` ↔ NAS `/volume1/obsidian/taylor-vault`
4. Set both folders to **Send & Receive** on both sides

## 3. Cloudflare Tunnel Setup

### Create the Tunnel

1. Log in to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. Go to **Networks → Tunnels**
3. Click **Create a tunnel** → select **Cloudflared** connector
4. Name it (e.g., `obsidian-vault`)
5. Copy the **tunnel token** — you'll need this for `.env`

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
git clone <repo-url> obsidian-vault-manager
cd obsidian-vault-manager

# Configure
cp .env.example .env
# Edit .env — paste your CLOUDFLARE_TUNNEL_TOKEN

# Build and start
docker-compose up -d --build

# Verify
docker-compose logs -f cloudflared
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

## 6. iPhone Access

Connectors configured on claude.ai sync automatically to the Claude iOS app. No additional setup needed.

1. Open the Claude app on your iPhone
2. Start a new conversation
3. Your vault tools are available — try: *"List the files in my vault"*

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
| 8384 | Syncthing | Web UI for sync management |
| 22000 | Syncthing | Sync protocol |

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
