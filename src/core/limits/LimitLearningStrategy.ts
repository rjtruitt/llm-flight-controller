/**
 * Limit Learning Strategy - Discovers rate limits from provider behavior
 */

import { LimitState, LearnedLimitEvent } from './AdaptiveRateLimiterTypes';

export interface LimitLearningConfig {
  learningReductionRate: number;
  maxConsecutiveFailures: number;
}

export class LimitLearningStrategy {
  /**
   * Learn initial limit from first throttle event
   */
  static discoverLimit(
    state: LimitState,
    _unitsAttempted: number,
    timeSinceStart: number
  ): LearnedLimitEvent | null {
    if (state.limit) return null; // Already have a limit

    const totalConsumed = state.observations
      .filter(o => !o.limitHit)
      .reduce((sum, o) => sum + o.unitsConsumed, 0);

    const estimatedLimit = Math.floor((totalConsumed / timeSinceStart) * 60000); // per minute

    state.limit = estimatedLimit;
    state.strategy = 'token-bucket';
    state.refillRate = estimatedLimit / 60000; // per ms
    state.availableTokens = 0; // Just hit limit
    state.confidence = 0.5;

    return {
      type: state.type,
      limit: estimatedLimit,
      strategy: 'token-bucket',
      confidence: 0.5
    };
  }

  /**
   * Adjust limit after unexpected throttle
   */
  static adjustLimit(
    state: LimitState,
    config: LimitLearningConfig
  ): { event?: LearnedLimitEvent; strategyChanged?: { from: string; to: string; reason: string } } {
    state.consecutiveFailures++;

    if (state.consecutiveFailures >= config.maxConsecutiveFailures) {
      // Switch to fixed window
      const oldStrategy = state.strategy;
      state.strategy = 'fixed-window';
      state.confidence = 0.7;

      return {
        strategyChanged: {
          from: oldStrategy,
          to: 'fixed-window',
          reason: `${state.consecutiveFailures} consecutive failures`
        }
      };
    } else {
      // Reduce fill rate
      if (state.refillRate) {
        state.refillRate *= config.learningReductionRate;
        state.limit = Math.floor(state.refillRate * 60000);
        state.confidence = Math.max(0.3, state.confidence - 0.1);

        return {
          event: {
            type: state.type,
            limit: state.limit,
            strategy: state.strategy,
            confidence: state.confidence,
            adjustmentReason: `Reduced by ${(1 - config.learningReductionRate) * 100}% after failure #${state.consecutiveFailures}`
          }
        };
      }
    }

    return {};
  }

  /**
   * Reset consecutive failures on successful consumption
   */
  static recordSuccess(state: LimitState): void {
    if (state.consecutiveFailures > 0) {
      state.consecutiveFailures = 0;
    }
  }
}
