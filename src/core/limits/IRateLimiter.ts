/**
 * Rate Limiter Interface - Pluggable rate limiting
 *
 * @aiInstructions
 * IRateLimiter allows custom rate limiting implementations.
 * Implement this to use your own throttling logic.
 *
 * @aiExample
 * ```typescript
 * class CustomRateLimiter implements IRateLimiter {
 *   checkLimit(usage: UsageRecord): RateLimitCheck {
 *     // Your custom logic
 *     return { allowed: true };
 *   }
 *
 *   recordUsage(usage: UsageRecord): void {
 *     // Track usage your way
 *   }
 *
 *   isApproachingLimit(): boolean {
 *     return false;
 *   }
 * }
 * ```
 */

export interface UsageRecord {
    tokens?: number;
    requests?: number;
}

export interface RateLimitCheck {
    allowed: boolean;
    reason?: string;
    waitMs?: number;
    usage?: {
        tpm: number;
        rpm: number;
        tpmLimit: number;
        rpmLimit: number;
    };
}

/**
 * Rate limiter interface
 */
export interface IRateLimiter {
    /**
     * Check if usage is allowed under rate limits
     */
    checkLimit(usage: UsageRecord): RateLimitCheck;

    /**
     * Record actual usage
     */
    recordUsage(usage: UsageRecord): void;

    /**
     * Check if approaching limit (for warnings)
     */
    isApproachingLimit(threshold?: number): boolean;

    /**
     * Reset all tracking
     */
    reset?(): void;
}
