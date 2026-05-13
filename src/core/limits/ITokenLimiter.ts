/**
 * Token Limiter Interface - Pluggable token limit enforcement
 *
 * @aiInstructions
 * ITokenLimiter allows custom token limit implementations.
 * Useful for custom context window logic, adaptive limits, etc.
 *
 * @aiExample
 * ```typescript
 * class AdaptiveTokenLimiter implements ITokenLimiter {
 *   checkLimit(usage: TokenUsageRequest): TokenLimitCheck {
 *     // Adaptive logic based on time of day, load, etc.
 *     return { allowed: true };
 *   }
 *
 *   getAvailableOutputTokens(inputTokens: number): number {
 *     return Math.max(0, this.maxTokens - inputTokens);
 *   }
 * }
 * ```
 */

export interface TokenUsageRequest {
    inputTokens: number;
    requestedOutputTokens?: number;
}

export interface TokenLimitCheck {
    allowed: boolean;
    reason?: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        contextLimit: number;
        outputLimit: number;
    };
}

/**
 * Token limiter interface
 */
export interface ITokenLimiter {
    /**
     * Check if request would exceed token limits
     */
    checkLimit(usage: TokenUsageRequest): TokenLimitCheck;

    /**
     * Get maximum tokens available for output given input size
     */
    getAvailableOutputTokens(inputTokens: number): number;

    /**
     * Check if approaching limit (for warnings)
     */
    isApproachingLimit?(inputTokens: number, threshold?: number): boolean;
}
