# Canon and Memory Data Model

This document defines the schema used to store canon entries, enduring memory, working memory and reflection candidates.

## Common fields

- `id`: A unique identifier for the memory item.
- `scope`: One of `global`, `repo`, `branch` or `task`.
- `tool`: The tool or adapter (e.g., `claude`, `codex`, `gemini`) to which this memory is most relevant.
- `kind`: The kind of memory: `preference`, `convention`, `task_state`, `summary`, `fact`, `canon` or `candidate`.
- `content`: The text or structured data being stored.
- `tags`: A list of user‑defined tags.
- `confidence`: A numeric score representing extraction confidence (0–1).
- `pinned`: A boolean indicating whether this item should always be retrieved.
- `created_at`: Timestamp of creation.
- `last_used_at`: Timestamp of the last retrieval.
- `expires_at`: Optional expiration timestamp.
- `source_session_id`: Identifier for the session in which this memory was created.

## Canon entry

Canon entries have `kind = "canon"` and are stored in the canon vault.  They are versioned explicitly and immutable by default.

## Enduring memory

These entries persist across sessions and projects.  They use the `preference`, `convention`, `summary` or `fact` kinds.

## Working memory

These entries are temporary and associated with the current session or task.  They expire or are summarized after session end.

## Reflection candidate

These entries sit in the reflection queue awaiting review.  They have `kind = "candidate"` and include metadata about why they were proposed and by whom.