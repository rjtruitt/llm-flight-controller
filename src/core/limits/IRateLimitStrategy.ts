/**
 * Rate Limit Strategy Interface - Allows custom rate limiting implementations
 */

import { LimitState, LimitCheckResult } from './AdaptiveRateLimiterTypes';

/**
 * Interface for rate limit checking strategies
 *
 * @aiInstructions
 * Implement this interface to create custom rate limiting strategies.
 * The AdaptiveRateLimiter delegates to strategies for actual limit checking.
 *
 * @aiExample
 * ```typescript
 * class SlidingWindowStrategy implements IRateLimitStrategy {
 *   check(state: LimitState, units: number): LimitCheckResult {
 *     // Custom sliding window logic
 *     return { allowed: true, waitMs: 0, state: { ... } };
 *   }
 *
 *   consume(state: LimitState, units: number): void {
 *     // Update sliding window
 *   }
 * }
 * ```
 */
export interface IRateLimitStrategy {
  /**
   * Check if request is allowed without consuming
   */
  check(state: LimitState, units: number): LimitCheckResult;

  /**
   * Consume units after successful request
   */
  consume(state: LimitState, units: number): void;
}
