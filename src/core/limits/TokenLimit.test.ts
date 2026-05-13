import { describe, it, expect } from 'vitest';
import { TokenLimit } from './TokenLimit';

describe('TokenLimit', () => {
    describe('Context window limits', () => {
        it('should allow requests within context window', () => {
            const limit = new TokenLimit({
                contextWindow: 200000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 150000,
                requestedOutputTokens: 4000
            });

            expect(result.allowed).toBe(true);
            expect(result.usage?.totalTokens).toBe(154000);
        });

        it('should deny requests where input exceeds context window', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 150000,
                requestedOutputTokens: 1000
            });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('input_exceeds_context_window');
        });

        it('should deny requests where total exceeds context window', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 95000,
                requestedOutputTokens: 8000
            });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('total_exceeds_context_window');
        });
    });

    describe('Output token limits', () => {
        it('should allow output within max limit', () => {
            const limit = new TokenLimit({
                contextWindow: 200000,
                maxOutputTokens: 4096
            });

            const result = limit.checkLimit({
                inputTokens: 1000,
                requestedOutputTokens: 2000
            });

            expect(result.allowed).toBe(true);
        });

        it('should deny output exceeding max limit', () => {
            const limit = new TokenLimit({
                contextWindow: 200000,
                maxOutputTokens: 4096
            });

            const result = limit.checkLimit({
                inputTokens: 1000,
                requestedOutputTokens: 10000
            });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('output_exceeds_maximum');
        });

        it('should use max output tokens when not specified', () => {
            const limit = new TokenLimit({
                contextWindow: 200000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 100000
            });

            // Should assume maxOutputTokens
            expect(result.usage?.outputTokens).toBe(8192);
        });
    });

    describe('Safety margin', () => {
        it('should apply safety margin to context window', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 0.9 // 90%
            });

            // 91k is over 90% of 100k
            const result = limit.checkLimit({
                inputTokens: 91000,
                requestedOutputTokens: 1000
            });

            expect(result.allowed).toBe(false);
        });

        it('should apply safety margin to output tokens', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 0.9
            });

            // 8000 is over 90% of 8192
            const result = limit.checkLimit({
                inputTokens: 1000,
                requestedOutputTokens: 8000
            });

            expect(result.allowed).toBe(false);
        });

        it('should default safety margin to 1.0', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const limits = limit.getLimits();

            expect(limits.safetyMargin).toBe(1.0);
            expect(limits.effectiveContextWindow).toBe(100000);
        });

        it('should allow requests at exact safety margin limit', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 0.95
            });

            // Exactly at 95% = 95k
            const result = limit.checkLimit({
                inputTokens: 95000,
                requestedOutputTokens: 0
            });

            expect(result.allowed).toBe(true);
        });
    });

    describe('Available output tokens', () => {
        it('should calculate available output tokens', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const available = limit.getAvailableOutputTokens(90000);

            // 100k - 90k = 10k, but capped at maxOutputTokens (8192)
            expect(available).toBe(8192);
        });

        it('should respect max output limit', () => {
            const limit = new TokenLimit({
                contextWindow: 200000,
                maxOutputTokens: 4096
            });

            const available = limit.getAvailableOutputTokens(50000);

            // Room for 150k but max is 4096
            expect(available).toBe(4096);
        });

        it('should return 0 when input fills context window', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const available = limit.getAvailableOutputTokens(100000);

            expect(available).toBe(0);
        });

        it('should return 0 when input exceeds context window', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const available = limit.getAvailableOutputTokens(150000);

            expect(available).toBe(0);
        });

        it('should apply safety margin to available calculation', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 0.9
            });

            const available = limit.getAvailableOutputTokens(80000);

            // Effective limit: 90k
            // Available: 90k - 80k = 10k, but capped at 90% of 8192 = 7372
            expect(available).toBe(7372);
        });
    });

    describe('Approaching limit warnings', () => {
        it('should detect when approaching limit', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            // 85k is over 80% threshold
            const approaching = limit.isApproachingLimit(85000);

            expect(approaching).toBe(true);
        });

        it('should not warn when below threshold', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            // 70k is below 80% threshold
            const approaching = limit.isApproachingLimit(70000);

            expect(approaching).toBe(false);
        });

        it('should support custom warning threshold', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            // 91k is over 90% threshold
            const approaching = limit.isApproachingLimit(91000, 0.9);

            expect(approaching).toBe(true);
        });

        it('should apply safety margin to threshold calculation', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 0.9 // Effective limit: 90k
            });

            // 73k is over 80% of 90k (72k)
            const approaching = limit.isApproachingLimit(73000, 0.8);

            expect(approaching).toBe(true);
        });
    });

    describe('Get limits info', () => {
        it('should return limit configuration', () => {
            const limit = new TokenLimit({
                contextWindow: 200000,
                maxOutputTokens: 8192,
                safetyMargin: 0.95
            });

            const limits = limit.getLimits();

            expect(limits).toEqual({
                contextWindow: 200000,
                maxOutputTokens: 8192,
                safetyMargin: 0.95,
                effectiveContextWindow: 190000,
                effectiveMaxOutput: 7782.4
            });
        });

        it('should show effective limits with safety margin', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 4096,
                safetyMargin: 0.8
            });

            const limits = limit.getLimits();

            expect(limits.effectiveContextWindow).toBe(80000);
            expect(limits.effectiveMaxOutput).toBe(3276.8);
        });
    });

    describe('Usage metadata', () => {
        it('should include usage details in response', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 50000,
                requestedOutputTokens: 2000
            });

            expect(result.usage).toEqual({
                inputTokens: 50000,
                outputTokens: 2000,
                totalTokens: 52000,
                contextLimit: 100000,
                outputLimit: 8192
            });
        });

        it('should include usage even when denied', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 150000,
                requestedOutputTokens: 1000
            });

            expect(result.allowed).toBe(false);
            expect(result.usage).toBeDefined();
            expect(result.usage?.inputTokens).toBe(150000);
        });
    });

    describe('Edge cases', () => {
        it('should handle zero input tokens', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 0,
                requestedOutputTokens: 1000
            });

            expect(result.allowed).toBe(true);
        });

        it('should handle zero output tokens', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192
            });

            const result = limit.checkLimit({
                inputTokens: 50000,
                requestedOutputTokens: 0
            });

            expect(result.allowed).toBe(true);
        });

        it('should handle very large context windows', () => {
            const limit = new TokenLimit({
                contextWindow: 2_000_000, // 2M tokens
                maxOutputTokens: 16_384
            });

            const result = limit.checkLimit({
                inputTokens: 1_500_000,
                requestedOutputTokens: 10_000
            });

            expect(result.allowed).toBe(true);
        });

        it('should handle small context windows', () => {
            const limit = new TokenLimit({
                contextWindow: 4096,
                maxOutputTokens: 1024
            });

            const result = limit.checkLimit({
                inputTokens: 3000,
                requestedOutputTokens: 500
            });

            expect(result.allowed).toBe(true);
        });

        it('should handle safety margin of 0', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 0
            });

            // Everything should fail with 0 safety margin
            const result = limit.checkLimit({
                inputTokens: 1,
                requestedOutputTokens: 1
            });

            expect(result.allowed).toBe(false);
        });

        it('should handle safety margin greater than 1', () => {
            const limit = new TokenLimit({
                contextWindow: 100000,
                maxOutputTokens: 8192,
                safetyMargin: 1.1 // 110% - allows over limit
            });

            const result = limit.checkLimit({
                inputTokens: 105000,
                requestedOutputTokens: 1000
            });

            expect(result.allowed).toBe(true);
        });
    });
});
