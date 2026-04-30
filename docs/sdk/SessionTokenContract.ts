/**
 * MOBL-61: Public SDK contract for session token refresh.
 * Governs the surface area that SDK consumers depend on post-RFC decision.
 */

export interface SessionToken {
  value: string;
  expiresAt: number; // unix epoch ms
  tokenFamily: string;
}

export interface DualTokenPair {
  accessToken: SessionToken;
  refreshToken: SessionToken;
}

export interface SessionRefreshResult {
  kind: "single" | "dual";
  token?: SessionToken;       // Option A: single refresh token
  pair?: DualTokenPair;       // Option B: dual-token model
  rotated: boolean;
  deviceBound: boolean;
}

export interface SessionRefreshOptions {
  forceRotation?: boolean;
  deviceAttestation?: string; // base64 platform attestation blob
  allowDowngrade?: boolean;   // permit fallback to single-token if server rejects dual
}

export interface SessionRefreshClient {
  refresh(current: SessionToken, opts?: SessionRefreshOptions): Promise<SessionRefreshResult>;
  revoke(token: SessionToken): Promise<void>;
  isExpired(token: SessionToken): boolean;
  bindToDevice(token: SessionToken, attestation: string): Promise<SessionToken>;
}
