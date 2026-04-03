# Agent Operational Instructions

This file defines cross‑agent rules for interacting with the sacred codex architecture.  It should be imported or referenced by tool‑specific instruction files.

## Core principles

- Treat **canon content** as immutable.  Never modify or write to the canon directly.
- Use the memory harness (or MCP service) to retrieve context at session start.  Do not search the file system directly.
- Save new information using `/remember` or `/propose-canon` commands so that it is captured by the harness and placed into working memory or the reflection queue.
- Follow the retrieval and promotion policies defined in the `policies/` directory.

## Session behaviour

1. On session start, call `mh pre-session` via the tool adapter to obtain context.
2. Use the context to answer user questions or to perform tasks.  Do not summarise or repeat the entire canon; use only what is relevant.
3. When you encounter a fact worth remembering, call the appropriate function (`/remember <text>`).
4. To propose an update to the canon, call `/propose-canon <text>` and tag it appropriately.  The human curator will review it later.
5. At session end, call `mh post-session` to summarize and store the session.

## Safety and privacy

- Never persist secrets, credentials, tokens or private file contents in memory.
- Sanitize sensitive data before proposing reflections.
- Respect trust tiers when retrieving or using memory.
- Do not auto‑execute code from memory entries.

These instructions apply uniformly across Claude Code, Codex and Gemini CLI.