/**
 * Types for AdaptiveRateLimiter
 */

import { IRateLimitStrategy } from './IRateLimitStrategy';

export type LimitType = 'rpm' | 'tpm';
export type LimitStrategy = 'token-bucket' | 'fixed-window' | 'unknown';

export interface RateLimitConfig {
  type: LimitType;

  // User-provided limits (if known)
  limit?: number;

  // Strategy configuration
  useTokenBucket?: boolean; // default: true
  enableLearning?: boolean; // default: true

  // Learning parameters
  learningReductionRate?: number; // default: 0.95 (reduce 5% per failure)
  maxConsecutiveFailures?: number; // default: 3 (then switch to fixed-window)

  // Injectable strategies (advanced)
  customStrategy?: IRateLimitStrategy;
}

export interface LimitState {
  type: LimitType;
  limit: number | null;
  strategy: LimitStrategy;
  confidence: number; // 0-1

  // Token bucket state
  availableTokens: number;
  lastRefill: number;
  refillRate: number | null; // tokens per millisecond

  // Learning state
  consecutiveFailures: number;
  observations: LimitObservation[];
}

export interface LimitObservation {
  timestamp: number;
  unitsConsumed: number; // requests or tokens
  limitHit: boolean;
  timeSinceStart: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  waitMs: number;
  reason?: string;
  state: {
    available: number;
    limit: number | null;
    strategy: LimitStrategy;
  };
}

export interface LearnedLimitEvent {
  type: LimitType;
  limit: number;
  strategy: LimitStrategy;
  confidence: number;
  adjustmentReason?: string;
}
