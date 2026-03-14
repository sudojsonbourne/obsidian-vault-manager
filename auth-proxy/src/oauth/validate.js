import { validateAccessToken } from "../store/tokens.js";
import { resolveVault } from "../config.js";

/**
 * Express middleware that validates the Bearer token on /mcp requests.
 * Ensures the token is valid AND scoped to the vault identified by the Host header.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.set("WWW-Authenticate", "Bearer");
    return res.status(401).json({ error: "unauthorized" });
  }

  const token = authHeader.slice(7);
  const tokenRow = validateAccessToken(token);
  if (!tokenRow) {
    res.set("WWW-Authenticate", "Bearer");
    return res.status(401).json({ error: "invalid_token" });
  }

  // Ensure the token's vault matches the requested vault (cross-vault protection)
  const vault = resolveVault(req.headers.host);
  if (!vault || tokenRow.vault !== vault) {
    res.set("WWW-Authenticate", "Bearer");
    return res.status(403).json({ error: "insufficient_scope" });
  }

  // Strip the Authorization header before proxying to MCP backend
  delete req.headers.authorization;
  next();
}
