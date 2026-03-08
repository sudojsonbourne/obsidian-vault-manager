# Obsidian Vault Manager

Docker-based application for managing Obsidian vaults remotely via a mobile-first web UI. Designed for Synology NAS (DS920+, DSM 7.2+) with bidirectional Syncthing sync.

## Architecture

- **Syncthing** — Bidirectional sync between NAS (`/volume1/obsidian`) and Mac (`~/Documents`)
- **MCP Filesystem Server** — REST API for vault file operations, sandboxed per vault
- **Next.js Web UI** — Mobile-first dark theme PWA with per-user vault routes

## Prerequisites

- Synology NAS with Docker/Container Manager installed
- `/volume1/obsidian/audrey-vault` and `/volume1/obsidian/taylor-vault` directories created
- An Anthropic API key

## NAS Folder Setup

```bash
# SSH into your NAS or use File Station
mkdir -p /volume1/obsidian/audrey-vault
mkdir -p /volume1/obsidian/taylor-vault
```

## Syncthing Setup (Mac Side)

```bash
# Install Syncthing on Mac
brew install syncthing

# Start as a background service
brew services start syncthing
```

1. Open Syncthing web UI at `http://localhost:8384`
2. Add the NAS as a remote device (use its Device ID from `http://NAS_IP:8384`)
3. Share two folders:
   - `audrey-vault`: Mac path `~/Documents/audrey-vault` ↔ NAS path `/volume1/obsidian/audrey-vault`
   - `taylor-vault`: Mac path `~/Documents/taylor-vault` ↔ NAS path `/volume1/obsidian/taylor-vault`
4. Set both folders to **Send & Receive** on both sides

## Deployment

```bash
# Clone the repo to your NAS
cd /volume1/docker
git clone <repo-url> obsidian-vault-manager
cd obsidian-vault-manager

# Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Accessing the App

- **Audrey**: `http://NAS_LOCAL_IP:3000/audrey`
- **Taylor**: `http://NAS_LOCAL_IP:3000/taylor`
- **Syncthing UI**: `http://NAS_LOCAL_IP:8384`

Access works over your WireGuard tunnel from anywhere.

## iPhone PWA Setup

1. Open Safari on your iPhone
2. Navigate to `http://NAS_LOCAL_IP:3000/audrey` (or `/taylor`)
3. Tap the Share button (square with arrow)
4. Tap **Add to Home Screen**
5. Name it (e.g., "My Vault") and tap **Add**

The app will open in full-screen mode without Safari's browser chrome.

## Ports

| Service      | Port  | Purpose                    |
| ------------ | ----- | -------------------------- |
| Web UI       | 3000  | Next.js app                |
| MCP Server   | 3001  | Filesystem API (internal)  |
| Syncthing UI | 8384  | Syncthing web interface    |
| Syncthing    | 22000 | Sync protocol              |

## Environment Variables

| Variable                 | Description                  |
| ------------------------ | ---------------------------- |
| `ANTHROPIC_API_KEY`      | Your Anthropic API key       |
| `NODE_ENV`               | Set to `production`          |
| `NEXT_TELEMETRY_DISABLED`| Set to `1` to disable        |
