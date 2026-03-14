import Database from "better-sqlite3";
import { config } from "../config.js";

const db = new Database(config.dbPath);

// WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_codes (
    code            TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    redirect_uri    TEXT NOT NULL,
    code_challenge  TEXT NOT NULL,
    vault           TEXT NOT NULL,
    used            INTEGER NOT NULL DEFAULT 0,
    expires_at      INTEGER NOT NULL,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token       TEXT PRIMARY KEY,
    type        TEXT NOT NULL CHECK(type IN ('access', 'refresh')),
    client_id   TEXT NOT NULL,
    vault       TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes(expires_at);
`);

export default db;
