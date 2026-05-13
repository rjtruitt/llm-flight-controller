import { describe, it, expect, vi } from 'vitest';
import { checkModelHealth, extractRemainingQuota, ModelHealthCheckable } from './ModelHealth';
import { OpenAIContext } from '../types/Context';
import { ModelResponse } from '../types/Response';

describe('ModelHealth', () => {
    describe('checkModelHealth', () => {
        it('should return available when model responds successfully', async () => {
            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockResolvedValue({
                    id: 'test',
                    content: [{ type: 'text', text: 'ok' }],
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                    finishReason: 'stop',
                    metadata: { providerId: 'test', modelId: 'test' }
                }),
                hasSessionLimits: () => false
            };

            const result = await checkModelHealth(mockModel);

            expect(result.available).toBe(true);
            expect(result.hasSessionLimits).toBe(false);
            expect(mockModel.sendRequest).toHaveBeenCalledWith({
                messages: [{
                    role: 'user',
                    content: [{ type: 'text', text: 'hi' }]
                }],
                maxTokens: 1
            });
        });

        it('should return unavailable when model throws error', async () => {
            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
                hasSessionLimits: () => false
            };

            const result = await checkModelHealth(mockModel);

            expect(result.available).toBe(false);
            expect(result.error).toContain('Rate limit exceeded');
        });

        it('should detect rate limit errors', async () => {
            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
                hasSessionLimits: () => false
            };

            const result = await checkModelHealth(mockModel);

            expect(result.available).toBe(false);
            expect(result.errorType).toBe('rate_limit');
        });

        it('should detect session limit errors', async () => {
            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockRejectedValue(new Error('Daily limit exceeded')),
                hasSessionLimits: () => true
            };

            const result = await checkModelHealth(mockModel);

            expect(result.available).toBe(false);
            expect(result.errorType).toBe('session_limit');
            expect(result.hasSessionLimits).toBe(true);
        });

        it('should detect authentication errors', async () => {
            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockRejectedValue(new Error('401 Unauthorized')),
                hasSessionLimits: () => false
            };

            const result = await checkModelHealth(mockModel);

            expect(result.available).toBe(false);
            expect(result.errorType).toBe('auth');
        });

        it('should use error handler when available', async () => {
            const mockErrorHandler = {
                parseError: vi.fn().mockReturnValue({
                    modelError: { code: 'rate_limit_exceeded', message: 'Rate limited' }
                }),
                getRetryAfter: vi.fn().mockReturnValue(5000)
            };

            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockRejectedValue(new Error('Rate limit')),
                errorHandler: mockErrorHandler,
                hasSessionLimits: () => false
            };

            const result = await checkModelHealth(mockModel);

            expect(result.errorType).toBe('rate_limit');
            expect(result.suggestedCooldown).toBe(5000);
            expect(mockErrorHandler.parseError).toHaveBeenCalled();
        });

        it('should extract remaining quota from response', async () => {
            const mockResponse: ModelResponse = {
                id: 'test',
                content: [],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                finishReason: 'stop',
                metadata: {
                    providerId: 'test',
                    modelId: 'test',
                    custom: {
                        headers: {
                            'x-ratelimit-remaining-requests': '50'
                        }
                    }
                }
            };

            const mockModel: ModelHealthCheckable = {
                sendRequest: vi.fn().mockResolvedValue(mockResponse),
                hasSessionLimits: () => false
            };

            const result = await checkModelHealth(mockModel);

            expect(result.remainingQuota).toBe(50);
        });
    });

    describe('extractRemainingQuota', () => {
        it('should extract OpenAI format quota', () => {
            const response: ModelResponse = {
                id: 'test',
                content: [],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                finishReason: 'stop',
                metadata: {
                    providerId: 'openai',
                    modelId: 'gpt-4',
                    custom: {
                        headers: {
                            'x-ratelimit-remaining-requests': '100'
                        }
                    }
                }
            };

            const quota = extractRemainingQuota(response);
            expect(quota).toBe(100);
        });

        it('should extract Anthropic format quota', () => {
            const response: ModelResponse = {
                id: 'test',
                content: [],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                finishReason: 'stop',
                metadata: {
                    providerId: 'anthropic',
                    modelId: 'claude',
                    custom: {
                        headers: {
                            'anthropic-ratelimit-requests-remaining': '75'
                        }
                    }
                }
            };

            const quota = extractRemainingQuota(response);
            expect(quota).toBe(75);
        });

        it('should return undefined when no headers', () => {
            const response: ModelResponse = {
                id: 'test',
                content: [],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                finishReason: 'stop',
                metadata: {
                    providerId: 'test',
                    modelId: 'test'
                }
            };

            const quota = extractRemainingQuota(response);
            expect(quota).toBeUndefined();
        });

        it('should return undefined when no quota headers', () => {
            const response: ModelResponse = {
                id: 'test',
                content: [],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                finishReason: 'stop',
                metadata: {
                    providerId: 'test',
                    modelId: 'test',
                    custom: {
                        headers: {
                            'other-header': 'value'
                        }
                    }
                }
            };

            const quota = extractRemainingQuota(response);
            expect(quota).toBeUndefined();
        });
    });
});
