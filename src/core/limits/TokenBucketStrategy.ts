/**
 * Token Bucket Strategy - Continuous token refill
 */

import { IRateLimitStrategy } from './IRateLimitStrategy';
import { LimitState, LimitCheckResult } from './AdaptiveRateLimiterTypes';

export class TokenBucketStrategy implements IRateLimitStrategy {
  /**
   * Check if request is allowed with token bucket
   */
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

    this.refillTokens(state);

    if (state.availableTokens >= units) {
      return {
        allowed: true,
        waitMs: 0,
        state: {
          available: state.availableTokens,
          limit: state.limit,
          strategy: state.strategy
        }
      };
    } else {
      const needed = units - state.availableTokens;
      const waitMs = state.refillRate
        ? Math.ceil(needed / state.refillRate)
        : 60000; // Default 1 minute

      return {
        allowed: false,
        waitMs,
        reason: `Insufficient ${state.type}: need ${units}, have ${Math.floor(state.availableTokens)}`,
        state: {
          available: state.availableTokens,
          limit: state.limit,
          strategy: state.strategy
        }
      };
    }
  }

  /**
   * Consume units from bucket
   */
  consume(state: LimitState, units: number): void {
    this.refillTokens(state);
    state.availableTokens = Math.max(0, state.availableTokens - units);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(state: LimitState): void {
    if (!state.refillRate || !state.limit) return;

    const now = Date.now();
    const elapsed = now - state.lastRefill;

    if (elapsed > 0) {
      const tokensToAdd = Math.floor(elapsed * state.refillRate);

      if (tokensToAdd > 0) {
        state.availableTokens = Math.min(
          state.availableTokens + tokensToAdd,
          state.limit
        );
        state.lastRefill = now;
      }
    }
  }
}
