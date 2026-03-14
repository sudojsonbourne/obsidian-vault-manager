import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import { resolveVault, config } from "./config.js";

/**
 * Proxy middleware that forwards authenticated /mcp requests to the
 * correct MCP backend based on the Host header.
 *
 * Mounted at /mcp in server.js, so Express strips the /mcp prefix.
 * pathRewrite adds it back so the backend receives /mcp.
 *
 * fixRequestBody re-serializes req.body after express.json() consumed
 * the raw stream, so the proxy can forward the body to the backend.
 */
export const mcpProxy = createProxyMiddleware({
  router: (req) => {
    const vault = resolveVault(req.headers.host);
    if (!vault) return null;
    return config.vaults[vault].backend;
  },
  changeOrigin: true,
  pathRewrite: { "^/": "/mcp" },
  on: {
    proxyReq: fixRequestBody,
    error(err, req, res) {
      console.error(`Proxy error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad_gateway", message: "MCP backend unavailable" }));
      }
    },
  },
});
