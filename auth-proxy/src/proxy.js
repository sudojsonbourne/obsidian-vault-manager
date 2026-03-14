import { createProxyMiddleware } from "http-proxy-middleware";
import { resolveVault, config } from "./config.js";

/**
 * Proxy middleware that forwards authenticated /mcp requests to the
 * correct MCP backend based on the Host header.
 */
export const mcpProxy = createProxyMiddleware({
  router: (req) => {
    const vault = resolveVault(req.headers.host);
    if (!vault) return null;
    return config.vaults[vault].backend;
  },
  changeOrigin: true,
  // Only proxy /mcp — the path stays the same
  pathFilter: "/mcp",
  on: {
    error(err, req, res) {
      console.error(`Proxy error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad_gateway", message: "MCP backend unavailable" }));
      }
    },
  },
});
