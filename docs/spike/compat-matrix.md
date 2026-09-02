# MOBL-62 Spike: Dual-Token Compatibility Matrix

Evaluates feasibility of Option A (tightened single-token) vs Option B (dual-token) across
SDK consumers, platform constraints, and enterprise MDM profiles.

## Consumer surface

| Consumer type         | Option A compatible | Option B compatible | Notes |
|-----------------------|:-----------:|:-----------:|-------|
| iOS native SDK        | ✅ | ✅ | Keychain supports both; attestation via DeviceCheck |
| Android native SDK    | ✅ | ✅ | Keystore-backed; Play Integrity for attestation |
| React Native bridge   | ✅ | ⚠️ | Dual-token requires native module; JS bridge adds latency |
| Flutter plugin        | ✅ | ⚠️ | Same constraint as RN; platform channel overhead |
| Enterprise MDM (iOS)  | ✅ | ❌ | MDM-managed apps cannot bind attestation to device identity |
| Enterprise MDM (Android) | ✅ | ❌ | Knox/Work Profile isolates keystore; cross-profile binding fails |
| Web (PWA / Capacitor) | ✅ | ❌ | No hardware attestation surface; dual-token degrades to cookie-only |

## Token lifetime scenarios

| Scenario                  | Option A | Option B |
|---------------------------|----------|----------|
| Normal refresh (online)   | 1 token rotation | access + refresh rotation |
| Suspicious signal detected | forced rotation | access revoked; refresh rotated |
| Offline / background sync  | single token valid until expiry | access expired; refresh holds session |
| Token theft (replay)      | rotation invalidates family | access window ≤ 15 min; refresh rotation + family invalidation |

## Open questions from spike

1. Can enterprise MDM consumers opt out of dual-token and stay on Option A permanently?
2. What is the minimum OS version for hardware attestation on Android (API level)?
3. Does dual-token require a new backend token-family table or can it reuse existing refresh infrastructure?

## Recommendation

Dual-token (Option B) is viable for direct SDK consumers but **not** for enterprise MDM
deployments. A hybrid approach — Option B default, Option A as an explicit MDM fallback —
requires a server-side capability flag and SDK opt-out path.
