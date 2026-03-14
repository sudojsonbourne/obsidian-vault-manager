import express from "express";
import { config } from "./config.js";
import { cleanup } from "./store/tokens.js";

// OAuth routes
import metadataRouter from "./oauth/metadata.js";
import authorizeRouter from "./oauth/authorize.js";
import tokenRouter from "./oauth/token.js";

// Auth middleware + proxy
import { requireAuth } from "./oauth/validate.js";
import { mcpProxy } from "./proxy.js";

const app = express();

// JSON body parsing
app.use(express.json());

// ── Health check ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth-proxy" });
});

// ── OAuth 2.1 endpoints ────────────────────────────────────────────
app.use(metadataRouter);     // GET /.well-known/oauth-authorization-server
app.use(authorizeRouter);    // GET /authorize (auto-approve)
app.use(tokenRouter);        // POST /token

// ── Authenticated MCP proxy ────────────────────────────────────────
app.use("/mcp", requireAuth, mcpProxy);

// ── Catch-all ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ── Startup ────────────────────────────────────────────────────────
app.listen(config.port, "0.0.0.0", () => {
  console.log(`Auth proxy listening on port ${config.port}`);
});

// Clean up expired tokens/codes on startup and every hour
cleanup();
setInterval(cleanup, 3600 * 1000);
