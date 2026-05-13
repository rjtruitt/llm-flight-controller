/**
 * Rate Limit - Track and enforce rate limits
 *
 * @aiInstructions
 * RateLimit tracks tokens-per-minute (TPM) and requests-per-minute (RPM) using
 * rolling windows. Used to prevent exceeding provider rate limits.
 *
 * @aiExample
 * ```typescript
 * const rateLimit = new RateLimit({
 *   tpm: 100000,  // 100k tokens per minute
 *   rpm: 50       // 50 requests per minute
 * });
 *
 * // Before making request
 * const check = rateLimit.checkLimit({ tokens: 2000, requests: 1 });
 * if (!check.allowed) {
 *   console.log(`Rate limited! Wait ${check.waitMs}ms`);
 *   await sleep(check.waitMs);
 * }
 *
 * // After successful request
 * rateLimit.recordUsage({ tokens: 2000, requests: 1 });
 * ```
 *
 * @aiWhenToUse
 * Use RateLimit when:
 * - Enforcing provider rate limits
 * - Preventing API errors due to rate limiting
 * - Implementing graceful throttling
 * - Need predictive rate limit warnings
 */

import { RollingWindow } from './RollingWindow';
import { IRateLimiter, UsageRecord, RateLimitCheck } from './IRateLimiter';

export interface RateLimitConfig {
    /** Tokens per minute limit */
    tpm?: number;
    /** Requests per minute limit */
    rpm?: number;
    /** Tokens per hour limit */
    tph?: number;
    /** Requests per hour limit */
    rph?: number;
    /** Warning threshold (0-1, e.g., 0.8 = 80%) */
    warningThreshold?: number;
}

/**
 * Rate Limit - Tracks and enforces rate limits
 */
export class RateLimit implements IRateLimiter {
    private readonly config: Required<RateLimitConfig>;
    private readonly tpmWindow: RollingWindow;
    private readonly rpmWindow: RollingWindow;
    private readonly tphWindow: RollingWindow;
    private readonly rphWindow: RollingWindow;

    constructor(config: RateLimitConfig) {
        this.config = {
            tpm: config.tpm ?? Infinity,
            rpm: config.rpm ?? Infinity,
            tph: config.tph ?? Infinity,
            rph: config.rph ?? Infinity,
            warningThreshold: config.warningThreshold ?? 0.8
        };

        // Create rolling windows
        this.tpmWindow = new RollingWindow({ windowMs: 60_000 }); // 1 minute
        this.rpmWindow = new RollingWindow({ windowMs: 60_000 });
        this.tphWindow = new RollingWindow({ windowMs: 3_600_000 }); // 1 hour
        this.rphWindow = new RollingWindow({ windowMs: 3_600_000 });
    }

    /**
     * Check if a request would exceed rate limits
     */
    checkLimit(usage: UsageRecord): RateLimitCheck {
        const now = Date.now();
        const tokens = usage.tokens ?? 0;
        const requests = usage.requests ?? 0;

        // Check TPM
        const currentTPM = this.tpmWindow.getTotal(now);
        if (currentTPM + tokens > this.config.tpm) {
            const oldestEntry = this.tpmWindow.getEntries(now)[0];
            const waitMs = oldestEntry ? oldestEntry.timestamp + 60_000 - now : 60_000;

            return {
                allowed: false,
                reason: 'tpm_exceeded',
                waitMs: Math.max(0, waitMs),
                usage: {
                    tpm: currentTPM,
                    rpm: this.rpmWindow.getTotal(now),
                    tpmLimit: this.config.tpm,
                    rpmLimit: this.config.rpm
                }
            };
        }

        // Check RPM
        const currentRPM = this.rpmWindow.getCount(now);
        if (currentRPM + requests > this.config.rpm) {
            const oldestEntry = this.rpmWindow.getEntries(now)[0];
            const waitMs = oldestEntry ? oldestEntry.timestamp + 60_000 - now : 60_000;

            return {
                allowed: false,
                reason: 'rpm_exceeded',
                waitMs: Math.max(0, waitMs),
                usage: {
                    tpm: currentTPM,
                    rpm: currentRPM,
                    tpmLimit: this.config.tpm,
                    rpmLimit: this.config.rpm
                }
            };
        }

        // Check TPH
        const currentTPH = this.tphWindow.getTotal(now);
        if (currentTPH + tokens > this.config.tph) {
            return {
                allowed: false,
                reason: 'tph_exceeded',
                waitMs: 3_600_000 // Wait an hour
            };
        }

        // Check RPH
        const currentRPH = this.rphWindow.getCount(now);
        if (currentRPH + requests > this.config.rph) {
            return {
                allowed: false,
                reason: 'rph_exceeded',
                waitMs: 3_600_000
            };
        }

        return {
            allowed: true,
            usage: {
                tpm: currentTPM,
                rpm: currentRPM,
                tpmLimit: this.config.tpm,
                rpmLimit: this.config.rpm
            }
        };
    }

    /**
     * Record actual usage after a request
     */
    recordUsage(usage: UsageRecord, timestamp: number = Date.now()): void {
        if (usage.tokens) {
            this.tpmWindow.add(usage.tokens, timestamp);
            this.tphWindow.add(usage.tokens, timestamp);
        }
        if (usage.requests) {
            this.rpmWindow.add(usage.requests, timestamp);
            this.rphWindow.add(usage.requests, timestamp);
        }
    }

    /**
     * Check if approaching rate limit (for warnings)
     */
    isApproachingLimit(now: number = Date.now()): boolean {
        const tpmUsage = this.tpmWindow.getTotal(now) / this.config.tpm;
        const rpmUsage = this.rpmWindow.getCount(now) / this.config.rpm;

        return tpmUsage >= this.config.warningThreshold ||
               rpmUsage >= this.config.warningThreshold;
    }

    /**
     * Get current usage statistics
     */
    getUsage(now: number = Date.now()): {
        tpm: number;
        rpm: number;
        tph: number;
        rph: number;
        tpmPercent: number;
        rpmPercent: number;
    } {
        const tpm = this.tpmWindow.getTotal(now);
        const rpm = this.rpmWindow.getCount(now);
        const tph = this.tphWindow.getTotal(now);
        const rph = this.rphWindow.getCount(now);

        return {
            tpm,
            rpm,
            tph,
            rph,
            tpmPercent: (tpm / this.config.tpm) * 100,
            rpmPercent: (rpm / this.config.rpm) * 100
        };
    }

    /**
     * Reset all tracking
     */
    reset(): void {
        this.tpmWindow.clear();
        this.rpmWindow.clear();
        this.tphWindow.clear();
        this.rphWindow.clear();
    }
}
