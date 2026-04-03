# MCP Service Tool Definitions

The Memory Control Plane (MCP) service exposes a set of RPC methods over HTTP or JSON‑RPC.  These methods are consumed by the memory harness or tool adapters.

## Methods

### get_canon_slice

Retrieve canon entries for a given scope or query.

- **Params:** `scope` (string), `query` (string, optional)
- **Returns:** A list of canon entries and their metadata.

### search_memory

Search across enduring and working memory.

- **Params:** `scope` (string), `query` (string)
- **Returns:** A list of memory items ordered according to the retrieval policy.

### propose_reflection

Submit a candidate reflection to the reflection queue.

- **Params:** `content` (string), `tags` (array of strings), `scope` (string)
- **Returns:** The created reflection candidate with its identifier.

### promote_candidate

Promote a candidate reflection into enduring memory or canon.

- **Params:** `candidate_id` (string), `target` (string: `canon` or `enduring`)
- **Returns:** The promoted entry.

### list_active_threads

List current sessions or contexts being tracked by the memory harness.

- **Params:** None
- **Returns:** A list of active session identifiers and metadata.

These methods provide a stable interface for tools to interact with the memory system.