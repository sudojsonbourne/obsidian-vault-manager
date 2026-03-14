import { v4 as uuidv4 } from "uuid";
import db from "./db.js";

const insertStmt = db.prepare(
  "INSERT INTO clients (client_id, client_name, redirect_uris) VALUES (?, ?, ?)"
);

const findStmt = db.prepare("SELECT * FROM clients WHERE client_id = ?");

export function createClient(clientName, redirectUris) {
  const clientId = uuidv4();
  insertStmt.run(clientId, clientName, JSON.stringify(redirectUris));
  return {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
  };
}

export function getClient(clientId) {
  const row = findStmt.get(clientId);
  if (!row) return null;
  return {
    ...row,
    redirect_uris: JSON.parse(row.redirect_uris),
  };
}
