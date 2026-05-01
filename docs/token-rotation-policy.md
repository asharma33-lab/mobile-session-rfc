# MOBL-59: Token Rotation Policy

Defines when and how token rotation is triggered under both Option A and Option B.

## Rotation triggers

| Trigger                          | Option A (single-token) | Option B (dual-token) |
|----------------------------------|-------------------------|-----------------------|
| Normal refresh (TTL expired)     | Rotate refresh token    | Rotate access + refresh |
| Concurrent use from 2+ IPs      | Rotate + alert          | Revoke access; rotate refresh + alert |
| User-agent mismatch              | Rotate                  | Revoke access; rotate refresh |
| Explicit user logout             | Revoke full family      | Revoke access + refresh family |
| Admin-initiated revocation       | Revoke full family      | Revoke access + refresh family |
| Device attestation failure       | Block refresh           | Block refresh; access expires naturally |

## Token family invalidation

A **token family** is the chain of refresh tokens issued from an original grant. If a
previously rotated refresh token is replayed, the entire family is immediately invalidated
(refresh token rotation with family tracking — see OAuth Security BCP §2.2.2).

```
Grant → RT-1 → RT-2 → RT-3 (current)
         ↑
  replay of RT-1 → entire family revoked, user forced to re-authenticate
```

## Rotation grace period

To handle network retries without forcing re-auth:

- A rotated token remains valid for **30 seconds** after rotation completes
- If the client presents the old token within the grace window, it receives the same new token
- After the grace window, old token presentation triggers family invalidation

## Lifetime configuration (proposed)

| Token type     | Default TTL | Min (MDM-enforced) | Max |
|----------------|-------------|---------------------|-----|
| Access token   | 15 min      | 5 min               | 60 min |
| Refresh token  | 7 days      | 1 day               | 30 days |
| Single refresh (Option A) | 7 days | 1 day          | 30 days |

## Open questions

- Does the 30-second grace period create a replay window wide enough to matter in practice?
- Should rotation on suspicious signals be synchronous (block the request) or async (allow + alert)?
- Who owns the token-family table in the backend — Identity Platform or Mobile API gateway?
