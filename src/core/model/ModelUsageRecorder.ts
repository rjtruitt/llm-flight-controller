/**
 * Model Usage Recorder - Records usage to stats, rate limiters, and pricing
 */

import { ModelResponse } from '../types/Response';
import { IRateLimiter } from '../limits/IRateLimiter';
import { ISessionLimiter } from '../limits/ISessionLimiter';
import { IPricingTracker } from '../pricing/IPricingTracker';
import { IStatsTracker } from '../stats/IStatsTracker';

export interface UsageRecorderConfig {
  stats?: IStatsTracker;
  rateLimiter?: IRateLimiter;
  sessionLimiter?: ISessionLimiter;
  pricingTracker?: IPricingTracker;
}

export class ModelUsageRecorder {
  constructor(private readonly config: UsageRecorderConfig) {}

  /**
   * Record successful request usage
   */
  recordSuccess(response: ModelResponse, latencyMs: number): void {
    this.recordStats(response, latencyMs, true);
    this.recordRateLimit(response);
    this.recordSession(response);
    this.recordPricing(response);
  }

  /**
   * Record failed request
   */
  recordFailure(error: Error, latencyMs: number): void {
    if (this.config.stats) {
      this.config.stats.recordRequest({
        latencyMs,
        success: false,
        error
      });
    }
  }

  private recordStats(response: ModelResponse, latencyMs: number, success: boolean): void {
    if (this.config.stats && response.usage) {
      this.config.stats.recordRequest({
        latencyMs,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        success
      });
    }
  }

  private recordRateLimit(response: ModelResponse): void {
    if (this.config.rateLimiter && response.usage) {
      this.config.rateLimiter.recordUsage({
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        requests: 1
      });
    }
  }

  private recordSession(response: ModelResponse): void {
    if (this.config.sessionLimiter && response.usage) {
      this.config.sessionLimiter.recordUsage({ tokens: response.usage.inputTokens });
    }
  }

  private recordPricing(response: ModelResponse): void {
    if (this.config.pricingTracker && response.usage) {
      this.config.pricingTracker.recordUsage(response.usage);
    }
  }
}
