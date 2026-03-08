#!/bin/bash
# vault-bridge.sh — Bidirectional bridge between Syncthing staging and iCloud Documents
#
# Watches ~/Vaults and ~/Documents for vault changes using fswatch (FSEvents).
# When a change is detected, rsyncs in the appropriate direction.
# A lock file prevents infinite loops from cascading change events.

set -euo pipefail

STAGING_ROOT="$HOME/Vaults"
ICLOUD_ROOT="$HOME/Documents"
LOCKFILE="/tmp/vault-bridge.lock"
DEBOUNCE=3
LOGFILE="$HOME/Library/Logs/vault-bridge.log"
VAULTS=("audrey-vault" "taylor-vault")

RSYNC_OPTS=(
  --archive
  --delete
  --checksum
  --exclude='.st*'
  --exclude='.DS_Store'
  --exclude='*.icloud'
  --exclude='.Trash*'
)

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOGFILE"
}

sync_vault() {
  local vault="$1"
  local src="$2"
  local dst="$3"

  # Skip if another sync is in progress
  if [ -f "$LOCKFILE" ]; then
    return 0
  fi

  touch "$LOCKFILE"
  trap 'rm -f "$LOCKFILE"' EXIT

  log "SYNC $vault: $src → $dst"
  if rsync "${RSYNC_OPTS[@]}" "$src/" "$dst/"; then
    log "SYNC $vault: OK"
  else
    log "SYNC $vault: FAILED (exit $?)"
  fi

  sleep "$DEBOUNCE"
  rm -f "$LOCKFILE"
  trap - EXIT
}

# Ensure staging directories exist
for vault in "${VAULTS[@]}"; do
  mkdir -p "$STAGING_ROOT/$vault"
done

log "Starting vault bridge"
log "Staging: $STAGING_ROOT"
log "iCloud:  $ICLOUD_ROOT"
log "Vaults:  ${VAULTS[*]}"

# Build watch paths — only watch vault subdirectories that exist
WATCH_PATHS=()
for vault in "${VAULTS[@]}"; do
  WATCH_PATHS+=("$STAGING_ROOT/$vault")
  if [ -d "$ICLOUD_ROOT/$vault" ]; then
    WATCH_PATHS+=("$ICLOUD_ROOT/$vault")
  fi
done

# Clean up stale lock file on startup
rm -f "$LOCKFILE"

# Watch for changes and sync in the appropriate direction
fswatch -r -l "$DEBOUNCE" --event Created --event Updated --event Removed --event Renamed \
  "${WATCH_PATHS[@]}" | while read -r event; do

  for vault in "${VAULTS[@]}"; do
    if [[ "$event" == "$STAGING_ROOT/$vault"* ]]; then
      sync_vault "$vault" "$STAGING_ROOT/$vault" "$ICLOUD_ROOT/$vault"
      break
    elif [[ "$event" == "$ICLOUD_ROOT/$vault"* ]]; then
      sync_vault "$vault" "$ICLOUD_ROOT/$vault" "$STAGING_ROOT/$vault"
      break
    fi
  done
done
