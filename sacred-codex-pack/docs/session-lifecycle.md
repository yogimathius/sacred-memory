# Session Lifecycle

The memory harness manages memory across the lifespan of a session.

## Pre‑session

- The tool adapter invokes `mh pre-session`, passing the current tool name, working directory and optional task information.
- The harness looks up relevant canon entries, enduring memory items and working memory for the scope.
- The harness assembles these into a context payload and returns it to the adapter, which injects it into the tool via hooks or environment variables.
- The harness may also set up temporary storage or context files (for example, for Gemini via `GEMINI_SYSTEM_MD`).

## During session

- Agents interact with the user.  When they encounter information worth remembering, they call `/remember` with a description and optional tags.  The harness records this as working memory.
- When an agent encounters an insight or doctrine candidate, they call `/propose-canon` with the candidate text and tags.  The harness adds this to the reflection queue.
- Memory retrieval occurs via the harness or MCP as needed.

## Post‑session

- The adapter invokes `mh post-session`.
- The harness summarizes the session (extracts facts, decisions, next steps) and stores them as working memory.
- Any reflection candidates remain in the queue awaiting review.
- Working memory may be expired or summarized into enduring memory based on policies.

This lifecycle allows agents to operate with warm context while protecting the integrity of the canon.