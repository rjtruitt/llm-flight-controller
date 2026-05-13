import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelLimitChecker } from './ModelLimitChecker';
import { OpenAIContext } from '../types/Context';
import { ModelIdentity } from './ModelIdentity';
import { AuthenticationError } from '../errors/LLMError';

describe('ModelLimitChecker', () => {
    const mockIdentity: ModelIdentity = {
        provider: 'test',
        modelId: 'test-model',
        displayName: 'Test Model'
    };

    describe('checkAllLimits', () => {
        it('should check authentication first', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(false),
                initialize: vi.fn().mockResolvedValue(undefined),
                getHeaders: vi.fn()
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                estimateTokens: () => ({ input: 10, output: 10 })
            });

            await expect(checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            })).rejects.toThrow(AuthenticationError);

            expect(mockAuth.initialize).toHaveBeenCalled();
        });

        it('should call initialize if not authenticated', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn()
                    .mockReturnValueOnce(false)
                    .mockReturnValueOnce(true),
                initialize: vi.fn().mockResolvedValue(undefined),
                getHeaders: vi.fn()
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                estimateTokens: () => ({ input: 10, output: 10 })
            });

            await checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            });

            expect(mockAuth.initialize).toHaveBeenCalled();
        });

        it('should check rate limits', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(true),
                getHeaders: vi.fn()
            };

            const mockRateLimiter = {
                checkLimit: vi.fn().mockReturnValue({
                    allowed: false,
                    reason: 'Rate limit exceeded'
                }),
                recordUsage: vi.fn(),
                isApproachingLimit: vi.fn().mockReturnValue(false)
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                rateLimiter: mockRateLimiter,
                estimateTokens: () => ({ input: 100, output: 50 })
            });

            const context: OpenAIContext = {
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            };

            await expect(checker.checkAllLimits(context)).rejects.toThrow();

            expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith({
                tokens: 150,
                requests: 1
            });
        });

        it('should emit warning when approaching rate limit', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(true),
                getHeaders: vi.fn()
            };

            const mockRateLimiter = {
                checkLimit: vi.fn().mockReturnValue({ allowed: true }),
                recordUsage: vi.fn(),
                isApproachingLimit: vi.fn().mockReturnValue(true)
            };

            const mockBlockerHandler = {
                handleBlocker: vi.fn()
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                rateLimiter: mockRateLimiter,
                blockerHandler: mockBlockerHandler,
                estimateTokens: () => ({ input: 10, output: 10 })
            });

            await checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            });

            expect(mockBlockerHandler.handleBlocker).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'rate_limit_warning',
                    severity: 'info',
                    blocking: false
                })
            );
        });

        it('should check session limits', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(true),
                getHeaders: vi.fn()
            };

            const mockSessionLimiter = {
                checkLimit: vi.fn().mockReturnValue({
                    allowed: false,
                    reason: 'Session limit exceeded',
                    resetAt: Date.now() + 3600000
                }),
                recordUsage: vi.fn()
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                sessionLimiter: mockSessionLimiter,
                estimateTokens: () => ({ input: 100, output: 50 })
            });

            await expect(checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            })).rejects.toThrow();

            expect(mockSessionLimiter.checkLimit).toHaveBeenCalledWith({
                tokens: 100
            });
        });

        it('should check token limits', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(true),
                getHeaders: vi.fn()
            };

            const mockTokenLimiter = {
                checkLimit: vi.fn().mockReturnValue({
                    allowed: false,
                    reason: 'Context too large',
                    usage: { contextLimit: 1000 }
                })
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                tokenLimiter: mockTokenLimiter,
                estimateTokens: () => ({ input: 2000, output: 100 })
            });

            await expect(checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'a'.repeat(10000) }] }]
            })).rejects.toThrow();

            expect(mockTokenLimiter.checkLimit).toHaveBeenCalledWith({
                inputTokens: 2000,
                requestedOutputTokens: 100
            });
        });

        it('should check pricing budget', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(true),
                getHeaders: vi.fn()
            };

            const mockPricingTracker = {
                calculateCost: vi.fn().mockReturnValue(0.50),
                checkBudget: vi.fn().mockReturnValue({
                    allowed: false,
                    reason: 'Budget exceeded',
                    currentCost: 10.0,
                    limit: 10.0
                }),
                recordUsage: vi.fn()
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                pricingTracker: mockPricingTracker,
                estimateTokens: () => ({ input: 1000, output: 500 })
            });

            await expect(checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            })).rejects.toThrow();

            expect(mockPricingTracker.calculateCost).toHaveBeenCalledWith({
                inputTokens: 1000,
                outputTokens: 500,
                totalTokens: 1500
            });
        });

        it('should pass when all limits allow', async () => {
            const mockAuth = {
                isAuthenticated: vi.fn().mockReturnValue(true),
                getHeaders: vi.fn()
            };

            const mockRateLimiter = {
                checkLimit: vi.fn().mockReturnValue({ allowed: true }),
                recordUsage: vi.fn(),
                isApproachingLimit: vi.fn().mockReturnValue(false)
            };

            const mockSessionLimiter = {
                checkLimit: vi.fn().mockReturnValue({ allowed: true }),
                recordUsage: vi.fn()
            };

            const mockTokenLimiter = {
                checkLimit: vi.fn().mockReturnValue({ allowed: true })
            };

            const mockPricingTracker = {
                calculateCost: vi.fn().mockReturnValue(0.01),
                checkBudget: vi.fn().mockReturnValue({ allowed: true }),
                recordUsage: vi.fn()
            };

            const checker = new ModelLimitChecker({
                identity: mockIdentity,
                auth: mockAuth,
                rateLimiter: mockRateLimiter,
                sessionLimiter: mockSessionLimiter,
                tokenLimiter: mockTokenLimiter,
                pricingTracker: mockPricingTracker,
                estimateTokens: () => ({ input: 100, output: 50 })
            });

            await expect(checker.checkAllLimits({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
            })).resolves.not.toThrow();
        });
    });
});
