#!/bin/sh
set -e

MAX_RETRIES=5
RETRY_DELAY=30

echo "[obsidian-sync] Starting obsidian-headless sync"
echo "[obsidian-sync] Vault: ${VAULT_NAME}"
echo "[obsidian-sync] Path: ${VAULT_PATH:-/vault}"

# --- Validate required env vars ---
if [ -z "$OBSIDIAN_EMAIL" ]; then
  echo "[obsidian-sync] ERROR: OBSIDIAN_EMAIL is required"
  exit 1
fi

if [ -z "$OBSIDIAN_PASSWORD" ]; then
  echo "[obsidian-sync] ERROR: OBSIDIAN_PASSWORD is required"
  exit 1
fi

if [ -z "$VAULT_NAME" ]; then
  echo "[obsidian-sync] ERROR: VAULT_NAME is required"
  exit 1
fi

VAULT_DIR="${VAULT_PATH:-/vault}"

# --- Clean up stale sync lock ---
# obsidian-headless uses .obsidian/.sync.lock (a directory) to prevent
# concurrent sync. If the container was hard-killed (OOM, SIGKILL), the
# lock is not cleaned up and blocks future syncs with "Another sync
# instance is already running". Safe to remove on startup since we know
# no other sync process is running inside this container.
LOCK_DIR="${VAULT_DIR}/.obsidian/.sync.lock"
if [ -d "$LOCK_DIR" ]; then
  echo "[obsidian-sync] Removing stale sync lock: ${LOCK_DIR}"
  rm -rf "$LOCK_DIR"
fi

# --- Optional startup delay to stagger concurrent logins ---
if [ -n "$STARTUP_DELAY" ]; then
  echo "[obsidian-sync] Waiting ${STARTUP_DELAY}s before login..."
  sleep "$STARTUP_DELAY"
fi

# --- Authenticate with backoff ---
attempt=1
while [ "$attempt" -le "$MAX_RETRIES" ]; do
  echo "[obsidian-sync] Login attempt ${attempt}/${MAX_RETRIES}..."
  if ob login --email "$OBSIDIAN_EMAIL" --password "$OBSIDIAN_PASSWORD"; then
    echo "[obsidian-sync] Login successful"
    break
  fi
  if [ "$attempt" -eq "$MAX_RETRIES" ]; then
    echo "[obsidian-sync] ERROR: Login failed after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "[obsidian-sync] Login failed, retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
  RETRY_DELAY=$((RETRY_DELAY * 2))
  attempt=$((attempt + 1))
done

# --- Setup vault sync ---
echo "[obsidian-sync] Configuring vault sync..."
if [ -n "$ENCRYPTION_PASSWORD" ]; then
  ob sync-setup --vault "$VAULT_NAME" --path "$VAULT_DIR" --password "$ENCRYPTION_PASSWORD"
else
  ob sync-setup --vault "$VAULT_NAME" --path "$VAULT_DIR"
fi
echo "[obsidian-sync] Vault configured"

# --- Start continuous sync (replaces shell, receives Docker signals) ---
echo "[obsidian-sync] Starting continuous sync..."
exec ob sync --continuous
