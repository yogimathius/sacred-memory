# MCP Service Resources

This document lists the resource endpoints exposed by the MCP service.  Each resource corresponds to an RPC method described in `tools.md`.

- `/canon` – `GET` with parameters `scope` and optional `query` returns canon entries.
- `/memory/search` – `GET` with parameters `scope` and `query` returns memory items.
- `/reflection` – `POST` with a JSON body containing `content`, `tags` and `scope` creates a new reflection candidate.
- `/reflection/<id>/promote` – `POST` with a JSON body containing `target` promotes the candidate.
- `/sessions` – `GET` returns a list of active sessions.

These resources are illustrative; actual implementations may choose different transports or naming conventions.