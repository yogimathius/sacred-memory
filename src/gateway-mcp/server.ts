import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import path from "path";

const DEFAULT_DB = path.join(process.env["HOME"] ?? ".", ".sacred-memory", "codex.db");
const DB_PATH = process.env["SACRED_CODEX_DB"] ?? DEFAULT_DB;
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Schema — idempotent migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS canon (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    tags TEXT,
    trust_tier INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS canon_fts USING fts5(
    content, content='canon', content_rowid='rowid'
  );
  CREATE TRIGGER IF NOT EXISTS canon_ai AFTER INSERT ON canon BEGIN
    INSERT INTO canon_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS canon_ad AFTER DELETE ON canon BEGIN
    INSERT INTO canon_fts(canon_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS canon_au AFTER UPDATE ON canon BEGIN
    INSERT INTO canon_fts(canon_fts, rowid, content) VALUES('delete', old.rowid, old.content);
    INSERT INTO canon_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
`);

// Add created_at column if missing (migration for existing DBs)
try {
  db.exec("ALTER TABLE canon ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
} catch {
  // Column already exists — safe to ignore
}

// Rebuild FTS index to handle any orphaned state
try {
  db.exec("INSERT INTO canon_fts(canon_fts) VALUES('rebuild')");
} catch {
  // FTS table might be fresh — ignore
}

// Prepared statements
const stmtSearch = db.prepare(`
  SELECT c.id, c.content, c.tags, c.trust_tier, c.created_at
  FROM canon c JOIN canon_fts f ON c.rowid = f.rowid
  WHERE f.canon_fts MATCH ? ORDER BY f.rank LIMIT 20
`);
const stmtListAll = db.prepare(
  "SELECT id, content, tags, trust_tier, created_at FROM canon ORDER BY trust_tier ASC, rowid DESC LIMIT 50"
);
const stmtListCanon = db.prepare(
  "SELECT id, content, tags FROM canon WHERE trust_tier = 0 ORDER BY rowid ASC"
);
const stmtRemember = db.prepare(
  "INSERT OR REPLACE INTO canon (id, content, tags, trust_tier, created_at) VALUES (?, ?, ?, 1, datetime('now'))"
);
const stmtForget = db.prepare("DELETE FROM canon WHERE id = ?");

type Row = { id: string; content: string; tags?: string; trust_tier: number; created_at?: string };

function formatRow(r: Row): string {
  const tier = r.trust_tier === 0 ? "canon" : r.trust_tier === 1 ? "enduring" : r.trust_tier === 2 ? "session" : `tier-${r.trust_tier}`;
  const time = r.created_at ? ` · ${r.created_at}` : "";
  return `[${r.id}] (${tier}${time})\n${r.content}`;
}

// ----- MCP Server -----

const server = new Server(
  { name: "sacred-memory", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "recall",
      description:
        "Search sacred memory for relevant context, preferences, axioms, or past learnings. Use before acting when the domain overlaps with anything that might have been remembered.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for. Supports FTS5 syntax.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "remember",
      description:
        "Save something to enduring memory — a preference, learning, decision, or fact that should persist across sessions.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The thing to remember." },
          tags: {
            type: "string",
            description:
              'Optional JSON array of tags, e.g. ["preference", "workflow"]',
          },
        },
        required: ["content"],
      },
    },
    {
      name: "forget",
      description: "Remove a specific memory by ID. Use only when explicitly asked.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "The memory ID to remove." },
        },
        required: ["id"],
      },
    },
    {
      name: "list_canon",
      description:
        "List the sacred axioms (tier 0) — foundational truths that should always be respected.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "recall") {
      const query = (args?.["query"] as string)?.trim();
      if (!query) {
        // No query — list everything
        const rows = stmtListAll.all() as Row[];
        if (!rows.length) return { content: [{ type: "text" as const, text: "No memories found." }] };
        return { content: [{ type: "text" as const, text: rows.map(formatRow).join("\n\n") }] };
      }
      // Try FTS search; fall back to LIKE if FTS syntax fails
      let rows: Row[];
      try {
        rows = stmtSearch.all(query) as Row[];
      } catch {
        // FTS5 syntax error (e.g. bare *, special chars) — fall back to LIKE
        const likeSt = db.prepare(
          "SELECT id, content, tags, trust_tier, created_at FROM canon WHERE content LIKE ? ORDER BY trust_tier ASC, rowid DESC LIMIT 20"
        );
        rows = likeSt.all(`%${query}%`) as Row[];
      }
      if (!rows.length) return { content: [{ type: "text" as const, text: "No memories found." }] };
      return { content: [{ type: "text" as const, text: rows.map(formatRow).join("\n\n") }] };
    }

    if (name === "remember") {
      const id = `memory-${randomUUID()}`;
      const content = args?.["content"] as string;
      const tags = (args?.["tags"] as string | undefined) ?? "[]";
      stmtRemember.run(id, content, tags);
      return { content: [{ type: "text" as const, text: `Remembered [${id}]: ${content}` }] };
    }

    if (name === "forget") {
      const id = args?.["id"] as string;
      const result = stmtForget.run(id);
      return {
        content: [
          {
            type: "text" as const,
            text: result.changes > 0 ? `Forgot [${id}].` : `No memory found with ID ${id}.`,
          },
        ],
      };
    }

    if (name === "list_canon") {
      const rows = stmtListCanon.all() as Array<{ id: string; content: string }>;
      if (!rows.length) return { content: [{ type: "text" as const, text: "No canon axioms found." }] };
      return { content: [{ type: "text" as const, text: rows.map((r) => `[${r.id}]\n${r.content}`).join("\n\n") }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: unknown) {
    return {
      content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Sacred Memory MCP running (db: ${DB_PATH})`);
