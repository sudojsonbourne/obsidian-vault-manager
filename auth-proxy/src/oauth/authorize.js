import { Router } from "express";
import { resolveVault, config } from "../config.js";
import { getClient } from "../store/clients.js";
import { createCode } from "../store/codes.js";

const router = Router();

function loginPage(vaultName, params, error) {
  const title = `Authorize \u2014 ${vaultName}`;
  const errorHtml = error ? `<p class="error">${error}</p>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; background: #0f0f0f; color: #e0e0e0; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
            padding: 2rem; max-width: 400px; width: 100%; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { font-size: 0.9rem; color: #999; margin-bottom: 1.5rem; }
    .error { color: #ff6b6b; background: #2a1515; border: 1px solid #4a2020;
             border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; }
    label { display: block; font-size: 0.85rem; margin-bottom: 0.5rem; }
    input[type="password"] { width: 100%; padding: 0.75rem; border: 1px solid #444;
                              border-radius: 6px; background: #111; color: #e0e0e0;
                              font-size: 1rem; margin-bottom: 1rem; }
    input[type="password"]:focus { outline: none; border-color: #7c6ef0; }
    button { width: 100%; padding: 0.75rem; border: none; border-radius: 6px;
             background: #7c6ef0; color: #fff; font-size: 1rem; cursor: pointer; }
    button:hover { background: #6b5dd3; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>An application is requesting access to your Obsidian vault.</p>
    ${errorHtml}
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${params.client_id}">
      <input type="hidden" name="redirect_uri" value="${params.redirect_uri}">
      <input type="hidden" name="code_challenge" value="${params.code_challenge}">
      <input type="hidden" name="code_challenge_method" value="${params.code_challenge_method}">
      <input type="hidden" name="state" value="${params.state || ""}">
      <input type="hidden" name="response_type" value="${params.response_type}">
      <label for="password">Vault password</label>
      <input type="password" id="password" name="password" required autofocus>
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>`;
}

// GET /authorize — render login form
router.get("/authorize", (req, res) => {
  const vault = resolveVault(req.headers.host);
  if (!vault) return res.status(404).send("Unknown host");

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

  const client = getClient(client_id);
  if (!client) {
    return res.status(400).json({ error: "invalid_request", error_description: "Unknown client_id" });
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).json({ error: "invalid_request", error_description: "Unregistered redirect_uri" });
  }

  const vaultName = vault.charAt(0).toUpperCase() + vault.slice(1);
  res.type("html").send(loginPage(vaultName, req.query, null));
});

// POST /authorize — validate password, issue code, redirect
router.post("/authorize", (req, res) => {
  const vault = resolveVault(req.headers.host);
  if (!vault) return res.status(404).send("Unknown host");

  const { client_id, redirect_uri, code_challenge, code_challenge_method, response_type, state, password } = req.body;

  // Re-validate (form could be tampered)
  if (response_type !== "code" || code_challenge_method !== "S256") {
    return res.status(400).json({ error: "invalid_request" });
  }

  const client = getClient(client_id);
  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).json({ error: "invalid_request" });
  }

  // Check password
  const expected = config.vaults[vault].password;
  if (password !== expected) {
    const vaultName = vault.charAt(0).toUpperCase() + vault.slice(1);
    return res.type("html").send(
      loginPage(vaultName, req.body, "Incorrect password. Please try again.")
    );
  }

  // Issue authorization code
  const code = createCode(client_id, redirect_uri, code_challenge, vault);

  // Redirect back to client
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.redirect(302, redirectUrl.toString());
});

export default router;
