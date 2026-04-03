#!/usr/bin/env bash
# Sacred Memory — Pre-session hook
# Runs at SessionStart. Queries the DB and emits context for Claude to read.
# Output goes to stdout → Claude sees it as additionalContext.

set -euo pipefail

DB="${SACRED_CODEX_DB:-$HOME/.sacred-memory/codex.db}"

if [ ! -f "$DB" ]; then
  exit 0  # No DB yet — fail silently
fi

echo "## Sacred Memory — Session Context"
echo ""

# 1. Canon axioms (tier 0) — always surface these
CANON=$(sqlite3 "$DB" "SELECT content FROM canon WHERE trust_tier = 0 ORDER BY rowid ASC;" 2>/dev/null)
if [ -n "$CANON" ]; then
  echo "### Sacred Axioms"
  echo "$CANON" | while IFS= read -r line; do
    echo "- $line"
  done
  echo ""
fi

# 2. Enduring memories (tier 1) — most recent 15
MEMORIES=$(sqlite3 "$DB" "SELECT content FROM canon WHERE trust_tier = 1 ORDER BY rowid DESC LIMIT 15;" 2>/dev/null)
if [ -n "$MEMORIES" ]; then
  echo "### Enduring Memories"
  echo "$MEMORIES" | while IFS= read -r line; do
    echo "- $line"
  done
  echo ""
fi

# 3. Session memories (tier 2) — if any exist, recent ones
SESSION=$(sqlite3 "$DB" "SELECT content FROM canon WHERE trust_tier = 2 ORDER BY rowid DESC LIMIT 5;" 2>/dev/null)
if [ -n "$SESSION" ]; then
  echo "### Recent Session Context"
  echo "$SESSION" | while IFS= read -r line; do
    echo "- $line"
  done
  echo ""
fi

echo "---"
echo "Use the sacred-memory MCP tools (recall, remember, forget, list_canon) to interact with this memory system."
