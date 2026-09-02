import { describe, expect, it, vi } from "vitest";

import {
  SessionRefreshCoordinator,
  shouldShowExpiredSessionBanner,
} from "./SessionRefreshCoordinator";
import type { SessionTokens } from "./SessionTokenContract";

const tokens: SessionTokens = {
  accessToken: "redacted-access-token",
  refreshToken: "redacted-refresh-token",
  tokenFamilyId: "family-42",
  policyVersion: "2026-09",
};

describe("SessionRefreshCoordinator", () => {
  it("deduplicates concurrent recovery requests after an offline window", async () => {
    const refresh = vi.fn().mockResolvedValue({ kind: "success", tokens });
    const coordinator = new SessionRefreshCoordinator({ refresh, emit: vi.fn() });

    const [first, second] = await Promise.all([
      coordinator.recover(tokens, "correlation-1"),
      coordinator.recover(tokens, "correlation-1"),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("keeps the sign-out banner hidden for retryable network failures", () => {
    expect(
      shouldShowExpiredSessionBanner({
        kind: "failure",
        reason: "network_retryable",
        correlationId: "correlation-2",
        retryAfterMs: 1_000,
      }),
    ).toBe(false);
  });

  it("shows the sign-out banner after definitive token-family invalidation", () => {
    expect(
      shouldShowExpiredSessionBanner({
        kind: "failure",
        reason: "token_family_invalidated",
        correlationId: "correlation-3",
      }),
    ).toBe(true);
  });
});
