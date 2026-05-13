/**
 * Adaptive Rate Limiter - Learns actual rate limits from provider behavior
 *
 * @aiInstructions
 * AdaptiveRateLimiter intelligently learns rate limits from provider responses.
 * Starts with unknown limits and discovers them through throttling events.
 * Supports token bucket (continuous refill) and fixed window strategies.
 *
 * @aiExample
 * ```typescript
 * // Start with unknown TPM limit - will learn from throttling
 * const limiter = new AdaptiveRateLimiter({
 *   type: 'tpm',
 *   enableLearning: true
 * });
 *
 * // Check before request
 * const check = await limiter.check(1000);
 * if (check.allowed) {
 *   await makeRequest();
 *   await limiter.consume(1000);
 * } else {
 *   await sleep(check.waitMs);
 * }
 *
 * // On throttle error
 * await limiter.onThrottled(1000);
 * // Limiter learns the actual limit
 * ```
 *
 * @aiWhenToUse
 * Use AdaptiveRateLimiter when:
 * - Provider doesn't document rate limits
 * - Limits vary by tier or region
 * - Need to discover limits dynamically
 * - Want automatic fallback strategies
 */

import {
  LimitType,
  LimitStrategy,
  RateLimitConfig,
  LimitState,
  LimitCheckResult,
  LearnedLimitEvent
} from './AdaptiveRateLimiterTypes';
import { IRateLimitStrategy } from './IRateLimitStrategy';
import { TokenBucketStrategy } from './TokenBucketStrategy';
import { FixedWindowStrategy } from './FixedWindowStrategy';
import { LimitLearningStrategy } from './LimitLearningStrategy';

export type { LimitType, LimitStrategy, RateLimitConfig, LimitState, LimitCheckResult, LearnedLimitEvent };

/**
 * Adaptive rate limiter that learns from actual provider behavior
 */
export class AdaptiveRateLimiter {
  private config: Required<Omit<RateLimitConfig, 'limit' | 'customStrategy'>> & { limit?: number; customStrategy?: IRateLimitStrategy };
  private state: LimitState;
  private startTime: number;
  private tokenBucketStrategy: IRateLimitStrategy;
  private fixedWindowStrategy: IRateLimitStrategy;

  // Event callbacks
  private onLimitDiscovered?: (event: LearnedLimitEvent) => void;
  private onStrategyChanged?: (from: LimitStrategy, to: LimitStrategy, reason: string) => void;
  private onLimitAdjusted?: (event: LearnedLimitEvent) => void;

  constructor(config: RateLimitConfig) {
    this.config = {
      type: config.type,
      limit: config.limit ?? undefined,
      useTokenBucket: config.useTokenBucket ?? true,
      enableLearning: config.enableLearning ?? true,
      learningReductionRate: config.learningReductionRate ?? 0.95,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      customStrategy: config.customStrategy
    };

    this.startTime = Date.now();
    this.tokenBucketStrategy = new TokenBucketStrategy();
    this.fixedWindowStrategy = new FixedWindowStrategy();

    this.state = {
      type: config.type,
      limit: config.limit ?? null,
      strategy: config.limit ? 'token-bucket' : 'unknown',
      confidence: config.limit ? 0.8 : 0,
      availableTokens: config.limit ?? Infinity,
      lastRefill: Date.now(),
      refillRate: config.limit ? (config.limit / 60000) : null, // per ms
      consecutiveFailures: 0,
      observations: []
    };
  }

  /**
   * Check if request is allowed (doesn't consume)
   */
  async check(units: number): Promise<LimitCheckResult> {
    if (!this.state.limit) {
      // No limit known yet - allow everything until we learn
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

    // Use custom strategy if provided
    if (this.config.customStrategy) {
      return this.config.customStrategy.check(this.state, units);
    }

    // Use token bucket or fixed window
    if (this.config.useTokenBucket && this.state.strategy === 'token-bucket') {
      return this.tokenBucketStrategy.check(this.state, units);
    }

    return this.fixedWindowStrategy.check(this.state, units);
  }

  /**
   * Consume units (called after successful request)
   */
  async consume(units: number): Promise<void> {
    // Use custom strategy if provided
    if (this.config.customStrategy) {
      this.config.customStrategy.consume(this.state, units);
    } else if (this.config.useTokenBucket && this.state.strategy === 'token-bucket') {
      this.tokenBucketStrategy.consume(this.state, units);
    } else {
      this.fixedWindowStrategy.consume(this.state, units);
    }

    // Record successful consumption
    this.state.observations.push({
      timestamp: Date.now(),
      unitsConsumed: units,
      limitHit: false,
      timeSinceStart: Date.now() - this.startTime
    });

    // Reset consecutive failures on success
    if (this.config.enableLearning) {
      LimitLearningStrategy.recordSuccess(this.state);
    }
  }

  /**
   * Called when provider returns throttling error
   */
  async onThrottled(unitsAttempted: number): Promise<void> {
    const timeSinceStart = Date.now() - this.startTime;

    this.state.observations.push({
      timestamp: Date.now(),
      unitsConsumed: unitsAttempted,
      limitHit: true,
      timeSinceStart
    });

    if (!this.state.limit && this.config.enableLearning) {
      // First limit hit - establish baseline
      const event = LimitLearningStrategy.discoverLimit(this.state, unitsAttempted, timeSinceStart);
      if (event && this.onLimitDiscovered) {
        this.onLimitDiscovered(event);
      }

    } else if (this.state.strategy === 'token-bucket' && this.config.enableLearning) {
      // Unexpected limit hit - our estimation is wrong
      const result = LimitLearningStrategy.adjustLimit(this.state, {
        learningReductionRate: this.config.learningReductionRate,
        maxConsecutiveFailures: this.config.maxConsecutiveFailures
      });

      if (result.strategyChanged && this.onStrategyChanged) {
        this.onStrategyChanged(
          result.strategyChanged.from as LimitStrategy,
          result.strategyChanged.to as LimitStrategy,
          result.strategyChanged.reason
        );
      }

      if (result.event && this.onLimitAdjusted) {
        this.onLimitAdjusted(result.event);
      }
    }

    // Set available to 0 after throttle
    this.state.availableTokens = 0;
  }

  /**
   * Sync state from provider response headers (OpenAI/Anthropic/Gemini)
   */
  async syncFromHeaders(remaining: number, limit: number, resetTime: Date): Promise<void> {
    this.state.limit = limit;
    this.state.availableTokens = remaining;
    this.state.strategy = 'token-bucket'; // Headers imply provider tracks continuously
    this.state.confidence = 1.0; // Provider told us explicitly
    this.state.refillRate = limit / 60000;

    // Calculate time until reset
    const now = Date.now();
    const resetMs = resetTime.getTime();

    if (resetMs > now) {
      // Provider gives us exact reset time
      this.state.lastRefill = now;
    }
  }

  /**
   * Get current state (for persistence/debugging)
   */
  getState(): LimitState {
    return { ...this.state };
  }

  /**
   * Set event callbacks
   */
  on(event: 'limit.discovered', callback: (event: LearnedLimitEvent) => void): void;
  on(event: 'strategy.changed', callback: (from: LimitStrategy, to: LimitStrategy, reason: string) => void): void;
  on(event: 'limit.adjusted', callback: (event: LearnedLimitEvent) => void): void;
  on(event: string, callback: any): void {
    switch (event) {
      case 'limit.discovered':
        this.onLimitDiscovered = callback;
        break;
      case 'strategy.changed':
        this.onStrategyChanged = callback;
        break;
      case 'limit.adjusted':
        this.onLimitAdjusted = callback;
        break;
    }
  }
}
