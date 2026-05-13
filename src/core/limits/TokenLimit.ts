/**
 * Token Limit - Enforce per-request token limits
 *
 * @aiInstructions
 * TokenLimit tracks and enforces model-specific token limits (context window, max output).
 * Prevents sending requests that would exceed model capabilities.
 *
 * @aiExample
 * ```typescript
 * const tokenLimit = new TokenLimit({
 *   contextWindow: 200000,
 *   maxOutputTokens: 8192
 * });
 *
 * // Before sending request
 * const check = tokenLimit.checkLimit({
 *   inputTokens: 150000,
 *   requestedOutputTokens: 4000
 * });
 *
 * if (!check.allowed) {
 *   console.log(`Too many tokens! ${check.reason}`);
 *   // Need to compress context or switch models
 * }
 * ```
 *
 * @aiWhenToUse
 * Use TokenLimit when:
 * - Validating requests before sending to model
 * - Deciding if context needs compression
 * - Determining if model switch is needed
 * - Preventing context_length_exceeded errors
 */

import { ITokenLimiter, TokenUsageRequest, TokenLimitCheck } from './ITokenLimiter';

export interface TokenLimitConfig {
    /** Maximum context window in tokens */
    contextWindow: number;
    /** Maximum output tokens per request */
    maxOutputTokens: number;
    /** Buffer/safety margin (e.g., 0.95 = use 95% of limit) */
    safetyMargin?: number;
}

/**
 * Token Limit - Enforces per-request token limits
 */
export class TokenLimit implements ITokenLimiter {
    private readonly config: Required<TokenLimitConfig>;

    constructor(config: TokenLimitConfig) {
        this.config = {
            contextWindow: config.contextWindow,
            maxOutputTokens: config.maxOutputTokens,
            safetyMargin: config.safetyMargin ?? 1.0
        };
    }

    /**
     * Check if request would exceed token limits
     */
    checkLimit(usage: TokenUsageRequest): TokenLimitCheck {
        const inputTokens = usage.inputTokens;
        const outputTokens = usage.requestedOutputTokens ?? this.config.maxOutputTokens;
        const totalTokens = inputTokens + outputTokens;

        // Apply safety margin
        const effectiveContextLimit = this.config.contextWindow * this.config.safetyMargin;
        const effectiveOutputLimit = this.config.maxOutputTokens * this.config.safetyMargin;

        // Check if input alone exceeds context window
        if (inputTokens > effectiveContextLimit) {
            return {
                allowed: false,
                reason: 'input_exceeds_context_window',
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    contextLimit: this.config.contextWindow,
                    outputLimit: this.config.maxOutputTokens
                }
            };
        }

        // Check if requested output exceeds max
        if (outputTokens > effectiveOutputLimit) {
            return {
                allowed: false,
                reason: 'output_exceeds_maximum',
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    contextLimit: this.config.contextWindow,
                    outputLimit: this.config.maxOutputTokens
                }
            };
        }

        // Check if total would exceed context window
        if (totalTokens > effectiveContextLimit) {
            return {
                allowed: false,
                reason: 'total_exceeds_context_window',
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    contextLimit: this.config.contextWindow,
                    outputLimit: this.config.maxOutputTokens
                }
            };
        }

        return {
            allowed: true,
            usage: {
                inputTokens,
                outputTokens,
                totalTokens,
                contextLimit: this.config.contextWindow,
                outputLimit: this.config.maxOutputTokens
            }
        };
    }

    /**
     * Get maximum tokens available for output given input size
     */
    getAvailableOutputTokens(inputTokens: number): number {
        const effectiveLimit = this.config.contextWindow * this.config.safetyMargin;
        const available = Math.min(
            effectiveLimit - inputTokens,
            this.config.maxOutputTokens * this.config.safetyMargin
        );
        return Math.max(0, Math.floor(available));
    }

    /**
     * Check if approaching token limit (for warnings)
     */
    isApproachingLimit(inputTokens: number, threshold: number = 0.8): boolean {
        const limitWithSafety = this.config.contextWindow * this.config.safetyMargin;
        return inputTokens / limitWithSafety >= threshold;
    }

    /**
     * Get token limit info
     */
    getLimits(): {
        contextWindow: number;
        maxOutputTokens: number;
        safetyMargin: number;
        effectiveContextWindow: number;
        effectiveMaxOutput: number;
    } {
        return {
            contextWindow: this.config.contextWindow,
            maxOutputTokens: this.config.maxOutputTokens,
            safetyMargin: this.config.safetyMargin,
            effectiveContextWindow: this.config.contextWindow * this.config.safetyMargin,
            effectiveMaxOutput: this.config.maxOutputTokens * this.config.safetyMargin
        };
    }
}
