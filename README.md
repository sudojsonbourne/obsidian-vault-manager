# Obsidian Vault Manager

Manage Obsidian vaults on a Synology NAS directly from the Claude iOS app. Two MCP servers (one per vault) expose filesystem tools over the MCP protocol, tunneled through Cloudflare to claude.ai. Obsidian Headless Sync keeps vaults on the NAS in sync with Obsidian Cloud — no Mac required as an intermediary.

> **Authentication** is handled by [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). See that repo for OAuth setup, client credentials, and Claude connector configuration.

## Architecture

```
Claude iOS / claude.ai  (your Max Plan)
        │
        │  HTTPS  (MCP Streamable HTTP + OAuth 2.1)
        ▼
  Cloudflare Edge  (TLS, tunnel routing, WAF)
        │
        │  Cloudflare Tunnel
        ▼
  mcp-auth-proxy  (external — see mcp-auth-proxy repo)
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

> **Auth and tunnel services** (auth-proxy, cloudflared) have been extracted to [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). This repo connects to the `mcp-net` Docker network created by that stack.

> **No Mac-side services needed.** Native Obsidian Sync handles Mac and iPhone devices automatically.

## Security Model

The vault data is protected by several layers:

- **Cloudflare Tunnel** — the MCP servers are not exposed to the public internet. Traffic routes through an encrypted Cloudflare Tunnel, which terminates TLS at the Cloudflare edge. No ports are opened on your router or firewall.
- **Cloudflare WAF hardening** — WAF custom rules and rate limiting provide defense-in-depth at the Cloudflare edge, blocking malformed or excessive requests before they reach your NAS. See the [cloudflared-tunnel README](https://github.com/sudojsonbourne/cloudflared-tunnel#cloudflare-hardening).
- **OAuth 2.1 authentication** — handled by [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). See that repo for OAuth setup, client credentials, and Claude connector configuration.
- **MCP ports are Docker-internal** — MCP ports (3001, 3002) are only reachable within the `mcp-net` Docker network. They are not exposed to the host or LAN.
- **Vault isolation** — each MCP container mounts only its own vault directory. Even if the path validation in `server.js` had a bug, one vault's MCP server cannot access the other vault's files.
- **Path traversal protection** — all file paths are resolved and validated against the vault root before any filesystem operation. Requests that attempt to escape the vault directory are rejected.
- **Non-root containers** — all containers (sync and MCP) run as `user: 1026:100`, matching the Synology NAS user. No container runs as root.
- **Resource limits** — each container has memory limits to prevent a runaway process from starving other NAS services.
- **Hardened MCP containers** — MCP containers run with a read-only filesystem (`read_only: true`), all Linux capabilities dropped (`cap_drop: ALL`), and privilege escalation blocked (`no-new-privileges`). Only the vault mount is writable.
- **Ephemeral credentials** — sync containers use a `tmpfs` mount for the Obsidian config directory. Login state exists only in RAM and vanishes on restart.
- **PID namespace isolation** — sync containers run with `pid: private`, isolating their `/proc` namespace. Processes on the NAS host cannot see command arguments inside the container via `ps aux`.
- **File size guard** — `read_file` rejects files over 5MB to prevent memory exhaustion in the 256MB MCP containers.

**Known limitations:**
- Both vaults share a single Obsidian account/password. If per-vault credentials are needed, update `.env` and `docker-compose.yml` to use separate variables.
- Obsidian credentials are passed as CLI arguments to `ob login`, which makes them briefly visible in process listings inside the container. This exposure is transient (only during the login call, not during the long-running `ob sync --continuous`) and mitigated by PID namespace isolation (`pid: private`) and ephemeral tmpfs credential storage.

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
>
> The auth-data directory is no longer needed here — it lives in the [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy) stack.

## 2. Obsidian Sync Setup

A single [Obsidian Sync Plus](https://obsidian.md/sync) subscription covers both vaults (up to 10). The vaults must already exist in Obsidian Sync — create them from the Obsidian desktop or mobile app first, then the headless containers will pull them down to the NAS automatically.

No additional configuration is needed beyond the `.env` file. The containers handle login, vault setup, and continuous sync on startup.

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `OBSIDIAN_EMAIL` / `OBSIDIAN_PASSWORD` — your Obsidian account credentials
- `AUDREY_VAULT_NAME` / `TAYLOR_VAULT_NAME` — vault names exactly as they appear in Obsidian Sync (case-sensitive)
- `ENCRYPTION_PASSWORD` — only if E2EE is enabled on the vaults (optional)

> OAuth client credentials (`CLIENT_ID`, `CLIENT_SECRET`, `AUTH_SECRET`, `PUBLIC_URL`) are now configured in [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). See that repo for setup.

> **That's it.** The `entrypoint.sh` in each sync container runs `ob login`, `ob sync-setup`, and `ob sync --continuous` automatically using these credentials. Login failures are retried up to 5 times with exponential backoff to avoid account lockout.

## 3. Cloudflare Tunnel & Auth Proxy

The Cloudflare Tunnel and auth proxy are managed by [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). That stack creates the `mcp-net` Docker network, runs cloudflared, and handles OAuth 2.1 authentication. The tunnel routes requests through mcp-auth-proxy to the MCP servers in this repo.

See the [cloudflared-tunnel README](https://github.com/sudojsonbourne/cloudflared-tunnel) for tunnel creation, public hostname configuration, rebuilding/replacing tunnels, and Cloudflare WAF hardening.

> **Deploy mcp-auth-proxy first.** This repo's containers join the `mcp-net` network created by that stack. If mcp-auth-proxy is not running, `sudo docker compose up` will fail with a network-not-found error.

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

# Test MCP health endpoints (Docker-internal only)
sudo docker exec obsidian-mcp-audrey wget -q -O- http://localhost:3001/health
sudo docker exec obsidian-mcp-taylor wget -q -O- http://localhost:3002/health
```

