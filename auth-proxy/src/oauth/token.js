import { Router } from "express";
import express from "express";
import { getClient } from "../store/clients.js";
import { consumeCode } from "../store/codes.js";
import { createTokenPair, consumeRefreshToken } from "../store/tokens.js";
import { verifyPKCE } from "./pkce.js";

const router = Router();

// OAuth 2.1 token endpoint uses application/x-www-form-urlencoded
router.use("/token", express.urlencoded({ extended: false }));

router.post("/token", (req, res) => {
  const { grant_type } = req.body;

  if (grant_type === "authorization_code") {
    return handleAuthorizationCode(req, res);
  }
  if (grant_type === "refresh_token") {
    return handleRefreshToken(req, res);
  }

  return res.status(400).json({
    error: "unsupported_grant_type",
    error_description: "Supported: authorization_code, refresh_token",
  });
});

function handleAuthorizationCode(req, res) {
  const { code, client_id, redirect_uri, code_verifier } = req.body;

  if (!code || !client_id || !redirect_uri || !code_verifier) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing required parameters",
    });
  }

  const client = getClient(client_id);
  if (!client) {
    return res.status(400).json({ error: "invalid_client" });
  }

  const codeRow = consumeCode(code);
  if (!codeRow) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code is invalid, expired, or already used",
    });
  }

  // Verify client_id and redirect_uri match what was used during authorization
  if (codeRow.client_id !== client_id || codeRow.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: "invalid_grant" });
  }

  // Verify PKCE
  if (!verifyPKCE(code_verifier, codeRow.code_challenge)) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "PKCE verification failed",
    });
  }

  const tokenPair = createTokenPair(client_id, codeRow.vault);
  res.json(tokenPair);
}

function handleRefreshToken(req, res) {
  const { refresh_token, client_id } = req.body;

  if (!refresh_token || !client_id) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing required parameters",
    });
  }

  const tokenRow = consumeRefreshToken(refresh_token);
  if (!tokenRow) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Refresh token is invalid or expired",
    });
  }

  // Verify the refresh token belongs to this client
  if (tokenRow.client_id !== client_id) {
    return res.status(400).json({ error: "invalid_grant" });
  }

  const tokenPair = createTokenPair(client_id, tokenRow.vault);
  res.json(tokenPair);
}

export default router;
