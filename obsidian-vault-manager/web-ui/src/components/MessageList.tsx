"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          color: "var(--text-secondary)",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Welcome to your vault
          </p>
          <p style={{ fontSize: "0.9rem" }}>
            Ask me to create notes, search your vault, or organize your files.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}
        >
          <div
            style={{
              maxWidth: "85%",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius)",
              background:
                msg.role === "user"
                  ? "var(--user-bubble)"
                  : "var(--assistant-bubble)",
              border:
                msg.role === "assistant"
                  ? "1px solid var(--border)"
                  : "none",
              fontSize: "0.95rem",
              lineHeight: 1.5,
            }}
          >
            {msg.role === "assistant" ? (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
            )}
          </div>
        </div>
      ))}
      {isLoading && (
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius)",
              background: "var(--assistant-bubble)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <LoadingDots />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function LoadingDots() {
  return (
    <span>
      <style>{`
        @keyframes blink {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          80%, 100% { opacity: 0.2; }
        }
        .dot { animation: blink 1.4s infinite both; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </span>
  );
}
