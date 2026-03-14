import { Router } from "express";
import { createClient } from "../store/clients.js";

const router = Router();

router.post("/register", (req, res) => {
  const { client_name, redirect_uris, grant_types, token_endpoint_auth_method } = req.body;

  if (!client_name || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({
      error: "invalid_client_metadata",
      error_description: "client_name and at least one redirect_uri are required",
    });
  }

  // Validate redirect URIs are valid URLs
  for (const uri of redirect_uris) {
    try {
      new URL(uri);
    } catch {
      return res.status(400).json({
        error: "invalid_client_metadata",
        error_description: `Invalid redirect_uri: ${uri}`,
      });
    }
  }

  const client = createClient(client_name, redirect_uris);

  res.status(201).json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: grant_types || ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: token_endpoint_auth_method || "none",
  });
});

export default router;
