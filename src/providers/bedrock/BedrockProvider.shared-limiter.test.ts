/**
 * Tests for shared rate limiter functionality across multiple BedrockProvider instances
 *
 * This test suite validates that multiple provider instances can coordinate
 * on a single rate limiter quota (e.g., multiple agents sharing Bedrock account limits).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BedrockProvider } from './BedrockProvider';
import { CombinedRateLimiter } from '../../core/limits/CombinedRateLimiter';
import { ModelIdentity } from '../../core/model/ModelIdentity';
import { OpenAIContext } from '../../core/types/Context';

// Mock AWS Bedrock SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
    return {
        BedrockRuntimeClient: class MockBedrockRuntimeClient {
            async send() {
                return {
                    output: {
                        message: {
                            content: [{ text: 'Mock response' }],
                            role: 'assistant'
                        }
                    },
                    usage: {
                        inputTokens: 100,
                        outputTokens: 50,
                        totalTokens: 150
                    }
                };
            }
        },
        ConverseCommand: class MockConverseCommand {
            constructor(input: any) {}
        }
    };
});

// Mock AWS credentials
vi.mock('../../auth/AWSAuthProvider', () => ({
    AWSAuthProvider: class MockAWSAuthProvider {
        getCredentials() {
            return {};
        }
        handleAuthError() {
            return false;
        }
        async isAuthenticated() {
            return true;
        }
    }
}));

describe('BedrockProvider - Shared Rate Limiter', () => {
    const createIdentity = (id: string) => new ModelIdentity({
        id,
        displayName: id,
        provider: { id: 'bedrock', displayName: 'AWS Bedrock' }
    });

    const createContext = (): OpenAIContext => ({
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
        ],
        maxTokens: 100
    });

    describe('Shared rate limiter coordination', () => {
        it('should coordinate rate limiting across multiple provider instances', async () => {
            // Create shared rate limiter with very low limits
            const sharedLimiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 2, // Only 2 requests allowed
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 10000,
                    useTokenBucket: true
                }
            });

            // Create multiple provider instances sharing the same rate limiter
            const provider1 = new BedrockProvider({
                identity: createIdentity('model-1'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                sharedRateLimiter: sharedLimiter,
                capabilities: { streaming: false }
            });

            const provider2 = new BedrockProvider({
                identity: createIdentity('model-2'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                sharedRateLimiter: sharedLimiter,
                capabilities: { streaming: false }
            });

            // Both providers should use the same rate limiter instance
            expect(provider1.rateLimiter).toBe(provider2.rateLimiter);
            expect(provider1.rateLimiter).toBe(sharedLimiter);

            const context = createContext();

            // First request from provider1 should succeed
            await provider1.sendMessage(context);

            // Second request from provider2 should succeed (2/2 requests used)
            await provider2.sendMessage(context);

            // Third request from provider1 should be rate limited
            // because the shared limiter has exhausted its RPM quota
            const limiterState = sharedLimiter.getState();
            expect(limiterState.rpm?.availableTokens).toBeLessThanOrEqual(0);

            // Check should return not allowed
            const checkResult = await sharedLimiter.check(1000);
            expect(checkResult.allowed).toBe(false);
            expect(checkResult.limitedBy).toBe('rpm');
        });

        it('should allow independent rate limiting when no shared limiter provided', async () => {
            // Create providers WITHOUT shared limiter (each gets own limiter)
            const provider1 = new BedrockProvider({
                identity: createIdentity('model-1'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                rateLimits: {
                    rpm: { type: 'rpm', limit: 2, useTokenBucket: true },
                    tpm: { type: 'tpm', limit: 10000, useTokenBucket: true }
                },
                capabilities: { streaming: false }
            });

            const provider2 = new BedrockProvider({
                identity: createIdentity('model-2'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                rateLimits: {
                    rpm: { type: 'rpm', limit: 2, useTokenBucket: true },
                    tpm: { type: 'tpm', limit: 10000, useTokenBucket: true }
                },
                capabilities: { streaming: false }
            });

            // Each provider should have its own rate limiter
            expect(provider1.rateLimiter).not.toBe(provider2.rateLimiter);
            expect(provider1.rateLimiter).toBeDefined();
            expect(provider2.rateLimiter).toBeDefined();

            const context = createContext();

            // Each provider can make 2 requests independently (4 total)
            await provider1.sendMessage(context);
            await provider1.sendMessage(context);
            await provider2.sendMessage(context);
            await provider2.sendMessage(context);

            // Both should now be at their individual limits
            const state1 = provider1.rateLimiter!.getState();
            const state2 = provider2.rateLimiter!.getState();

            expect(state1.rpm?.availableTokens).toBeLessThanOrEqual(0);
            expect(state2.rpm?.availableTokens).toBeLessThanOrEqual(0);
        });

        it('should prefer sharedRateLimiter over rateLimits config', () => {
            const sharedLimiter = new CombinedRateLimiter({
                rpm: { type: 'rpm', limit: 100, useTokenBucket: true },
                tpm: { type: 'tpm', limit: 500000, useTokenBucket: true }
            });

            const provider = new BedrockProvider({
                identity: createIdentity('model-1'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                rateLimits: {
                    rpm: { type: 'rpm', limit: 10, useTokenBucket: true }, // Different limit
                    tpm: { type: 'tpm', limit: 10000, useTokenBucket: true }
                },
                sharedRateLimiter: sharedLimiter,
                capabilities: { streaming: false }
            });

            // Should use shared limiter, not create new one from rateLimits
            expect(provider.rateLimiter).toBe(sharedLimiter);
            const state = provider.rateLimiter!.getState();
            expect(state.rpm?.limit).toBe(100); // From shared limiter, not 10
        });
    });

    describe('Multi-agent simulation', () => {
        it('should prevent quota violations in multi-agent scenario', async () => {
            // Simulate orchestrator + 3 workers scenario
            const accountQuota = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 100, // 100 RPM account-wide
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 500000, // 500k TPM account-wide
                    useTokenBucket: true
                }
            });

            // Create 4 agents (1 orchestrator + 3 workers) sharing quota
            const agents = [
                new BedrockProvider({
                    identity: createIdentity('orchestrator'),
                    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    region: 'us-west-2',
                    sharedRateLimiter: accountQuota,
                    capabilities: { streaming: false }
                }),
                new BedrockProvider({
                    identity: createIdentity('worker-1'),
                    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    region: 'us-west-2',
                    sharedRateLimiter: accountQuota,
                    capabilities: { streaming: false }
                }),
                new BedrockProvider({
                    identity: createIdentity('worker-2'),
                    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    region: 'us-west-2',
                    sharedRateLimiter: accountQuota,
                    capabilities: { streaming: false }
                }),
                new BedrockProvider({
                    identity: createIdentity('worker-3'),
                    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    region: 'us-west-2',
                    sharedRateLimiter: accountQuota,
                    capabilities: { streaming: false }
                })
            ];

            // All agents share the same rate limiter
            agents.forEach(agent => {
                expect(agent.rateLimiter).toBe(accountQuota);
            });

            const context = createContext();

            // Make requests from multiple agents
            await agents[0].sendMessage(context); // orchestrator
            await agents[1].sendMessage(context); // worker-1
            await agents[2].sendMessage(context); // worker-2
            await agents[3].sendMessage(context); // worker-3

            // Check shared quota state
            const quotaState = accountQuota.getState();

            // Should have consumed 4 requests from shared RPM quota
            expect(quotaState.rpm?.availableTokens).toBeLessThanOrEqual(96); // 100 - 4 = 96

            // Should have consumed tokens from shared TPM quota
            expect(quotaState.tpm?.availableTokens).toBeLessThan(500000);
        });

        it('should coordinate wait times across agents', async () => {
            // Create shared limiter with very low limit
            const sharedLimiter = new CombinedRateLimiter({
                rpm: {
                    type: 'rpm',
                    limit: 1, // Only 1 request per minute
                    useTokenBucket: true
                },
                tpm: {
                    type: 'tpm',
                    limit: 100000,
                    useTokenBucket: true
                }
            });

            const provider1 = new BedrockProvider({
                identity: createIdentity('agent-1'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                sharedRateLimiter: sharedLimiter,
                capabilities: { streaming: false }
            });

            const provider2 = new BedrockProvider({
                identity: createIdentity('agent-2'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                sharedRateLimiter: sharedLimiter,
                capabilities: { streaming: false }
            });

            const context = createContext();

            // First request succeeds
            await provider1.sendMessage(context);

            // Both agents should see same wait time
            const check1 = await sharedLimiter.check(1000);
            const check2 = await sharedLimiter.check(1000);

            expect(check1.allowed).toBe(false);
            expect(check2.allowed).toBe(false);
            expect(check1.waitMs).toBe(check2.waitMs);
            expect(check1.limitedBy).toBe('rpm');
            expect(check2.limitedBy).toBe('rpm');
        });
    });

    describe('Token consumption tracking', () => {
        it('should track total consumption across all agents', async () => {
            const sharedLimiter = new CombinedRateLimiter({
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

            const agents = Array.from({ length: 5 }, (_, i) =>
                new BedrockProvider({
                    identity: createIdentity(`agent-${i}`),
                    modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    region: 'us-west-2',
                    sharedRateLimiter: sharedLimiter,
                    capabilities: { streaming: false }
                })
            );

            const context = createContext();

            // Each agent makes 1 request
            for (const agent of agents) {
                await agent.sendMessage(context);
            }

            const state = sharedLimiter.getState();

            // Should have consumed 5 requests
            expect(state.rpm?.availableTokens).toBeLessThanOrEqual(95); // 100 - 5 = 95

            // Should have consumed ~750 tokens (5 * 150 tokens per request)
            const tokensUsed = 100000 - (state.tpm?.availableTokens ?? 0);
            expect(tokensUsed).toBeGreaterThanOrEqual(500); // At least 5 * 100 input tokens
        });
    });

    describe('Error scenarios', () => {
        it('should work when both sharedRateLimiter and rateLimits are undefined', () => {
            const provider = new BedrockProvider({
                identity: createIdentity('model-1'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                // No rateLimits or sharedRateLimiter
                capabilities: { streaming: false }
            });

            // Should have no rate limiter
            expect(provider.rateLimiter).toBeUndefined();
        });

        it('should handle empty rate limit config gracefully', () => {
            const sharedLimiter = new CombinedRateLimiter({
                // Empty config - no RPM or TPM
            });

            const provider = new BedrockProvider({
                identity: createIdentity('model-1'),
                modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                region: 'us-west-2',
                sharedRateLimiter: sharedLimiter,
                capabilities: { streaming: false }
            });

            expect(provider.rateLimiter).toBe(sharedLimiter);
        });
    });
});
