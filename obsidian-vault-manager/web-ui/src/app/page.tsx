import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: "1.5rem",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        Obsidian Vault Manager
      </h1>
      <p style={{ color: "var(--text-secondary)", textAlign: "center" }}>
        Select your vault to get started
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          width: "100%",
          maxWidth: "320px",
        }}
      >
        <Link
          href="/audrey"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            background: "var(--accent)",
            color: "white",
            borderRadius: "var(--radius)",
            textDecoration: "none",
            fontSize: "1.1rem",
            fontWeight: 600,
            minHeight: "56px",
          }}
        >
          Audrey&apos;s Vault
        </Link>
        <Link
          href="/taylor"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            background: "var(--bg-tertiary)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            textDecoration: "none",
            fontSize: "1.1rem",
            fontWeight: 600,
            minHeight: "56px",
          }}
        >
          Taylor&apos;s Vault
        </Link>
      </div>
    </div>
  );
}
