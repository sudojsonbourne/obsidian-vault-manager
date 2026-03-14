import { config } from "../config.js";

/**
 * Look up a pre-registered client by client_id.
 * Clients are configured via environment variables, not dynamic registration.
 */
export function getClient(clientId) {
  for (const vault of Object.values(config.vaults)) {
    if (vault.clientId === clientId) {
      return {
        client_id: vault.clientId,
        client_secret: vault.clientSecret,
      };
    }
  }
  return null;
}

/**
 * Verify the client_secret for a given client_id.
 */
export function verifyClientSecret(clientId, clientSecret) {
  const client = getClient(clientId);
  if (!client) return false;
  return client.client_secret === clientSecret;
}
