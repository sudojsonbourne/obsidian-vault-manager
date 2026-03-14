const required = [
  "AUDREY_CLIENT_ID",
  "AUDREY_CLIENT_SECRET",
  "TAYLOR_CLIENT_ID",
  "TAYLOR_CLIENT_SECRET",
  "AUTH_SECRET",
  "AUDREY_PUBLIC_URL",
  "TAYLOR_PUBLIC_URL",
  "AUDREY_BACKEND",
  "TAYLOR_BACKEND",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  authSecret: process.env.AUTH_SECRET,
  dbPath: process.env.DB_PATH || "/data/auth.db",

  vaults: {
    audrey: {
      clientId: process.env.AUDREY_CLIENT_ID,
      clientSecret: process.env.AUDREY_CLIENT_SECRET,
      publicUrl: process.env.AUDREY_PUBLIC_URL,
      backend: process.env.AUDREY_BACKEND,
    },
    taylor: {
      clientId: process.env.TAYLOR_CLIENT_ID,
      clientSecret: process.env.TAYLOR_CLIENT_SECRET,
      publicUrl: process.env.TAYLOR_PUBLIC_URL,
      backend: process.env.TAYLOR_BACKEND,
    },
  },

  tokens: {
    accessTtlSeconds: 3600,        // 1 hour
    refreshTtlSeconds: 7776000,    // 90 days
    codeTtlSeconds: 600,           // 10 minutes
  },
};

/**
 * Resolve vault name from the Host header.
 * Returns "audrey" or "taylor", or null if unrecognized.
 */
export function resolveVault(host) {
  if (!host) return null;
  const h = host.split(":")[0].toLowerCase();
  for (const [name, vault] of Object.entries(config.vaults)) {
    const publicHost = new URL(vault.publicUrl).hostname;
    if (h === publicHost) return name;
  }
  return null;
}

/**
 * Look up a vault by client_id. Returns the vault name or null.
 */
export function resolveVaultByClientId(clientId) {
  for (const [name, vault] of Object.entries(config.vaults)) {
    if (vault.clientId === clientId) return name;
  }
  return null;
}
