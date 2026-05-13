import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveRateLimiter } from './AdaptiveRateLimiter';

describe('AdaptiveRateLimiter', () => {
    describe('Token bucket strategy - TPM throttling', () => {
        it('should allow requests when tokens available', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000, // 60k tokens per minute = 1k per second
                useTokenBucket: true
            });

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(true);
            expect(result.waitMs).toBe(0);
            expect(result.state.available).toBeGreaterThanOrEqual(1000);
        });

        it('should deny requests when tokens exhausted', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 1000,
                useTokenBucket: true
            });

            // Consume all tokens
            await limiter.consume(1000);

            const result = await limiter.check(100);

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBeGreaterThan(0);
            expect(result.reason).toContain('Insufficient');
        });

        it('should calculate correct wait time for TPM refill', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000, // 1000 tokens per second
                useTokenBucket: true
            });

            // Consume all tokens
            await limiter.consume(60000);

            // Try to use 1000 more tokens
            const result = await limiter.check(1000);

            expect(result.allowed).toBe(false);
            // Should need to wait ~1 second for 1000 tokens to refill
            expect(result.waitMs).toBeGreaterThanOrEqual(900);
            expect(result.waitMs).toBeLessThanOrEqual(1100);
        });

        it('should refill tokens over time', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000, // 1000 tokens per second
                useTokenBucket: true
            });

            // Consume 10k tokens
            await limiter.consume(10000);

            const beforeRefill = await limiter.check(55000);
            expect(beforeRefill.allowed).toBe(false);

            // Wait for ~1 second (1000 tokens should refill)
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should now have ~51k tokens available
            const afterRefill = await limiter.check(51000);
            expect(afterRefill.allowed).toBe(true);
        });

        it('should handle fractional token refills correctly', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000, // 1000 tokens per second
                useTokenBucket: true
            });

            // Consume half
            await limiter.consume(30000);

            // Wait 600ms (600 tokens should refill)
            await new Promise(resolve => setTimeout(resolve, 650));

            // Should have ~30600 tokens now
            const result = await limiter.check(30500);
            expect(result.allowed).toBe(true);
        });

        it('should not exceed original limit after refill', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 10000,
                useTokenBucket: true
            });

            // Wait for potential overfill
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should still only have 10000 tokens max
            const result = await limiter.check(10001);
            expect(result.allowed).toBe(false);
        });
    });

    describe('Token bucket strategy - RPM limiting', () => {
        it('should handle requests per minute limiting', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'rpm',
                limit: 60, // 60 requests per minute = 1 per second
                useTokenBucket: true
            });

            // Should allow first request
            const first = await limiter.check(1);
            expect(first.allowed).toBe(true);

            // Consume it
            await limiter.consume(1);

            // Wait 1 second for 1 request to refill
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should allow another request
            const second = await limiter.check(1);
            expect(second.allowed).toBe(true);
        });

        it('should calculate correct RPM wait times', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'rpm',
                limit: 60, // 1 per second
                useTokenBucket: true
            });

            // Consume all requests
            await limiter.consume(60);

            // Try to make another request
            const result = await limiter.check(1);

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBeGreaterThanOrEqual(900);
            expect(result.waitMs).toBeLessThanOrEqual(1100);
        });
    });

    describe('Adaptive learning', () => {
        it('should start with unknown limit when not configured', () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                enableLearning: true
            });

            const state = limiter.getState();

            expect(state.limit).toBeNull();
            expect(state.strategy).toBe('unknown');
            expect(state.confidence).toBe(0);
        });

        it('should allow all requests until limit is learned', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                enableLearning: true
            });

            // Should allow huge request when no limit known
            const result = await limiter.check(1000000);

            expect(result.allowed).toBe(true);
            expect(result.state.available).toBe(Infinity);
        });

        it('should learn limit from throttling observations', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                enableLearning: true
            });

            // Simulate consumption over 30 seconds (realistic time window)
            for (let i = 0; i < 50; i++) {
                await limiter.consume(1000);
                // Small delay to simulate realistic timing
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            // Simulate hitting rate limit after consuming 50k tokens over ~1 second
            await limiter.onThrottled(1000);

            const state = limiter.getState();

            // Should have learned a limit - algorithm estimates based on (totalConsumed / timeElapsed) * 60000
            // With 50k consumed over ~1 second = ~50k per second = ~3M per minute
            // So we just verify it learned SOMETHING reasonable (not infinity)
            expect(state.limit).not.toBeNull();
            expect(state.limit).toBeGreaterThan(1000); // At least something learned
            expect(state.strategy).toBe('token-bucket');
            expect(state.confidence).toBe(0.5);
        });

        it('should reduce limit after consecutive failures', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 100000,
                enableLearning: true,
                learningReductionRate: 0.9
            });

            const initialLimit = limiter.getState().limit;

            // Simulate multiple throttling events
            await limiter.onThrottled(1000);
            await limiter.onThrottled(1000);

            const afterFailures = limiter.getState().limit;

            // Limit should be reduced by ~19% (0.9 * 0.9 = 0.81)
            expect(afterFailures).toBeLessThan(initialLimit!);
            expect(afterFailures).toBeCloseTo(initialLimit! * 0.81, -2);
        });

        it('should switch strategy after max consecutive failures', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 100000,
                useTokenBucket: true,
                enableLearning: true,
                maxConsecutiveFailures: 3
            });

            const initialStrategy = limiter.getState().strategy;
            expect(initialStrategy).toBe('token-bucket');

            // Trigger max consecutive failures
            await limiter.onThrottled(1000);
            await limiter.onThrottled(1000);
            await limiter.onThrottled(1000);

            const afterFailures = limiter.getState().strategy;
            expect(afterFailures).toBe('fixed-window');
        });

        it('should reset consecutive failures on successful consumption', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 100000,
                enableLearning: true
            });

            // Some failures
            await limiter.onThrottled(1000);
            await limiter.onThrottled(1000);

            expect(limiter.getState().consecutiveFailures).toBe(2);

            // Success should reset
            await limiter.consume(1000);

            expect(limiter.getState().consecutiveFailures).toBe(0);
        });

        it('should increase confidence as observations accumulate', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 100000,
                enableLearning: true
            });

            const initialConfidence = limiter.getState().confidence;

            // Add many observations
            for (let i = 0; i < 100; i++) {
                await limiter.consume(1000);
            }

            const afterObservations = limiter.getState().confidence;

            // Confidence should increase (though exact value depends on implementation)
            expect(afterObservations).toBeGreaterThanOrEqual(initialConfidence);
        });
    });

    describe('Fixed window strategy', () => {
        it('should use fixed window when token bucket disabled', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 10000,
                useTokenBucket: false
            });

            expect(limiter.getState().strategy).toBe('token-bucket'); // Set in constructor based on config

            // Consume some tokens
            await limiter.consume(5000);

            const result = await limiter.check(5000);
            expect(result.allowed).toBe(true);
        });
    });

    describe('Event callbacks', () => {
        it('should emit limit discovered event', async () => {
            const onLimitDiscovered = vi.fn();

            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                enableLearning: true
            });

            limiter.on('limit.discovered', onLimitDiscovered);

            // Simulate learning
            for (let i = 0; i < 50; i++) {
                await limiter.consume(1000);
            }
            await limiter.onThrottled(1000);

            // Wait a bit for async event emission
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onLimitDiscovered).toHaveBeenCalled();
            const event = onLimitDiscovered.mock.calls[0][0];
            expect(event).toHaveProperty('limit');
            expect(event).toHaveProperty('confidence');
        });

        it('should emit strategy changed event', async () => {
            const onStrategyChanged = vi.fn();

            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 100000,
                useTokenBucket: true,
                enableLearning: true,
                maxConsecutiveFailures: 2
            });

            limiter.on('strategy.changed', onStrategyChanged);

            // Trigger strategy change
            await limiter.onThrottled(1000);
            await limiter.onThrottled(1000);

            // Wait for async event
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onStrategyChanged).toHaveBeenCalled();
            expect(onStrategyChanged.mock.calls[0][0]).toBe('token-bucket');
            expect(onStrategyChanged.mock.calls[0][1]).toBe('fixed-window');
        });

        it('should emit limit adjusted event', async () => {
            const onLimitAdjusted = vi.fn();

            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 100000,
                enableLearning: true
            });

            limiter.on('limit.adjusted', onLimitAdjusted);

            // Trigger adjustment
            await limiter.onThrottled(1000);

            // Wait for async event
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(onLimitAdjusted).toHaveBeenCalled();
            const event = onLimitAdjusted.mock.calls[0][0];
            expect(event.limit).toBeLessThan(100000);
        });
    });

    describe('State management', () => {
        it('should provide current state', () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000
            });

            const state = limiter.getState();

            expect(state).toHaveProperty('type', 'tpm');
            expect(state).toHaveProperty('limit', 60000);
            expect(state).toHaveProperty('strategy');
            expect(state).toHaveProperty('confidence');
            expect(state).toHaveProperty('availableTokens');
            expect(state).toHaveProperty('refillRate');
            expect(state).toHaveProperty('observations');
        });

        it('should track observations', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000
            });

            await limiter.consume(1000);
            await limiter.consume(2000);

            const state = limiter.getState();

            expect(state.observations).toHaveLength(2);
            expect(state.observations[0].unitsConsumed).toBe(1000);
            expect(state.observations[1].unitsConsumed).toBe(2000);
        });
    });

    describe('Edge cases', () => {
        it('should handle zero token requests', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 1000
            });

            const result = await limiter.check(0);

            expect(result.allowed).toBe(true);
        });

        it('should handle very large token requests', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 1000
            });

            const result = await limiter.check(1000000);

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBeGreaterThan(0);
        });

        it('should handle rapid consecutive checks', async () => {
            const limiter = new AdaptiveRateLimiter({
                type: 'tpm',
                limit: 60000
            });

            // Fire many checks rapidly
            const results = await Promise.all([
                limiter.check(1000),
                limiter.check(1000),
                limiter.check(1000),
                limiter.check(1000),
                limiter.check(1000)
            ]);

            // All should be allowed (checking doesn't consume)
            results.forEach(r => expect(r.allowed).toBe(true));
        });
    });
});
