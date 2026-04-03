# Claude Code Memory Instructions

Import the general agent rules from `AGENTS.md` for cross‑agent guidance.

```md
@import ./AGENTS.md
```

## Claude‑specific guidance

- Use the `SessionStart` hook to call `mh pre-session`.  Provide the JSON returned as `additionalContext` in the hook output.  This ensures that Claude receives the relevant canon slice, enduring memory and working memory before the user begins interacting.
- Use the `SessionEnd` hook to call `mh post-session` and store session summaries.  This collects new facts and reflections without modifying the canon directly.
- Place project‑specific memory files in the local memory store; the harness will merge them with the canon and enduring memory.
- Do not write directly into the canon or memory store.  Use `/remember` and `/propose-canon` so that the harness can triage and queue updates appropriately.
- If a tool or command cannot be executed due to memory policies, inform the user accordingly.

See `docs/session-lifecycle.md` for more detail on the session flow.