#!/bin/sh
set -e

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

# --- Authenticate ---
echo "[obsidian-sync] Logging in as ${OBSIDIAN_EMAIL}..."
ob login --email "$OBSIDIAN_EMAIL" --password "$OBSIDIAN_PASSWORD"
echo "[obsidian-sync] Login successful"

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
