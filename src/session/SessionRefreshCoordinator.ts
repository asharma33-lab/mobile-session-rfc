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
    const result = await this.dependencies.refresh(tokens, correlationId);

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
