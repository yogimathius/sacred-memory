#!/usr/bin/env bash
# Sacred Memory — Post-session hook
# Runs at SessionEnd. Reads the session transcript and extracts key memories.
# Uses a lightweight heuristic: scans for "remember" / "important" / decision patterns.
# For full synthesis, use the MCP `remember` tool during the session itself.

set -euo pipefail

DB="${SACRED_CODEX_DB:-$HOME/.sacred-memory/codex.db}"

if [ ! -f "$DB" ]; then
  exit 0
fi

# Session timestamp for any auto-generated memories
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Clean up expired session memories (tier 2, older than 7 days)
sqlite3 "$DB" "DELETE FROM canon WHERE trust_tier = 2 AND created_at < datetime('now', '-7 days');" 2>/dev/null || true

echo "[sacred-memory] Post-session cleanup complete at $TIMESTAMP"
