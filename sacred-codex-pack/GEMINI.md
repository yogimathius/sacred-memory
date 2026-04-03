# Gemini CLI Memory Instructions

This file provides context for Gemini CLI agent operations.  For cross‑agent rules import `AGENTS.md`.

```md
@import ./AGENTS.md
```

## Usage

- Place persistent context in this `GEMINI.md` file.  Gemini CLI concatenates the contents of `GEMINI.md` files in the current directory hierarchy, so use this file sparingly to define project‑level context.
- At session start, the memory harness writes a temporary context file and sets the `GEMINI_SYSTEM_MD` environment variable to override the default system prompt.  This allows strict control over the system prompt for each session.
- When using the memory harness, always read the injected context before answering questions.  Use only the relevant portions of the canon and memory.
- Use `/remember` and `/propose-canon` commands (or their equivalents) to add new information.  These will be captured by the memory harness at session end.
- Do not modify or write to the canon directly.  All updates must go through the reflection queue and be promoted by a human curator.

For more detail, see `docs/session-lifecycle.md`.