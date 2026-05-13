/**
 * Fixed Window Strategy - Simple fixed time window rate limiting
 */

import { IRateLimitStrategy } from './IRateLimitStrategy';
import { LimitState, LimitCheckResult } from './AdaptiveRateLimiterTypes';

export class FixedWindowStrategy implements IRateLimitStrategy {
  check(state: LimitState, units: number): LimitCheckResult {
    if (!state.limit) {
      return {
        allowed: true,
        waitMs: 0,
        state: {
          available: Infinity,
          limit: null,
          strategy: 'unknown'
        }
      };
    }

    return {
      allowed: state.availableTokens >= units,
      waitMs: state.availableTokens >= units ? 0 : 60000,
      reason: state.availableTokens < units ? `Insufficient ${state.type}: need ${units}, have ${Math.floor(state.availableTokens)}` : undefined,
      state: {
        available: state.availableTokens,
        limit: state.limit,
        strategy: state.strategy
      }
    };
  }

  consume(state: LimitState, units: number): void {
    state.availableTokens = Math.max(0, state.availableTokens - units);
  }
}
