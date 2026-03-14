import { v4 as uuidv4 } from "uuid";
import db from "./db.js";
import { config } from "../config.js";

const insertStmt = db.prepare(
  `INSERT INTO auth_codes (code, client_id, redirect_uri, code_challenge, vault, expires_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const findStmt = db.prepare("SELECT * FROM auth_codes WHERE code = ?");
const markUsedStmt = db.prepare("UPDATE auth_codes SET used = 1 WHERE code = ?");

// If a code is replayed, revoke all tokens issued for that client+vault
const revokeTokensStmt = db.prepare(
  "DELETE FROM tokens WHERE client_id = ? AND vault = ?"
);

export function createCode(clientId, redirectUri, codeChallenge, vault) {
  const code = uuidv4();
  const expiresAt = Math.floor(Date.now() / 1000) + config.tokens.codeTtlSeconds;
  insertStmt.run(code, clientId, redirectUri, codeChallenge, vault, expiresAt);
  return code;
}

/**
 * Consume an authorization code. Returns the code row if valid, or null.
 * Handles one-time use: if already used, revokes all tokens for that client+vault.
 */
export function consumeCode(code) {
  const row = findStmt.get(code);
  if (!row) return null;

  // Replay detection: code already used → revoke tokens per OAuth 2.1 spec
  if (row.used) {
    revokeTokensStmt.run(row.client_id, row.vault);
    return null;
  }

  // Expired
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;

  markUsedStmt.run(code);
  return row;
}