> **Private repo?** If the GitHub repo is private, use a [personal access token](https://github.com/settings/tokens) in the clone URL:
> ```bash
> git clone https://<your-token>@github.com/youruser/obsidian-vault-manager.git
> ```

## 5. Register Connectors in Claude

Authentication is handled by [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). See that repo for OAuth setup, client credentials, and Claude connector configuration.

## 6. iPhone & Mac Access

**iPhone:** Connectors configured on claude.ai sync automatically to the Claude iOS app. Open the Claude app and your vault tools are available.

**Obsidian Sync:** Enable Obsidian Sync in the Obsidian app on your Mac and iPhone. Vaults sync automatically between all devices and the NAS — no additional setup needed.

## MCP Tools Available

Each vault server exposes these tools to Claude:

| Tool | Description |
|------|-------------|
| `list_directory` | List files and folders (relative path or root; `recursive=true` for full tree) |
| `read_file` | Read a file's contents |
| `write_file` | Create or overwrite a file |
| `append_to_file` | Append content to an existing file (daily notes, logs) |
| `delete_file` | Delete a file |
| `delete_directory` | Delete a directory (empty by default; `force=true` for recursive) |
| `move_file` | Move or rename a file or directory |
| `search_files` | Search by filename (case-insensitive) |
| `search_content` | Search for text inside vault files with snippets |
| `search_by_tag` | Find all notes with a given tag (frontmatter + inline) |
| `list_recent_files` | List N most recently modified files (default 10) |
| `copy_file` | Copy a file to a new path within the vault |
| `get_file_info` | Get size and timestamps for a file or directory |
| `create_directory` | Create a folder (with parents) |

All paths are relative to the vault root. Path traversal is blocked.

## Local Ports

| Port | Service | Purpose |
|------|---------|---------|
| 3001 | mcp-audrey | Audrey's MCP server (Docker-internal on `mcp-net`) |
| 3002 | mcp-taylor | Taylor's MCP server (Docker-internal on `mcp-net`) |

> Port 3000 (auth-proxy) is managed by [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy).

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
| `OBSIDIAN_EMAIL` | Obsidian account email |
| `OBSIDIAN_PASSWORD` | Obsidian account password |
| `AUDREY_VAULT_NAME` | Audrey's vault name in Obsidian Sync |
| `TAYLOR_VAULT_NAME` | Taylor's vault name in Obsidian Sync |
| `ENCRYPTION_PASSWORD` | Vault E2EE password (optional) |

> OAuth variables (`CLIENT_ID`, `CLIENT_SECRET`, `AUTH_SECRET`, `PUBLIC_URL`, `CLOUDFLARE_TUNNEL_TOKEN`) are now configured in [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy).

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
1. Tear down [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy) (tunnel, auth, connectors)
2. Optionally remove vault data: `sudo rm -rf /volume1/obsidian`

## Troubleshooting

### Sync container won't start / restart loop

```bash
sudo docker logs obsidian-sync-audrey --tail 30
```
- `OBSIDIAN_EMAIL is required` → check `.env` has the credential variables set
- `Login failed after 5 attempts` → verify email/password, check if MFA is required on the account
- Vault not found → run `ob sync-list-remote` locally to confirm the vault name

### MCP servers won't start

The MCP containers depend on sync containers being started (`depends_on: condition: service_started`) — they don't wait for sync to be fully healthy, just for the container to launch. If the MCP server itself fails to start, check its logs:

```bash
sudo docker logs obsidian-mcp-audrey --tail 20
```

Common causes:
- `VAULT_PATH environment variable is required` → check `docker-compose.yml` has the `VAULT_PATH` env var set
- Permission errors → see [Permission denied](#permission-denied-eacces-from-mcp-tools) below

### Cloudflare tunnel or auth-proxy issues

Tunnel and auth troubleshooting has moved to [mcp-auth-proxy](https://github.com/sudojsonbourne/mcp-auth-proxy). See that repo for Cloudflare Error 1033, cloudflared health checks, and OAuth debugging.

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
