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

// Defensive column migrations — use simple defaults only (older SQLite can't use
// function expressions like datetime('now') as ALTER TABLE defaults)
for (const migration of [
  "ALTER TABLE canon ADD COLUMN created_at TEXT",
  "ALTER TABLE canon ADD COLUMN embedding BLOB",
]) {
  try { db.exec(migration); } catch { /* already exists — safe to ignore */ }
}

// Rebuild FTS index to handle any orphaned state
try { db.exec("INSERT INTO canon_fts(canon_fts) VALUES('rebuild')"); } catch { /* fresh */ }

// ── Embedding helpers (Ollama / nomic-embed-text) ──────────────────────────

async function getEmbedding(text: string): Promise<Buffer | null> {
  try {
    const resp = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { embedding?: number[] };
    if (!data.embedding?.length) return null;
    return Buffer.from(new Float32Array(data.embedding).buffer);
  } catch {
    return null; // Ollama not running — graceful fallback to FTS5 only
  }
}

function cosine(a: Buffer, b: Buffer): number {
  const fa = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
  const fb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  if (fa.length !== fb.length || fa.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < fa.length; i++) {
    dot += fa[i]! * fb[i]!;
    na  += fa[i]! * fa[i]!;
    nb  += fb[i]! * fb[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ── Prepared statements ────────────────────────────────────────────────────

const stmtSearch = db.prepare(`
  SELECT c.id, c.content, c.tags, c.trust_tier, c.created_at, c.embedding
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
  "INSERT OR REPLACE INTO canon (id, content, tags, trust_tier, embedding, created_at) VALUES (?, ?, ?, 1, ?, datetime('now'))"
);
const stmtForget = db.prepare("DELETE FROM canon WHERE id = ?");

type Row = {
  id: string;
  content: string;
  tags?: string;
  trust_tier: number;
  created_at?: string;
  embedding?: Buffer;
};

function formatRow(r: Row): string {
  const tier =
    r.trust_tier === 0 ? "canon"
    : r.trust_tier === 1 ? "enduring"
    : r.trust_tier === 2 ? "session"
    : `tier-${r.trust_tier}`;
  const time = r.created_at ? ` · ${r.created_at}` : "";
  return `[${r.id}] (${tier}${time})\n${r.content}`;
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "sacred-memory", version: "0.3.0" },
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
            description: "What to search for. Supports FTS5 syntax. Leave empty to list all memories.",
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
            description: 'Optional JSON array of tags, e.g. ["preference", "workflow"]',
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
    // ── recall ─────────────────────────────────────────────────────────────
    if (name === "recall") {
      const query = (args?.["query"] as string)?.trim();

      if (!query) {
        const rows = stmtListAll.all() as Row[];
        if (!rows.length) return { content: [{ type: "text" as const, text: "No memories found." }] };
        return { content: [{ type: "text" as const, text: rows.map(formatRow).join("\n\n") }] };
      }

      // FTS5 search with LIKE fallback
      let rows: Row[];
      try {
        rows = stmtSearch.all(query) as Row[];
      } catch {
        const likeSt = db.prepare(
          "SELECT id, content, tags, trust_tier, created_at, embedding FROM canon WHERE content LIKE ? ORDER BY trust_tier ASC, rowid DESC LIMIT 20"
        );
        rows = likeSt.all(`%${query}%`) as Row[];
      }

      if (!rows.length) return { content: [{ type: "text" as const, text: "No memories found." }] };

      // Semantic reranking when Ollama is available and we have >1 result
      if (rows.length > 1) {
        const queryEmbedding = await getEmbedding(query);
        if (queryEmbedding) {
          rows = rows
            .map((row) => ({
              row,
              score: row.embedding ? cosine(queryEmbedding, row.embedding) : 0,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(({ row }) => row);
        }
      }

      return { content: [{ type: "text" as const, text: rows.map(formatRow).join("\n\n") }] };
    }

    // ── remember ───────────────────────────────────────────────────────────
    if (name === "remember") {
      const id = `memory-${randomUUID()}`;
      const content = args?.["content"] as string;
      const tags = (args?.["tags"] as string | undefined) ?? "[]";
      const embedding = await getEmbedding(content);
      stmtRemember.run(id, content, tags, embedding);
      return { content: [{ type: "text" as const, text: `Remembered [${id}]: ${content}` }] };
    }

    // ── forget ─────────────────────────────────────────────────────────────
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

    // ── list_canon ─────────────────────────────────────────────────────────
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
console.error(`Sacred Memory MCP v0.3.0 running (db: ${DB_PATH})`);
