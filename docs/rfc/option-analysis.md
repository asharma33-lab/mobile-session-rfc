# MOBL-60: RFC Option Analysis — Session Token Refresh Strategy

Structured evaluation of Option A and Option B ahead of the formal RFC decision.

## Option A — Tighten the 2025 model

Keep the single refresh-token family. Layer on:

- **Device binding attestations** (iOS DeviceCheck / Android Play Integrity)
- **Shorter absolute lifetimes** — proposal: 7 days (down from 30)
- **Rotation on suspicious signals** — concurrent use from different IPs, user-agent mismatch

### Pros
- Minimal SDK surface change; existing consumers unaffected
- No new backend token-type infrastructure
- MDM-safe by default

### Cons
- Stolen refresh token still has up to 7-day blast radius if rotation signal is missed
- Device binding attestation is opt-in today; enforcement requires a flag day for all SDK versions

### Migration cost
- Backend: attestation validation endpoint + rotation signal pipeline
- SDK: `DeviceAttestation` module (new, optional in v1; required in v2)
- Estimated: 3–4 sprints

---

## Option B — Dual-token model

Introduce short-lived **access tokens** (15 min TTL) + rotating **refresh tokens** (7 days).

- Access token is bearer-only, used for API calls
- Refresh token is used solely to obtain a new access token
- On suspicious signal: access token revoked immediately; refresh token rotation triggered

### Pros
- Access token theft window bounded to 15 min without any rotation signal
- Aligns with OAuth 2.0 best practices (RFC 6749 §1.5)
- Cleaner revocation surface: revoke access without invalidating the session

### Cons
- Requires SDK consumers to handle two token lifetimes
- Enterprise MDM profiles cannot safely use hardware-backed refresh token binding
- React Native / Flutter bridge latency increases (see MOBL-62 compat matrix)

### Migration cost
- Backend: new access token issuance service + token introspection endpoint
- SDK: dual-token storage, silent refresh loop, downgrade path for MDM consumers
- Estimated: 6–8 sprints

---

## Decision criteria

| Criterion               | Weight | Option A | Option B |
|-------------------------|--------|----------|----------|
| Security improvement    | 40%    | Medium   | High     |
| SDK migration cost      | 25%    | Low      | High     |
| MDM / enterprise compat | 20%    | Full     | Partial  |
| Partner alignment       | 15%    | Medium   | High     |

## Recommended path

Proceed with **Option B** as the target state, with **Option A** as the explicit MDM
fallback. Gate Option A fallback behind a server-side capability flag to avoid indefinite
dual-maintenance. Decision owner: Mitch Davis. Review gates tracked in MOBL-60.
