import { Router } from "express";
import { resolveVault, resolveVaultByClientId } from "../config.js";
import { getClient } from "../store/clients.js";
import { createCode } from "../store/codes.js";

const router = Router();

// GET /authorize — auto-approve for pre-registered clients, redirect immediately
router.get("/authorize", (req, res) => {
  const vault = resolveVault(req.headers.host);
  if (!vault) return res.status(404).json({ error: "unknown_host" });

  const { client_id, redirect_uri, code_challenge, code_challenge_method, response_type, state } = req.query;

  // Validate required parameters
  if (response_type !== "code") {
    return res.status(400).json({ error: "unsupported_response_type" });
  }
  if (code_challenge_method !== "S256") {
    return res.status(400).json({ error: "invalid_request", error_description: "Only S256 is supported" });
  }
  if (!client_id || !redirect_uri || !code_challenge) {
    return res.status(400).json({ error: "invalid_request", error_description: "Missing required parameters" });
  }

  // Verify client is pre-registered
  const client = getClient(client_id);
  if (!client) {
    return res.status(400).json({ error: "invalid_request", error_description: "Unknown client_id" });
  }

  // Verify client_id is authorized for this vault
  const clientVault = resolveVaultByClientId(client_id);
  if (clientVault !== vault) {
    return res.status(403).json({ error: "access_denied", error_description: "Client not authorized for this vault" });
  }

  // Auto-approve: issue authorization code and redirect immediately
  const code = createCode(client_id, redirect_uri, code_challenge, vault);

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.redirect(302, redirectUrl.toString());
});

export default router;
