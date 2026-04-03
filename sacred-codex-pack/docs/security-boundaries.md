# Security Boundaries and Safety Considerations

The sacred codex memory architecture is designed with strong privacy and integrity guarantees.

## Local‑first storage

All canon and enduring memory are stored locally in files or databases controlled by the user.  No cloud sync occurs by default.  This prevents unauthorized access or data exfiltration.

## Encryption

Optionally, the vault and the memory database may be encrypted at rest.  Users should manage encryption keys securely and employ strong passphrases.

## Secret handling

Secrets such as API keys, passwords, tokens and private file contents must never be stored in memory.  The memory harness filters out sensitive patterns and refuses to persist them.

## Execution safety

Agent hooks should treat memory content as untrusted context.  Never execute code contained in memory items.  Memory is for context injection, not for code execution.

## Scope isolation

Memory is scoped by user, repository and branch.  A memory item from one project should not leak into another unless explicitly marked as global.

## Human in the loop

Only a human can promote reflections into the canon.  There is no fully autonomous pathway for updating the canon.

By adhering to these boundaries, the system maintains the sanctity of the sacred codex while still benefiting from dynamic memory.