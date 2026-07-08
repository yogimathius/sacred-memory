#!/usr/bin/env bash
# Sacred Memory — Post-session hook
# Runs at SessionEnd. Reads Claude Code's session payload from stdin,
# parses the transcript JSONL, synthesizes a session snapshot, and
# stores it as a tier-2 (session) memory that expires after 7 days.

set -euo pipefail

DB="${SACRED_CODEX_DB:-$HOME/.sacred-memory/codex.db}"

# Capture stdin before any other reads
PAYLOAD=$(cat)

# Always clean up expired session memories (tier 2, older than 7 days)
if [ -f "$DB" ]; then
  sqlite3 "$DB" "DELETE FROM canon WHERE trust_tier = 2 AND created_at < datetime('now', '-7 days');" 2>/dev/null || true
fi

# Process the session payload via Python
HOOK_PAYLOAD="$PAYLOAD" SACRED_DB="$DB" python3 << 'PYEOF'
import os, json, sys, sqlite3, uuid, datetime, re

db_path = os.environ.get('SACRED_DB', os.path.expanduser('~/.sacred-memory/codex.db'))
payload_raw = os.environ.get('HOOK_PAYLOAD', '').strip()

if not payload_raw:
    sys.exit(0)

try:
    payload = json.loads(payload_raw)
except Exception:
    sys.exit(0)

# Claude Code sends transcript_path in the SessionEnd payload
transcript_path = payload.get('transcript_path') or payload.get('transcriptPath')
if not transcript_path or not os.path.exists(transcript_path):
    sys.exit(0)

# Parse JSONL transcript — collect user messages and tool outputs
user_messages = []
try:
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                role = entry.get('role') or entry.get('type', '')
                content = entry.get('content', '')

                # Content can be a string or a list of content blocks
                if isinstance(content, list):
                    content = ' '.join(
                        block.get('text', '')
                        for block in content
                        if isinstance(block, dict) and block.get('type') == 'text'
                    )

                if not isinstance(content, str):
                    continue

                content = content.strip()
                # Only meaningful user messages (skip short confirmations)
                if role in ('user', 'human') and len(content) > 15:
                    # Strip any system-reminder tags that leak into content
                    content = re.sub(r'<[^>]+>', '', content).strip()
                    if content:
                        user_messages.append(content[:200])
            except Exception:
                continue
except Exception:
    sys.exit(0)

if not user_messages:
    sys.exit(0)

# Build a concise session snapshot
session_date = datetime.datetime.utcnow().strftime('%Y-%m-%d')

# Take first 3 user messages as topic indicators
snippets = [m[:100] for m in user_messages[:3]]
topic_line = ' | '.join(snippets)

total_turns = len(user_messages)
summary = f'Session {session_date} ({total_turns} turns): {topic_line}'

try:
    db = sqlite3.connect(db_path)
    memory_id = 'session-' + str(uuid.uuid4())
    db.execute(
        'INSERT OR REPLACE INTO canon (id, content, tags, trust_tier, created_at) VALUES (?, ?, ?, 2, datetime("now"))',
        (memory_id, summary, '["session","auto"]')
    )
    db.commit()
    db.close()
    print(f'[sacred-memory] Session snapshot saved ({total_turns} turns): {memory_id}')
except Exception as e:
    print(f'[sacred-memory] Warning: could not save session snapshot: {e}', file=sys.stderr)
PYEOF
