# Mobile session — public contract (DRAFT)

> Status: **DRAFT** — accompanies the 2026 RFC working draft.  
> Archived decision record (2025): see Confluence page linked from the epic.

## Scope

This document tracks **SDK-visible** contract elements that may change when we revisit the 2025 RFC:

| Area | Stable today (2025 RFC) | Under review (2026) |
|------|-------------------------|------------------------|
| Refresh cadence | fixed backoff ladder | may shorten + add jitter policy |
| Token families | single refresh family | may split access vs refresh |
| Error taxonomy | `auth.session_expired` | may add `auth.rotation_required` |
| Storage | OS secure storage only | may add binding attestations |

## Open decisions

1. Rotation on every successful refresh vs risk-based rotation  
2. MDM / enterprise profile constraints (see MOBL-62)  
3. Deprecation window for SDK minors (see MOBL-61)

## Links

- Jira: MOBL-59 (epic), MOBL-60 (RFC decision draft), MOBL-61 (SDK contract), MOBL-62 (spike)
- Confluence: archived 2025 RFC + working draft 2026 (MD1 space)
