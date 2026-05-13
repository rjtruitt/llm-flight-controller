/**
 * Combined Rate Limiter - Manages both RPM and TPM limits
 *
 * @aiInstructions
 * CombinedRateLimiter coordinates checking both request-per-minute (RPM)
 * and tokens-per-minute (TPM) limits before allowing a request. All LLM
 * providers have both types of limits.
 *
 * @aiExample
 * ```typescript
 * const limiter = new CombinedRateLimiter({
 *   rpm: { type: 'rpm', limit: 50 },
 *   tpm: { type: 'tpm', limit: 100000 }
 * });
 *
 * // Check both limits
 * const result = await limiter.check(5000); // 5000 tokens
 * if (result.allowed) {
 *   await makeRequest();
 *   await limiter.consume(5000); // Track actual usage
 * } else {
 *   console.log(`Limited by ${result.limitedBy}, wait ${result.waitMs}ms`);
 * }
 *
 * // Sync with provider headers (OpenAI/Anthropic)
 * await limiter.syncFromHeaders(parsedHeaders);
 * ```
 *
 * @aiWhenToUse
 * Use CombinedRateLimiter when:
 * - Provider has both RPM and TPM limits
 * - Need coordinated limit checking
 * - Want automatic limit discovery for both types
 * - Provider returns rate limit headers
 */

import { AdaptiveRateLimiter, RateLimitConfig, LimitCheckResult } from './AdaptiveRateLimiter';
import { ParsedRateLimits } from './HeaderParser';

export interface CombinedLimitConfig {
  rpm?: RateLimitConfig;
  tpm?: RateLimitConfig;
}

export interface CombinedCheckResult {
  allowed: boolean;
  waitMs: number;
  limitedBy?: 'rpm' | 'tpm';
  rpmState?: LimitCheckResult;
  tpmState?: LimitCheckResult;
}

/**
 * Manages both RPM and TPM rate limits
 *
 * Can be shared across multiple Model instances to coordinate rate limiting
 * on a single quota (e.g., multiple agents sharing the same Bedrock account limits)
 */
export class CombinedRateLimiter {
  private rpmLimiter?: AdaptiveRateLimiter;
  private tpmLimiter?: AdaptiveRateLimiter;

  constructor(config: CombinedLimitConfig) {
    if (config.rpm) {
      this.rpmLimiter = new AdaptiveRateLimiter(config.rpm);
    }

    if (config.tpm) {
      this.tpmLimiter = new AdaptiveRateLimiter(config.tpm);
    }
  }

  /**
   * Check if request is allowed (checks both RPM and TPM)
   */
  async check(estimatedTokens: number): Promise<CombinedCheckResult> {
    const results: CombinedCheckResult = {
      allowed: true,
      waitMs: 0
    };

    // Check RPM (1 request)
    if (this.rpmLimiter) {
      const rpmCheck = await this.rpmLimiter.check(1);
      results.rpmState = rpmCheck;

      if (!rpmCheck.allowed) {
        results.allowed = false;
        results.waitMs = rpmCheck.waitMs;
        results.limitedBy = 'rpm';
      }
    }

    // Check TPM
    if (this.tpmLimiter) {
      const tpmCheck = await this.tpmLimiter.check(estimatedTokens);
      results.tpmState = tpmCheck;

      if (!tpmCheck.allowed) {
        results.allowed = false;

        // If both limited, wait for whichever resets first
        if (results.limitedBy === 'rpm') {
          results.waitMs = Math.min(results.waitMs, tpmCheck.waitMs);
          results.limitedBy = results.waitMs === tpmCheck.waitMs ? 'tpm' : 'rpm';
        } else {
          results.waitMs = tpmCheck.waitMs;
          results.limitedBy = 'tpm';
        }
      }
    }

    return results;
  }

  /**
   * Consume after successful request
   */
  async consume(actualTokens: number): Promise<void> {
    if (this.rpmLimiter) {
      await this.rpmLimiter.consume(1);
    }

    if (this.tpmLimiter) {
      await this.tpmLimiter.consume(actualTokens);
    }
  }

  /**
   * Called when provider returns throttling error
   *
   * For Bedrock: We don't know if it's RPM or TPM, so learn both
   * For others: Headers tell us which limit was hit
   */
  async onThrottled(attemptedTokens: number, limitType?: 'rpm' | 'tpm'): Promise<void> {
    if (limitType === 'rpm' && this.rpmLimiter) {
      await this.rpmLimiter.onThrottled(1);
    } else if (limitType === 'tpm' && this.tpmLimiter) {
      await this.tpmLimiter.onThrottled(attemptedTokens);
    } else {
      // Don't know which limit - learn from both (Bedrock case)
      if (this.rpmLimiter) {
        await this.rpmLimiter.onThrottled(1);
      }
      if (this.tpmLimiter) {
        await this.tpmLimiter.onThrottled(attemptedTokens);
      }
    }
  }

  /**
   * Sync state from provider response headers
   */
  async syncFromHeaders(parsed: ParsedRateLimits): Promise<void> {
    if (parsed.rpm && this.rpmLimiter) {
      await this.rpmLimiter.syncFromHeaders(
        parsed.rpm.remaining,
        parsed.rpm.limit,
        parsed.rpm.reset
      );
    }

    if (parsed.tpm && this.tpmLimiter) {
      await this.tpmLimiter.syncFromHeaders(
        parsed.tpm.remaining,
        parsed.tpm.limit,
        parsed.tpm.reset
      );
    }
  }

  /**
   * Forward event subscriptions to underlying limiters
   */
  on(event: string, callback: any): void {
    if (this.rpmLimiter) {
      this.rpmLimiter.on(event as any, callback);
    }
    if (this.tpmLimiter) {
      this.tpmLimiter.on(event as any, callback);
    }
  }

  /**
   * Get current state of both limiters
   */
  getState() {
    return {
      rpm: this.rpmLimiter?.getState(),
      tpm: this.tpmLimiter?.getState()
    };
  }
}
