const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10mb" }));

const VAULTS_ROOT = "/vaults";
const ALLOWED_VAULTS = ["audrey-vault", "taylor-vault"];

function resolveAndValidate(vaultPath, filePath) {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const full = path.resolve(vaultPath, normalized);
  if (!full.startsWith(vaultPath)) {
    throw new Error("Path traversal detected");
  }
  return full;
}

function getVaultPath(vault) {
  if (!ALLOWED_VAULTS.includes(vault)) {
    throw new Error(`Invalid vault: ${vault}`);
  }
  return path.join(VAULTS_ROOT, vault);
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// List files in a vault directory
app.post("/tools/list_directory", async (req, res) => {
  try {
    const { vault, dirPath = "" } = req.body;
    const vaultPath = getVaultPath(vault);
    const resolved = resolveAndValidate(vaultPath, dirPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
        path: path.relative(vaultPath, path.join(resolved, e.name)),
      }));
    res.json({ success: true, items });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Read a file
app.post("/tools/read_file", async (req, res) => {
  try {
    const { vault, filePath } = req.body;
    const vaultPath = getVaultPath(vault);
    const resolved = resolveAndValidate(vaultPath, filePath);
    const content = await fs.readFile(resolved, "utf-8");
    res.json({ success: true, content });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Write / create a file
app.post("/tools/write_file", async (req, res) => {
  try {
    const { vault, filePath, content } = req.body;
    const vaultPath = getVaultPath(vault);
    const resolved = resolveAndValidate(vaultPath, filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    res.json({ success: true, path: path.relative(vaultPath, resolved) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete a file
app.post("/tools/delete_file", async (req, res) => {
  try {
    const { vault, filePath } = req.body;
    const vaultPath = getVaultPath(vault);
    const resolved = resolveAndValidate(vaultPath, filePath);
    await fs.unlink(resolved);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Search files by name pattern
app.post("/tools/search_files", async (req, res) => {
  try {
    const { vault, query } = req.body;
    const vaultPath = getVaultPath(vault);
    const results = [];
    const lowerQuery = query.toLowerCase();

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
            path: path.relative(vaultPath, fullPath),
          });
        }
        if (entry.isDirectory()) {
          await walk(fullPath);
        }
      }
    }

    await walk(vaultPath);
    res.json({ success: true, results });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Create directory
app.post("/tools/create_directory", async (req, res) => {
  try {
    const { vault, dirPath } = req.body;
    const vaultPath = getVaultPath(vault);
    const resolved = resolveAndValidate(vaultPath, dirPath);
    await fs.mkdir(resolved, { recursive: true });
    res.json({ success: true, path: path.relative(vaultPath, resolved) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP filesystem server listening on port ${PORT}`);
});
