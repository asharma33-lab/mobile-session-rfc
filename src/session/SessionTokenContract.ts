export type SessionRefreshFailureReason =
  | "network_retryable"
  | "token_family_invalidated"
  | "session_revoked"
  | "device_binding_unavailable";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenFamilyId: string;
  policyVersion: string;
}

export interface SessionRefreshFailure {
  kind: "failure";
  reason: SessionRefreshFailureReason;
  correlationId: string;
  retryAfterMs?: number;
}

export interface SessionRefreshSuccess {
  kind: "success";
  tokens: SessionTokens;
}

export type SessionRefreshResult = SessionRefreshSuccess | SessionRefreshFailure;

/**
 * Privacy-safe telemetry contract. Raw access tokens, refresh tokens, and token
 * family identifiers must never be included in emitted session events.
 */
export interface SessionTelemetryEvent {
  event: "session_refresh_completed" | "session_refresh_failed";
  correlationId: string;
  policyVersion: string;
  reason?: SessionRefreshFailureReason;
}
