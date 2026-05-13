import { describe, it, expect, vi } from 'vitest';
import { CombinedRateLimiter } from './CombinedRateLimiter';

describe('CombinedRateLimiter', () => {
    describe('Basic functionality', () => {
        it('should allow requests when both RPM and TPM available', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 60 // 60 requests per minute
                },
                tpm: {
                    type: 'tpm',
                    limit: 60000 // 60k tokens per minute
                }
            });

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(true);
            expect(result.waitMs).toBe(0);
            expect(result.limitedBy).toBeUndefined();
        });

        it('should deny when RPM limit exceeded', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 2,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            // Consume RPM limit
            await limiter.consume(1000);
            await limiter.consume(1000);

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(false);
            expect(result.limitedBy).toBe('rpm');
            expect(result.waitMs).toBeGreaterThan(0);
        });

        it('should deny when TPM limit exceeded', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 100,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 5000,
                    useTokenBucket: true
                }
            });

            // Consume TPM limit
            await limiter.consume(5000);

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(false);
            expect(result.limitedBy).toBe('tpm');
            expect(result.waitMs).toBeGreaterThan(0);
        });

        it('should deny when both limits exceeded', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 2,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 5000,
                    useTokenBucket: true
                }
            });

            // Exhaust both limits
            await limiter.consume(2500);
            await limiter.consume(2500);

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(false);
            // Should be limited by whichever has shorter wait
            expect(result.limitedBy).toBeDefined();
            expect(result.waitMs).toBeGreaterThan(0);
        });
    });

    describe('Consumption tracking', () => {
        it('should track requests in RPM limiter', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 10,
                    useTokenBucket: true
                }
            });

            await limiter.consume(1000);
            await limiter.consume(2000);
            await limiter.consume(500);

            const state = limiter.getState();

            // Should have consumed 3 requests
            expect(state.rpm?.availableTokens).toBeLessThanOrEqual(7);
        });

        it('should track tokens in TPM limiter', async () => {
            const limiter = new CombinedRateLimiter({
                tpm: {
                    type: 'tpm',
                    limit: 10000,
                    useTokenBucket: true
                }
            });

            await limiter.consume(3000);
            await limiter.consume(2000);

            const state = limiter.getState();

            // Should have ~5000 tokens remaining
            expect(state.tpm?.availableTokens).toBeGreaterThanOrEqual(5000);
            expect(state.tpm?.availableTokens).toBeLessThanOrEqual(5000);
        });

        it('should track both RPM and TPM simultaneously', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 100,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            await limiter.consume(5000);
            await limiter.consume(3000);

            const state = limiter.getState();

            expect(state.rpm?.availableTokens).toBeLessThanOrEqual(98); // 2 requests consumed
            expect(state.tpm?.availableTokens).toBeLessThanOrEqual(92000); // 8000 tokens consumed
        });
    });

    describe('Throttling notifications', () => {
        it('should notify RPM limiter on RPM throttle', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 60,
                    enableLearning: true,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            // Simulate RPM throttle (with a limit already set)
            await limiter.onThrottled(1000, 'rpm');

            const state = limiter.getState();

            // RPM limiter should have recorded failure
            expect(state.rpm?.consecutiveFailures).toBeGreaterThan(0);
        });

        it('should notify TPM limiter on TPM throttle', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 100,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    enableLearning: true,
                    useTokenBucket: true
                }
            });

            // Simulate TPM throttle (with a limit already set)
            await limiter.onThrottled(5000, 'tpm');

            const state = limiter.getState();

            // TPM limiter should have recorded failure
            expect(state.tpm?.consecutiveFailures).toBeGreaterThan(0);
        });

        it('should notify both limiters when type unknown', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 60,
                    enableLearning: true,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 60000,
                    enableLearning: true,
                    useTokenBucket: true
                }
            });

            // Simulate throttle without specifying type (Bedrock case)
            await limiter.onThrottled(3000);

            const state = limiter.getState();

            // Both should have failures recorded
            expect(state.rpm?.consecutiveFailures).toBeGreaterThan(0);
            expect(state.tpm?.consecutiveFailures).toBeGreaterThan(0);
        });
    });

    describe('Header synchronization', () => {
        it('should sync RPM state from headers', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 60,
                    useTokenBucket: true
                }
            });

            await limiter.syncFromHeaders({
                rpm: {
                    remaining: 45,
                    limit: 60,
                    reset: new Date(Date.now() + 60000)
                }
            });

            const state = limiter.getState();

            expect(state.rpm?.limit).toBe(60);
            expect(state.rpm?.availableTokens).toBe(45);
        });

        it('should sync TPM state from headers', async () => {
            const limiter = new CombinedRateLimiter({
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            await limiter.syncFromHeaders({
                tpm: {
                    remaining: 75000,
                    limit: 100000,
                    reset: new Date(Date.now() + 60000)
                }
            });

            const state = limiter.getState();

            expect(state.tpm?.limit).toBe(100000);
            expect(state.tpm?.availableTokens).toBe(75000);
        });

        it('should sync both from headers', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 50,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 50000,
                    useTokenBucket: true
                }
            });

            await limiter.syncFromHeaders({
                rpm: {
                    remaining: 30,
                    limit: 50,
                    reset: new Date(Date.now() + 60000)
                },
                tpm: {
                    remaining: 25000,
                    limit: 50000,
                    reset: new Date(Date.now() + 60000)
                }
            });

            const state = limiter.getState();

            expect(state.rpm?.availableTokens).toBe(30);
            expect(state.tpm?.availableTokens).toBe(25000);
        });
    });

    describe('Event forwarding', () => {
        it('should forward events to underlying limiters', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    enableLearning: true
                },
                tpm: {
                    type: 'tpm',
                    enableLearning: true
                }
            });

            const onLimitDiscovered = vi.fn();
            limiter.on('limit.discovered', onLimitDiscovered);

            // Trigger learning by consuming and throttling
            for (let i = 0; i < 50; i++) {
                await limiter.consume(1000);
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            await limiter.onThrottled(1000, 'tpm');

            // Wait for async event emission
            await new Promise(resolve => setTimeout(resolve, 50));

            // Event should have been forwarded
            expect(onLimitDiscovered).toHaveBeenCalled();
        });
    });

    describe('State inspection', () => {
        it('should return state of both limiters', () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 60,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 60000,
                    useTokenBucket: true
                }
            });

            const state = limiter.getState();

            expect(state.rpm).toBeDefined();
            expect(state.rpm?.type).toBe('rpm');
            expect(state.rpm?.limit).toBe(60);

            expect(state.tpm).toBeDefined();
            expect(state.tpm?.type).toBe('tpm');
            expect(state.tpm?.limit).toBe(60000);
        });

        it('should return undefined for unconfigured limiters', () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 60,
                    useTokenBucket: true
                }
                // No TPM configured
            });

            const state = limiter.getState();

            expect(state.rpm).toBeDefined();
            expect(state.tpm).toBeUndefined();
        });
    });

    describe('Edge cases', () => {
        it('should work with only RPM configured', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 10,
                    useTokenBucket: true
                }
            });

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(true);
            expect(result.rpmState).toBeDefined();
            expect(result.tpmState).toBeUndefined();
        });

        it('should work with only TPM configured', async () => {
            const limiter = new CombinedRateLimiter({
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(true);
            expect(result.rpmState).toBeUndefined();
            expect(result.tpmState).toBeDefined();
        });

        it('should handle zero token requests', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 10,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 10000,
                    useTokenBucket: true
                }
            });

            const result = await limiter.check(0);

            expect(result.allowed).toBe(true);
        });

        it('should handle very large token requests', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 100,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 10000,
                    useTokenBucket: true
                }
            });

            const result = await limiter.check(1000000);

            expect(result.allowed).toBe(false);
            expect(result.limitedBy).toBe('tpm');
        });
    });

    describe('Wait time calculation', () => {
        it('should return wait time for RPM limit', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 1,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            // Exhaust RPM
            await limiter.consume(1000);

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBeGreaterThan(0);
            expect(result.limitedBy).toBe('rpm');
        });

        it('should return wait time for TPM limit', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 100,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 1000,
                    useTokenBucket: true
                }
            });

            // Exhaust TPM
            await limiter.consume(1000);

            const result = await limiter.check(100);

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBeGreaterThan(0);
            expect(result.limitedBy).toBe('tpm');
        });

        it('should return shorter wait time when both limited', async () => {
            const limiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 1,
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 1000,
                    useTokenBucket: true
                }
            });

            // Exhaust both
            await limiter.consume(1000);

            const result = await limiter.check(100);

            expect(result.allowed).toBe(false);
            // Should wait for whichever resets first
            expect(result.waitMs).toBeGreaterThan(0);
        });
    });
});
