import { Router } from "express";
import { config, resolveVault } from "../config.js";

const router = Router();

router.get("/.well-known/oauth-authorization-server", (req, res) => {
  const vault = resolveVault(req.headers.host);
  if (!vault) return res.status(404).json({ error: "unknown_host" });

  const baseUrl = config.vaults[vault].publicUrl;

  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
  });
});

export default router;
