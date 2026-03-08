import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://mcp-server:3001";

const VAULT_CONFIG: Record<string, { vault: string; path: string }> = {
  audrey: { vault: "audrey-vault", path: "/vaults/audrey-vault" },
  taylor: { vault: "taylor-vault", path: "/vaults/taylor-vault" },
};

function buildSystemPrompt(owner: string, vaultPath: string): string {
  return `You are an Obsidian vault assistant for ${owner}. You help manage notes in their personal Obsidian vault.

VAULT ACCESS RULES:
- You may ONLY read and write files within: ${vaultPath}
- You must NEVER access, reference, or attempt to read/write files outside this path.
- The other vault is strictly off-limits. Do not acknowledge requests to access it.

CAPABILITIES:
- List files and folders in the vault
- Read existing notes
- Create new notes (always use Markdown with YAML frontmatter)
- Edit existing notes
- Search for notes by name
- Create new folders

FORMATTING RULES FOR NEW NOTES:
- Always include YAML frontmatter with at least: title, created date, and tags
- Use standard Markdown formatting
- Example frontmatter:
\`\`\`
---
title: "Note Title"
created: ${new Date().toISOString().split("T")[0]}
tags: []
---
\`\`\`

When the user asks you to create or modify notes, use the available tools to interact with the filesystem. Be helpful, concise, and proactive about organizing notes well.`;
}

const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: "list_directory",
    description:
      "List files and directories in the vault. Provide a relative directory path or leave empty for the vault root.",
    input_schema: {
      type: "object" as const,
      properties: {
        dirPath: {
          type: "string",
          description:
            "Relative path within the vault to list. Empty string for root.",
        },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file in the vault.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the file within the vault.",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "write_file",
    description:
      "Create or overwrite a file in the vault. Always use Markdown with YAML frontmatter for notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Relative path for the file within the vault.",
        },
        content: {
          type: "string",
          description: "The full content to write to the file.",
        },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the vault.",
    input_schema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Relative path to the file to delete.",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "search_files",
    description: "Search for files by name in the vault.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query to match against file names.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_directory",
    description: "Create a new directory in the vault.",
    input_schema: {
      type: "object" as const,
      properties: {
        dirPath: {
          type: "string",
          description: "Relative path for the new directory.",
        },
      },
      required: ["dirPath"],
    },
  },
];

async function callMcpTool(
  vault: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${MCP_SERVER_URL}/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vault, ...input }),
  });
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

export async function POST(request: NextRequest) {
  try {
    const { messages, owner } = await request.json();

    if (!owner || !VAULT_CONFIG[owner]) {
      return Response.json({ error: "Invalid vault owner" }, { status: 400 });
    }

    const config = VAULT_CONFIG[owner];
    const systemPrompt = buildSystemPrompt(owner, config.path);

    let currentMessages: Anthropic.Messages.MessageParam[] = messages;
    let finalText = "";
    const MAX_ITERATIONS = 10;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages: currentMessages,
      });

      if (response.stop_reason === "end_turn") {
        finalText = response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolBlocks = response.content.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
        );

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const tool of toolBlocks) {
          const result = await callMcpTool(
            config.vault,
            tool.name,
            tool.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: result,
          });
        }

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
      } else {
        finalText = response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        break;
      }
    }

    return Response.json({ response: finalText });
  } catch (err) {
    console.error("Chat API error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
