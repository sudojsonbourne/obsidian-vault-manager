import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";

// ── Config ──────────────────────────────────────────────────────────
const VAULT_PATH = process.env.VAULT_PATH;
const PORT = parseInt(process.env.PORT || "3001", 10);

if (!VAULT_PATH) {
  console.error("VAULT_PATH environment variable is required");
  process.exit(1);
}

// Resolve to absolute to ensure startsWith checks work correctly
const VAULT_ROOT = path.resolve(VAULT_PATH);

// ── Helpers ─────────────────────────────────────────────────────────

function resolveAndValidate(filePath) {
  const full = path.resolve(VAULT_ROOT, filePath);
  if (full !== VAULT_ROOT && !full.startsWith(VAULT_ROOT + path.sep)) {
    throw new Error("Path traversal detected — access denied");
  }
  return full;
}

async function walk(dir, query, results) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.name.toLowerCase().includes(query)) {
      results.push({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: path.relative(VAULT_ROOT, fullPath),
      });
    }
    if (entry.isDirectory()) {
      await walk(fullPath, query, results);
    }
  }
}

// ── MCP Server ──────────────────────────────────────────────────────

const vaultName = path.basename(VAULT_ROOT);

const mcpServer = new McpServer({
  name: `obsidian-vault-${vaultName}`,
  version: "1.0.0",
});

// Tool: list_directory
mcpServer.tool(
  "list_directory",
  "List files and directories in the vault. Provide a relative path or omit for the vault root.",
  { path: z.string().optional().describe("Relative directory path within the vault (empty for root)") },
  async ({ path: dirPath }) => {
    try {
      const resolved = resolveAndValidate(dirPath || "");
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const items = entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
          path: path.relative(VAULT_ROOT, path.join(resolved, e.name)),
        }));
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool: read_file
mcpServer.tool(
  "read_file",
  "Read the contents of a file in the vault.",
  { path: z.string().describe("Relative file path within the vault") },
  async ({ path: filePath }) => {
    try {
      const resolved = resolveAndValidate(filePath);
      const content = await fs.readFile(resolved, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool: write_file
mcpServer.tool(
  "write_file",
  "Create or overwrite a file in the vault. Use Markdown with YAML frontmatter for notes.",
  {
    path: z.string().describe("Relative file path within the vault"),
    content: z.string().describe("Full content to write to the file"),
  },
  async ({ path: filePath, content }) => {
    try {
      const resolved = resolveAndValidate(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf-8");
      const relPath = path.relative(VAULT_ROOT, resolved);
      return { content: [{ type: "text", text: `File written: ${relPath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool: delete_file
mcpServer.tool(
  "delete_file",
  "Delete a file from the vault. This is irreversible.",
  { path: z.string().describe("Relative file path to delete") },
  async ({ path: filePath }) => {
    try {
      const resolved = resolveAndValidate(filePath);
      await fs.unlink(resolved);
      return { content: [{ type: "text", text: `Deleted: ${filePath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool: search_files
mcpServer.tool(
  "search_files",
  "Search for files by name in the vault (case-insensitive substring match).",
  { query: z.string().describe("Search query to match against file and folder names") },
  async ({ query }) => {
    try {
      const results = [];
      await walk(VAULT_ROOT, query.toLowerCase(), results);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool: create_directory
mcpServer.tool(
  "create_directory",
  "Create a new directory (and any parent directories) in the vault.",
  { path: z.string().describe("Relative directory path to create") },
  async ({ path: dirPath }) => {
    try {
      const resolved = resolveAndValidate(dirPath);
      await fs.mkdir(resolved, { recursive: true });
      const relPath = path.relative(VAULT_ROOT, resolved);
      return { content: [{ type: "text", text: `Directory created: ${relPath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ── Express + Streamable HTTP Transport ─────────────────────────────

const app = express();
app.use(express.json({ limit: "10mb" }));

// Health check (outside MCP protocol — for Docker health checks)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", vault: vaultName });
});

// MCP endpoint — stateless Streamable HTTP
app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    res.on("close", () => {
      transport.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET and DELETE are not used in stateless mode — return 405
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST for stateless MCP." },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST for stateless MCP." },
    id: null,
  });
});

// ── Start ───────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server for "${vaultName}" listening on port ${PORT}`);
  console.log(`  Vault path: ${VAULT_ROOT}`);
  console.log(`  MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`  Health check: http://0.0.0.0:${PORT}/health`);
});
