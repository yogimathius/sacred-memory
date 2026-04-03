# Sacred Codex Memory Architecture

This document provides a high‑level overview of the sacred codex memory architecture.  The system is designed to preserve a protected canon while enabling dynamic context injection and reflection when working with agentic AI tools such as Claude Code, Codex, Gemini CLI and related tools.

## Layers of memory

1. **Canon vault:** The canonical store of sacred axioms, doctrines, symbolic vocabulary and foundational truths.  This material is immutable or versioned deliberately, encrypted at rest, local‑first and never modified automatically by agents.  Only explicit promotion by the user or curator updates the canon.

2. **Enduring memory:** Long‑term preferences, biography, recurring projects, persistent response styles and other durable context.  Enduring memory is curated and updatable but still distinct from the canon.  Retrieval honours scopes (global, project, branch) and trust tiers.  Sensitive information is excluded.

3. **Working memory:** Ephemeral context for the current session, such as active task state, recent summaries and repository conventions.  Working memory expires unless promoted to a higher tier.  It can be auto‑written by the memory harness.

4. **Reflection queue:** A quarantine area for candidate insights and proposed additions.  Nothing is merged into enduring memory or the canon by default.  Agents may propose reflections, but a human must review and promote them.

## Supporting components

- **Memory harness / session router:** A CLI wrapper or hook that runs at session start and end.  It detects the tool (e.g., Claude Code, Codex, Gemini CLI), repository context and task scope, then retrieves the appropriate canon slice, enduring memory and working memory.  At session end it extracts summaries and reflections.  It never writes directly to the canon.

- **MCP (Memory Control Plane) server (optional):** A local service that exposes RPC endpoints for retrieving canon slices, searching memory, proposing reflections and promoting candidates.  Claude Code, Codex and Gemini can all connect to a single MCP service via their MCP integration.

- **Tool adapters:** Thin wrappers or hooks for each AI CLI/IDE.  They call the memory harness or MCP service to obtain context and to save session deltas.  Claude Code uses its `SessionStart` and `SessionEnd` hooks.  Codex uses layered config and experimental hooks.  Gemini CLI uses `GEMINI.md` and `GEMINI_SYSTEM_MD` overrides.

- **Review & promotion workflow:** A separate review tool or command for the human curator to inspect reflection candidates, diff them against existing canon or enduring memory and explicitly promote or reject them.  This prevents automatic pollution of the sacred codex.

## Session lifecycle

1. **Pre‑session:** The adapter detects the tool and context and invokes the memory harness with `mh pre-session`.  The harness loads relevant canon entries, enduring memories and working notes and assembles a clean context payload.  It injects this into the tool via the appropriate mechanism (Claude hooks, Codex config, Gemini context files).

2. **During session:** Agents may call `/remember …` to store facts in working memory or `/propose-canon …` to create reflection candidates.  The harness tracks session deltas.

3. **Post‑session:** The adapter invokes `mh post-session`.  The harness summarizes the session, extracts important facts and stores them as working memory.  Proposed canon updates are placed into the reflection queue.  Nothing is automatically promoted.

## Trust tiers

Each memory item is tagged with a trust tier:

- **Tier 0 — Canon:** Immutable sacred content.
- **Tier 1 — Enduring verified:** Curated long‑term memory.
- **Tier 2 — Working memory:** Active session context.
- **Tier 3 — Candidate reflection:** Proposed additions awaiting review.
- **Tier 4 — Raw session residue:** Temporary raw logs or notes.

Retrieval prefers higher trust tiers and requires explicit consent before using lower tiers.

## Technology stack (suggested v1)

- **Storage:** Local files (Markdown/YAML/JSON) in a Git repository for the canon; SQLite with FTS5 for indexing memory items; optional encryption at rest.
- **Harness:** A small CLI written in Rust or TypeScript that wraps each tool.
- **Adapters:** Shell scripts or JSON hooks for Claude Code, Codex and Gemini CLI.
- **MCP:** Optional microservice exposing retrieval and write APIs.
- **Review UI:** Terminal CLI or simple web UI for reviewing and promoting reflections.

This architecture keeps the sacred codex isolated and protected while still enabling dynamic and contextual agentic workflows.