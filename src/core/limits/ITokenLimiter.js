"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=ITokenLimiter.js.map