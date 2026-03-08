#!/bin/bash
# setup.sh — Install the vault bridge on macOS
#
# This script:
# 1. Installs fswatch via Homebrew (if missing)
# 2. Creates ~/Vaults/ staging directory
# 3. Moves existing vaults from ~/Documents/ to ~/Vaults/ (if present)
# 4. Installs vault-bridge.sh to /usr/local/bin/
# 5. Installs and loads the launchd agent
#
# After running this script, reconfigure Syncthing to point at ~/Vaults/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING_ROOT="$HOME/Vaults"
ICLOUD_ROOT="$HOME/Documents"
VAULTS=("audrey-vault" "taylor-vault")
PLIST_NAME="com.vaultbridge.sync"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

echo "=== Vault Bridge Setup ==="
echo ""

# 1. Check/install fswatch
if command -v fswatch &>/dev/null; then
  echo "[OK] fswatch is installed"
else
  echo "[..] Installing fswatch via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo "[!!] Homebrew not found. Install it from https://brew.sh then re-run."
    exit 1
  fi
  brew install fswatch
  echo "[OK] fswatch installed"
fi

# 2. Create staging directory
mkdir -p "$STAGING_ROOT"
echo "[OK] Created $STAGING_ROOT"

# 3. Move existing vaults from Documents to Vaults (if they exist)
for vault in "${VAULTS[@]}"; do
  if [ -d "$ICLOUD_ROOT/$vault" ] && [ ! -d "$STAGING_ROOT/$vault" ]; then
    echo "[..] Moving $ICLOUD_ROOT/$vault → $STAGING_ROOT/$vault"
    mv "$ICLOUD_ROOT/$vault" "$STAGING_ROOT/$vault"
    echo "[OK] Moved $vault"
  elif [ -d "$STAGING_ROOT/$vault" ]; then
    echo "[OK] $STAGING_ROOT/$vault already exists"
  else
    echo "[..] Creating empty $STAGING_ROOT/$vault"
    mkdir -p "$STAGING_ROOT/$vault"
  fi
done

# 4. Install bridge script
echo "[..] Installing vault-bridge.sh to /usr/local/bin/"
sudo cp "$SCRIPT_DIR/vault-bridge.sh" /usr/local/bin/vault-bridge.sh
sudo chmod +x /usr/local/bin/vault-bridge.sh
echo "[OK] Bridge script installed"

# 5. Unload existing agent (if any), install plist, load agent
mkdir -p "$LAUNCH_AGENTS"

if launchctl list "$PLIST_NAME" &>/dev/null; then
  echo "[..] Stopping existing vault bridge agent..."
  launchctl unload "$LAUNCH_AGENTS/$PLIST_NAME.plist" 2>/dev/null || true
fi

cp "$SCRIPT_DIR/$PLIST_NAME.plist" "$LAUNCH_AGENTS/$PLIST_NAME.plist"
launchctl load "$LAUNCH_AGENTS/$PLIST_NAME.plist"
echo "[OK] Launchd agent loaded"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "The vault bridge is now running. Next steps:"
echo ""
echo "  1. Open Syncthing UI: http://localhost:8384"
echo "  2. Edit each vault folder and change the path:"
echo "     - audrey-vault → $STAGING_ROOT/audrey-vault"
echo "     - taylor-vault → $STAGING_ROOT/taylor-vault"
echo "  3. Verify sync:"
echo "     - Check Syncthing UI for 'Up to Date' status (no EDEADLK errors)"
echo "     - Check bridge logs: tail -f ~/Library/Logs/vault-bridge.log"
echo "     - Check agent status: launchctl list | grep vaultbridge"
echo ""
echo "To stop the bridge:  launchctl unload ~/Library/LaunchAgents/$PLIST_NAME.plist"
echo "To start the bridge: launchctl load ~/Library/LaunchAgents/$PLIST_NAME.plist"
