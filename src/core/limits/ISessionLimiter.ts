/**
 * Session Limiter Interface - Pluggable session/daily limits
 *
 * @aiInstructions
 * ISessionLimiter allows custom session limit implementations.
 * Useful for custom free tier logic, quotas, etc.
 *
 * @aiExample
 * ```typescript
 * class CustomSessionLimiter implements ISessionLimiter {
 *   checkLimit(usage: SessionUsage): SessionLimitCheck {
 *     // Your custom quota logic
 *     return { allowed: true };
 *   }
 *
 *   recordUsage(usage: SessionUsage): void {
 *     // Track usage
 *   }
 * }
 * ```
 */

export interface SessionUsage {
    messages?: number;
    sessions?: number;
    tokens?: number;
}

export interface SessionLimitCheck {
    allowed: boolean;
    reason?: string;
    resetAt?: Date;
}

/**
 * Session limiter interface
 */
export interface ISessionLimiter {
    /**
     * Check if usage is allowed under session limits
     */
    checkLimit(usage: SessionUsage): SessionLimitCheck;

    /**
     * Record actual usage
     */
    recordUsage(usage: SessionUsage): void;

    /**
     * Reset tracking
     */
    reset?(): void;
}
