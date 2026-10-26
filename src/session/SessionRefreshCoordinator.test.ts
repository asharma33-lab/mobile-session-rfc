import { describe, expect, it, vi } from "vitest";

import {
  isTransientNetworkError,
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

  it("handles HTTP 504 gateway timeout by classifying as network_retryable without throwing", async () => {
    const error504 = Object.assign(new Error("HTTP 504 Gateway Timeout"), {
      status: 504,
      retryAfterMs: 2_500,
    });
    const refresh = vi.fn().mockRejectedValue(error504);
    const emit = vi.fn();
    const coordinator = new SessionRefreshCoordinator({ refresh, emit });

    const result = await coordinator.recover(tokens, "correlation-504");

    expect(result).toEqual({
      kind: "failure",
      reason: "network_retryable",
      correlationId: "correlation-504",
      retryAfterMs: 2_500,
    });
    expect(emit).toHaveBeenCalledWith({
      event: "session_refresh_failed",
      correlationId: "correlation-504",
      policyVersion: tokens.policyVersion,
      reason: "network_retryable",
    });
    expect(shouldShowExpiredSessionBanner(result)).toBe(false);
  });

  it("handles transient ECONNRESET socket error without crashing", async () => {
    const errorReset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    const refresh = vi.fn().mockRejectedValue(errorReset);
    const emit = vi.fn();
    const coordinator = new SessionRefreshCoordinator({ refresh, emit });

    const result = await coordinator.recover(tokens, "correlation-reset");

    expect(result).toEqual({
      kind: "failure",
      reason: "network_retryable",
      correlationId: "correlation-reset",
    });
    expect(emit).toHaveBeenCalledWith({
      event: "session_refresh_failed",
      correlationId: "correlation-reset",
      policyVersion: tokens.policyVersion,
      reason: "network_retryable",
    });
    expect(shouldShowExpiredSessionBanner(result)).toBe(false);
  });

  it("deduplicates concurrent requests during transient network failures and resets in-flight state", async () => {
    const errorTimeout = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
    const refresh = vi.fn().mockRejectedValue(errorTimeout);
    const coordinator = new SessionRefreshCoordinator({ refresh, emit: vi.fn() });

    const [first, second] = await Promise.all([
      coordinator.recover(tokens, "correlation-dedup"),
      coordinator.recover(tokens, "correlation-dedup"),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.kind).toBe("failure");
    if (first.kind === "failure") {
      expect(first.reason).toBe("network_retryable");
    }

    // Subsequent call starts a new attempt
    refresh.mockResolvedValueOnce({ kind: "success", tokens });
    const third = await coordinator.recover(tokens, "correlation-next");
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(third.kind).toBe("success");
  });

  it("rethrows non-transient unexpected errors", async () => {
    const fatalError = new TypeError("Unexpected undefined property");
    const refresh = vi.fn().mockRejectedValue(fatalError);
    const emit = vi.fn();
    const coordinator = new SessionRefreshCoordinator({ refresh, emit });

    await expect(coordinator.recover(tokens, "correlation-fatal")).rejects.toThrow(
      "Unexpected undefined property",
    );
    expect(emit).not.toHaveBeenCalled();
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

describe("isTransientNetworkError", () => {
  it("detects HTTP gateway timeout status codes", () => {
    expect(isTransientNetworkError({ status: 504 })).toBe(true);
    expect(isTransientNetworkError({ statusCode: 503 })).toBe(true);
    expect(isTransientNetworkError({ response: { status: 502 } })).toBe(true);
    expect(isTransientNetworkError({ status: "504" })).toBe(true);
    expect(isTransientNetworkError({ status: 408 })).toBe(true);
    expect(isTransientNetworkError({ status: 401 })).toBe(false);
    expect(isTransientNetworkError({ status: 400 })).toBe(false);
  });

  it("detects transient network error codes", () => {
    expect(isTransientNetworkError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientNetworkError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientNetworkError({ code: "ECONNABORTED" })).toBe(true);
    expect(isTransientNetworkError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isTransientNetworkError({ code: "ENOTFOUND" })).toBe(true);
    expect(isTransientNetworkError({ code: "ENETUNREACH" })).toBe(true);
    expect(isTransientNetworkError({ code: "UND_ERR_CONNECT_TIMEOUT" })).toBe(true);
    expect(isTransientNetworkError({ code: "ERR_NETWORK" })).toBe(true);
  });

  it("detects error names and messages", () => {
    expect(isTransientNetworkError(new Error("socket hang up"))).toBe(true);
    expect(isTransientNetworkError(new Error("fetch failed"))).toBe(true);
    expect(isTransientNetworkError(new Error("Connection reset by peer"))).toBe(true);
    expect(isTransientNetworkError({ name: "TimeoutError", message: "operation timed out" })).toBe(
      true,
    );
    expect(isTransientNetworkError({ name: "AbortError", message: "aborted" })).toBe(true);
    expect(isTransientNetworkError({ name: "NetworkError", message: "network down" })).toBe(true);
  });

  it("detects nested causes", () => {
    const error = new Error("Failed request");
    (error as any).cause = { code: "ECONNRESET" };
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns false for non-network errors", () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError(new Error("Invalid token format"))).toBe(false);
    expect(isTransientNetworkError({ status: 404, message: "Not found" })).toBe(false);
  });
});
