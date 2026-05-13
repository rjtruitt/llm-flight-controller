import { describe, it, expect } from 'vitest';
import { ApiKeyAuth } from './ApiKeyAuth';

describe('ApiKeyAuth', () => {
    describe('Basic functionality', () => {
        it('should be authenticated by default', () => {
            const auth = new ApiKeyAuth({
                apiKey: 'test-key-123'
            });

            expect(auth.isAuthenticated()).toBe(true);
        });

        it('should return headers with default format', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'test-key-123'
            });

            const headers = await auth.getHeaders();

            expect(headers).toMatchObject({
                'Authorization': 'Bearer test-key-123'
            });
        });

        it('should use custom header name', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'test-key-123',
                headerName: 'X-API-Key'
            });

            const headers = await auth.getHeaders();

            expect(headers).toMatchObject({
                'X-API-Key': 'Bearer test-key-123'
            });
        });

        it('should use custom header prefix', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'test-key-123',
                headerPrefix: 'Token'
            });

            const headers = await auth.getHeaders();

            expect(headers).toMatchObject({
                'Authorization': 'Token test-key-123'
            });
        });

        it('should use custom header name and prefix', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'test-key-123',
                headerName: 'X-Custom-Auth',
                headerPrefix: 'ApiKey'
            });

            const headers = await auth.getHeaders();

            expect(headers).toMatchObject({
                'X-Custom-Auth': 'ApiKey test-key-123'
            });
        });

        it('should omit prefix when empty string', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'test-key-123',
                headerPrefix: ''
            });

            const headers = await auth.getHeaders();

            expect(headers).toMatchObject({
                'Authorization': 'test-key-123'
            });
        });
    });


    describe('Edge cases', () => {
        it('should handle empty API key', async () => {
            const auth = new ApiKeyAuth({
                apiKey: ''
            });

            const headers = await auth.getHeaders();

            expect(headers.Authorization).toBe('Bearer ');
        });

        it('should handle API key with spaces', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'key with spaces'
            });

            const headers = await auth.getHeaders();

            expect(headers.Authorization).toBe('Bearer key with spaces');
        });

        it('should handle special characters in API key', async () => {
            const auth = new ApiKeyAuth({
                apiKey: 'key-with-dashes_and_underscores.and.dots'
            });

            const headers = await auth.getHeaders();

            expect(headers.Authorization).toBe('Bearer key-with-dashes_and_underscores.and.dots');
        });
    });
});
