import { v4 as uuidv4 } from "uuid";
import db from "./db.js";
import { config } from "../config.js";

const insertStmt = db.prepare(
  `INSERT INTO tokens (token, type, client_id, vault, expires_at)
   VALUES (?, ?, ?, ?, ?)`
);

const findStmt = db.prepare(
  "SELECT * FROM tokens WHERE token = ? AND type = ?"
);

const deleteStmt = db.prepare("DELETE FROM tokens WHERE token = ?");

const cleanupStmt = db.prepare(
  "DELETE FROM tokens WHERE expires_at < ?"
);

const cleanupCodesStmt = db.prepare(
  "DELETE FROM auth_codes WHERE expires_at < ?"
);

export function createTokenPair(clientId, vault) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = uuidv4();
  const refreshToken = uuidv4();

  insertStmt.run(accessToken, "access", clientId, vault, now + config.tokens.accessTtlSeconds);
  insertStmt.run(refreshToken, "refresh", clientId, vault, now + config.tokens.refreshTtlSeconds);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: config.tokens.accessTtlSeconds,
    refresh_token: refreshToken,
  };
}

export function validateAccessToken(token) {
  const row = findStmt.get(token, "access");
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    deleteStmt.run(token);
    return null;
  }
  return row;
}

export function consumeRefreshToken(token) {
  const row = findStmt.get(token, "refresh");
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    deleteStmt.run(token);
    return null;
  }
  // Rotate: delete old refresh token
  deleteStmt.run(token);
  return row;
}

export function cleanup() {
  const now = Math.floor(Date.now() / 1000);
  const tokenResult = cleanupStmt.run(now);
  const codeResult = cleanupCodesStmt.run(now);
  const total = tokenResult.changes + codeResult.changes;
  if (total > 0) {
    console.log(`Cleanup: removed ${tokenResult.changes} expired tokens, ${codeResult.changes} expired codes`);
  }
}
