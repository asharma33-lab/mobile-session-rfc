import type {
  SessionRefreshFailure,
  SessionRefreshResult,
  SessionTelemetryEvent,
  SessionTokens,
} from "./SessionTokenContract";

export interface SessionRefreshDependencies {
  refresh(tokens: SessionTokens, correlationId: string): Promise<SessionRefreshResult>;
  emit(event: SessionTelemetryEvent): void;
}

/**
 * Determines whether an error thrown during session refresh is a transient
 * network failure (such as HTTP 504 Gateway Timeout, ECONNRESET, or timeout)
 * that should be retried rather than treated as a fatal session invalidation.
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "string") {
    return /504|503|502|408|ECONNRESET|ETIMEDOUT|ECONNABORTED|ECONNREFUSED|ENOTFOUND|ENETUNREACH|timeout|network|socket hang up/i.test(
      error,
    );
  }

  if (typeof error === "object") {
    const err = error as Record<string, any>;

    if (err.kind === "failure" && err.reason === "network_retryable") {
      return true;
    }

    const rawStatus = err.status ?? err.statusCode ?? err.response?.status;
    const status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
    if (status === 504 || status === 503 || status === 502 || status === 408) {
      return true;
    }

    const code = err.code ?? err.response?.data?.code;
    if (
      typeof code === "string" &&
      /ECONNRESET|ETIMEDOUT|ECONNABORTED|ECONNREFUSED|ENOTFOUND|ENETUNREACH|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|ERR_NETWORK|ERR_SOCKET_CONNECTION_TIMEOUT/i.test(
        code,
      )
    ) {
      return true;
    }

    if (
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      err.name === "NetworkError"
    ) {
      return true;
    }

    if (err.cause && isTransientNetworkError(err.cause)) {
      return true;
    }

    if (typeof err.message === "string") {
      if (
        /504|503|502|408|ECONNRESET|ETIMEDOUT|ECONNABORTED|ECONNREFUSED|ENOTFOUND|ENETUNREACH|timeout|network|socket hang up|connection reset|fetch failed/i.test(
          err.message,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Coordinates refresh after an offline window. Concurrent callers on the same
 * device share one request, preventing token-family invalidation caused by a
 * burst of competing refreshes when the application returns to the foreground.
 */
export class SessionRefreshCoordinator {
  private inFlightRefresh?: Promise<SessionRefreshResult>;

  constructor(private readonly dependencies: SessionRefreshDependencies) {}

  recover(tokens: SessionTokens, correlationId: string): Promise<SessionRefreshResult> {
    if (!this.inFlightRefresh) {
      this.inFlightRefresh = this.executeRefresh(tokens, correlationId).finally(() => {
        this.inFlightRefresh = undefined;
      });
    }

    return this.inFlightRefresh;
  }

  private async executeRefresh(
    tokens: SessionTokens,
    correlationId: string,
  ): Promise<SessionRefreshResult> {
    let result: SessionRefreshResult;

    try {
      result = await this.dependencies.refresh(tokens, correlationId);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "kind" in error &&
        (error as any).kind === "failure"
      ) {
        result = error as SessionRefreshFailure;
      } else if (isTransientNetworkError(error)) {
        const retryAfterMs =
          typeof (error as Record<string, any>)?.retryAfterMs === "number"
            ? (error as Record<string, any>).retryAfterMs
            : undefined;

        result = {
          kind: "failure",
          reason: "network_retryable",
          correlationId,
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        };
      } else {
        throw error;
      }
    }

    this.dependencies.emit({
      event: result.kind === "success" ? "session_refresh_completed" : "session_refresh_failed",
      correlationId,
      policyVersion: tokens.policyVersion,
      reason: result.kind === "failure" ? result.reason : undefined,
    });

    return result;
  }
}

/**
 * A transient network failure should keep the current screen visible and allow
 * retry. The sign-out banner is reserved for definitive session termination.
 */
export function shouldShowExpiredSessionBanner(result: SessionRefreshResult): boolean {
  if (result.kind === "success") return false;

  return definitiveSessionFailure(result);
}

function definitiveSessionFailure(failure: SessionRefreshFailure): boolean {
  return failure.reason === "token_family_invalidated" || failure.reason === "session_revoked";
}
