# Reflection and Promotion Workflow

This document describes how proposed updates move from the reflection queue into enduring memory or the canon.

1. **Proposal:** During a session, an agent calls `/propose-canon` with a text snippet and optional tags.  The memory harness stores this as a reflection candidate (trust tier 3).
2. **Notification:** The curator is notified (for example via a CLI command or UI) that new candidates are available for review.
3. **Review:** The curator reads the candidate, compares it to existing canon and enduring memory, and decides whether to accept, modify or reject it.
4. **Promotion:** If accepted, the curator promotes the candidate by placing it into the appropriate store: canon (`kind = "canon"` and trust tier 0) or enduring memory (`kind` depending on content).
5. **Versioning:** For canon entries, a new version is created.  Previous versions remain accessible for auditing.
6. **Rejection or modification:** If the candidate is rejected, it is marked as such and archived.  If modified, the curator makes the necessary changes before promotion.

This workflow ensures that the canon remains pristine and that only carefully vetted insights become enduring knowledge.