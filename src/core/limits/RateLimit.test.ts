import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimit } from './RateLimit';

describe('RateLimit', () => {
    describe('TPM (Tokens Per Minute) limiting', () => {
        it('should allow requests under TPM limit', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            const result = limit.checkLimit({ tokens: 5000, requests: 1 });

            expect(result.allowed).toBe(true);
            expect(result.usage?.tpm).toBe(0); // No usage yet
        });

        it('should deny requests exceeding TPM limit', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            // Record usage that approaches limit
            limit.recordUsage({ tokens: 9000, requests: 1 });

            // This would exceed
            const result = limit.checkLimit({ tokens: 2000, requests: 1 });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('tpm_exceeded');
            expect(result.waitMs).toBeGreaterThan(0);
        });

        it('should calculate correct wait time for TPM', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            // Record usage at specific time
            const startTime = Date.now();
            limit.recordUsage({ tokens: 10000, requests: 1 }, startTime);

            // Immediately try to exceed
            const result = limit.checkLimit({ tokens: 1, requests: 1 });

            expect(result.allowed).toBe(false);
            // Wait time should be approximately 60 seconds (until window expires)
            expect(result.waitMs).toBeGreaterThanOrEqual(59000);
            expect(result.waitMs).toBeLessThanOrEqual(60000);
        });

        it('should allow requests after TPM window expires', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            // Use entire limit
            limit.recordUsage({ tokens: 10000, requests: 1 }, Date.now() - 61000);

            // After 61 seconds, should be allowed (window expired)
            const result = limit.checkLimit({ tokens: 5000, requests: 1 });

            expect(result.allowed).toBe(true);
        });
    });

    describe('RPM (Requests Per Minute) limiting', () => {
        it('should allow requests under RPM limit', () => {
            const limit = new RateLimit({
                tpm: 100000,
                rpm: 10
            });

            const result = limit.checkLimit({ tokens: 1000, requests: 1 });

            expect(result.allowed).toBe(true);
        });

        it('should deny requests exceeding RPM limit', () => {
            const limit = new RateLimit({
                tpm: 100000,
                rpm: 10
            });

            // Record 10 requests
            for (let i = 0; i < 10; i++) {
                limit.recordUsage({ tokens: 1000, requests: 1 });
            }

            // 11th request should be denied
            const result = limit.checkLimit({ tokens: 1000, requests: 1 });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('rpm_exceeded');
        });

        it('should calculate correct wait time for RPM', () => {
            const limit = new RateLimit({
                tpm: 100000,
                rpm: 10
            });

            const startTime = Date.now();
            // Record 10 separate requests
            for (let i = 0; i < 10; i++) {
                limit.recordUsage({ tokens: 100, requests: 1 }, startTime);
            }

            const result = limit.checkLimit({ tokens: 1000, requests: 1 });

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBeGreaterThanOrEqual(59000);
            expect(result.waitMs).toBeLessThanOrEqual(60000);
        });
    });

    describe('TPH/RPH (Hourly limits)', () => {
        it('should enforce tokens per hour limit', () => {
            const limit = new RateLimit({
                tpm: 100000,
                rpm: 1000,
                tph: 50000
            });

            // Use entire hourly limit
            limit.recordUsage({ tokens: 50000, requests: 10 });

            const result = limit.checkLimit({ tokens: 1, requests: 1 });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('tph_exceeded');
            expect(result.waitMs).toBe(3_600_000); // 1 hour
        });

        it('should enforce requests per hour limit', () => {
            const limit = new RateLimit({
                tpm: 100000,
                rpm: 1000,
                rph: 100
            });

            // Use entire hourly limit - 100 separate requests
            for (let i = 0; i < 100; i++) {
                limit.recordUsage({ tokens: 10, requests: 1 });
            }

            const result = limit.checkLimit({ tokens: 1, requests: 1 });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('rph_exceeded');
            expect(result.waitMs).toBe(3_600_000);
        });
    });

    describe('Combined limits', () => {
        it('should check TPM before RPM', () => {
            const limit = new RateLimit({
                tpm: 1000,
                rpm: 100
            });

            limit.recordUsage({ tokens: 1000, requests: 1 });

            // TPM exceeded first
            const result = limit.checkLimit({ tokens: 100, requests: 1 });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('tpm_exceeded');
        });

        it('should allow when all limits satisfied', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100,
                tph: 100000,
                rph: 1000
            });

            limit.recordUsage({ tokens: 5000, requests: 50 });

            const result = limit.checkLimit({ tokens: 1000, requests: 10 });

            expect(result.allowed).toBe(true);
        });
    });

    describe('Warning threshold', () => {
        it('should detect approaching TPM limit', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100,
                warningThreshold: 0.8
            });

            // Use 85% of limit
            limit.recordUsage({ tokens: 8500, requests: 10 });

            expect(limit.isApproachingLimit()).toBe(true);
        });

        it('should detect approaching RPM limit', () => {
            const limit = new RateLimit({
                tpm: 100000,
                rpm: 100,
                warningThreshold: 0.8
            });

            // Use 85% of RPM limit - 85 separate requests
            for (let i = 0; i < 85; i++) {
                limit.recordUsage({ tokens: 10, requests: 1 });
            }

            expect(limit.isApproachingLimit()).toBe(true);
        });

        it('should not warn when under threshold', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100,
                warningThreshold: 0.8
            });

            // Use 50% of limits
            limit.recordUsage({ tokens: 5000, requests: 50 });

            expect(limit.isApproachingLimit()).toBe(false);
        });

        it('should use custom warning threshold', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100,
                warningThreshold: 0.5 // 50% threshold
            });

            // Use 60% of limit
            limit.recordUsage({ tokens: 6000, requests: 10 });

            expect(limit.isApproachingLimit()).toBe(true);
        });
    });

    describe('Usage tracking', () => {
        it('should track cumulative usage', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            limit.recordUsage({ tokens: 1000, requests: 1 });
            limit.recordUsage({ tokens: 2000, requests: 1 });
            limit.recordUsage({ tokens: 3000, requests: 1 });

            const usage = limit.getUsage();

            expect(usage.tpm).toBe(6000);
            expect(usage.rpm).toBe(3);
            expect(usage.tpmPercent).toBe(60);
            expect(usage.rpmPercent).toBe(3);
        });

        it('should return accurate usage statistics', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            // Record 50 separate requests with 100 tokens each
            for (let i = 0; i < 50; i++) {
                limit.recordUsage({ tokens: 100, requests: 1 });
            }

            const usage = limit.getUsage();

            expect(usage).toEqual({
                tpm: 5000,
                rpm: 50,
                tph: 5000,
                rph: 50,
                tpmPercent: 50,
                rpmPercent: 50
            });
        });
    });

    describe('Reset', () => {
        it('should clear all tracking', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            limit.recordUsage({ tokens: 9000, requests: 90 });

            const beforeReset = limit.getUsage();
            expect(beforeReset.tpm).toBe(9000);

            limit.reset();

            const afterReset = limit.getUsage();
            expect(afterReset.tpm).toBe(0);
            expect(afterReset.rpm).toBe(0);
        });

        it('should allow requests after reset', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            // Exhaust limit
            limit.recordUsage({ tokens: 10000, requests: 100 });

            let result = limit.checkLimit({ tokens: 1, requests: 1 });
            expect(result.allowed).toBe(false);

            // Reset
            limit.reset();

            // Should now be allowed
            result = limit.checkLimit({ tokens: 5000, requests: 50 });
            expect(result.allowed).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should handle zero usage', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            const result = limit.checkLimit({ tokens: 0, requests: 0 });

            expect(result.allowed).toBe(true);
        });

        it('should handle Infinity limits', () => {
            const limit = new RateLimit({}); // All limits default to Infinity

            limit.recordUsage({ tokens: 1000000, requests: 1000 });

            const result = limit.checkLimit({ tokens: 1000000, requests: 1000 });

            expect(result.allowed).toBe(true);
        });

        it('should handle partial usage records (tokens only)', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            limit.recordUsage({ tokens: 5000 });

            const usage = limit.getUsage();
            expect(usage.tpm).toBe(5000);
            expect(usage.rpm).toBe(0);
        });

        it('should handle partial usage records (requests only)', () => {
            const limit = new RateLimit({
                tpm: 10000,
                rpm: 100
            });

            // Record 10 requests without tokens
            for (let i = 0; i < 10; i++) {
                limit.recordUsage({ requests: 1 });
            }

            const usage = limit.getUsage();
            expect(usage.tpm).toBe(0);
            expect(usage.rpm).toBe(10);
        });
    });
});
