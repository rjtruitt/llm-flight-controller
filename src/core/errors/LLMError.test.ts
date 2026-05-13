import { describe, it, expect } from 'vitest';
import {
    LLMError,
    RateLimitError,
    AuthenticationError,
    ValidationError,
    ModelNotFoundError,
    ProviderError,
    ContextLengthError,
    NetworkError,
    ParseError
} from './LLMError';

describe('LLMError', () => {
    describe('RateLimitError', () => {
        it('should create error with retry after', () => {
            const error = new RateLimitError(
                'Rate limit exceeded',
                { remainingRequests: 0 },
                5000
            );

            expect(error).toBeInstanceOf(LLMError);
            expect(error).toBeInstanceOf(RateLimitError);
            expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
            expect(error.message).toBe('Rate limit exceeded');
            expect(error.retryAfter).toBe(5000);
            expect(error.context).toEqual({ remainingRequests: 0 });
        });

        it('should serialize to JSON', () => {
            const error = new RateLimitError('Test', {}, 1000);
            const json = error.toJSON();

            expect(json).toHaveProperty('name', 'RateLimitError');
            expect(json).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
            expect(json).toHaveProperty('message', 'Test');
            expect(json).toHaveProperty('context');
            expect(json).toHaveProperty('stack');
        });
    });

    describe('AuthenticationError', () => {
        it('should create auth error', () => {
            const error = new AuthenticationError(
                'Invalid API key',
                { provider: 'openai' }
            );

            expect(error.code).toBe('AUTH_FAILED');
            expect(error.message).toBe('Invalid API key');
            expect(error.context.provider).toBe('openai');
        });
    });

    describe('ValidationError', () => {
        it('should include field name', () => {
            const error = new ValidationError(
                'temperature',
                'Must be between 0 and 2',
                { value: 3.5 }
            );

            expect(error.code).toBe('VALIDATION_FAILED');
            expect(error.field).toBe('temperature');
            expect(error.context.field).toBe('temperature');
            expect(error.context.value).toBe(3.5);
        });
    });

    describe('ModelNotFoundError', () => {
        it('should include model ID', () => {
            const error = new ModelNotFoundError(
                'gpt-5',
                'Model not registered'
            );

            expect(error.code).toBe('MODEL_NOT_FOUND');
            expect(error.modelId).toBe('gpt-5');
            expect(error.context.modelId).toBe('gpt-5');
        });
    });

    describe('ProviderError', () => {
        it('should include provider and status code', () => {
            const error = new ProviderError(
                'anthropic',
                'Service unavailable',
                {},
                503
            );

            expect(error.code).toBe('PROVIDER_ERROR');
            expect(error.provider).toBe('anthropic');
            expect(error.statusCode).toBe(503);
            expect(error.context.provider).toBe('anthropic');
            expect(error.context.statusCode).toBe(503);
        });
    });

    describe('ContextLengthError', () => {
        it('should include token counts', () => {
            const error = new ContextLengthError(
                150000,
                128000,
                'Context too long'
            );

            expect(error.code).toBe('CONTEXT_LENGTH_EXCEEDED');
            expect(error.requestedTokens).toBe(150000);
            expect(error.maxTokens).toBe(128000);
        });
    });

    describe('NetworkError', () => {
        it('should wrap original error', () => {
            const originalError = new Error('ECONNREFUSED');
            const error = new NetworkError(
                'Connection failed',
                { host: 'api.openai.com' },
                originalError
            );

            expect(error.code).toBe('NETWORK_ERROR');
            expect(error.cause).toBe(originalError);
            expect(error.context.host).toBe('api.openai.com');
        });
    });

    describe('ParseError', () => {
        it('should include raw response in context', () => {
            const error = new ParseError(
                'Invalid JSON',
                { rawResponse: '{invalid}' }
            );

            expect(error.code).toBe('PARSE_ERROR');
            expect(error.context.rawResponse).toBe('{invalid}');
        });
    });

    describe('Error chaining', () => {
        it('should maintain cause chain', () => {
            const rootCause = new Error('Network timeout');
            const networkError = new NetworkError('Request failed', {}, rootCause);
            const providerError = new ProviderError(
                'openai',
                'API error',
                {},
                500,
                networkError
            );

            expect(providerError.cause).toBe(networkError);
            expect(networkError.cause).toBe(rootCause);
        });
    });
});
