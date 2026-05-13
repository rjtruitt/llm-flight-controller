import { describe, it, expect, vi } from 'vitest';
import { AWSAuthProvider } from './AWSAuthProvider';
import { AuthenticationError } from '../core/errors/LLMError';

// Mock AWS SDK
vi.mock('@aws-sdk/credential-providers', () => ({
    fromIni: vi.fn(() => async () => ({
        accessKeyId: 'mock-key',
        secretAccessKey: 'mock-secret'
    }))
}));

describe('AWSAuthProvider', () => {
    describe('Basic functionality', () => {
        it('should create provider with profile', () => {
            const provider = new AWSAuthProvider({
                profile: 'default',
                region: 'us-east-1'
            });

            expect(provider.getProfile()).toBe('default');
            expect(provider.getRegion()).toBe('us-east-1');
        });

        it('should create provider without profile', () => {
            const provider = new AWSAuthProvider({
                region: 'us-west-2'
            });

            expect(provider.getProfile()).toBeUndefined();
            expect(provider.getRegion()).toBe('us-west-2');
        });

        it('should be authenticated by default', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            expect(provider.isAuthenticated()).toBe(true);
        });
    });

    describe('Credentials', () => {
        it('should provide credentials function', () => {
            const provider = new AWSAuthProvider({
                profile: 'default',
                region: 'us-east-1'
            });

            const credentials = provider.getCredentials();
            expect(credentials).toBeDefined();
            expect(typeof credentials).toBe('function');
        });

        it('should provide credentials with profile', () => {
            const provider = new AWSAuthProvider({
                profile: 'my-profile',
                region: 'us-east-1'
            });

            const credentials = provider.getCredentials();
            expect(credentials).toBeDefined();
        });

        it('should provide credentials without profile', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            const credentials = provider.getCredentials();
            expect(credentials).toBeDefined();
        });
    });

    describe('Headers', () => {
        it('should return empty headers object', async () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            const headers = await provider.getHeaders();
            expect(headers).toEqual({});
        });
    });

    describe('Authentication errors', () => {
        it('should detect expired token error', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            const error = new Error('ExpiredTokenException: Token has expired');
            (error as any).name = 'ExpiredTokenException';

            const isAuthError = provider.handleAuthError(error);
            expect(isAuthError).toBe(true);
            expect(provider.isAuthenticated()).toBe(false);
        });

        it('should detect unauthorized error', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            const error = new Error('UnauthorizedException: Access denied');
            (error as any).name = 'UnauthorizedException';

            const isAuthError = provider.handleAuthError(error);
            expect(isAuthError).toBe(true);
            expect(provider.isAuthenticated()).toBe(false);
        });

        it('should detect invalid credentials error', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            const error = new Error('Invalid credentials provided');

            const isAuthError = provider.handleAuthError(error);
            expect(isAuthError).toBe(true);
            expect(provider.isAuthenticated()).toBe(false);
        });

        it('should not flag non-auth errors', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            const error = new Error('Network timeout');

            const isAuthError = provider.handleAuthError(error);
            expect(isAuthError).toBe(false);
            expect(provider.isAuthenticated()).toBe(true);
        });
    });

    describe('Refresh', () => {
        it('should throw auth error on refresh', async () => {
            const provider = new AWSAuthProvider({
                profile: 'default',
                region: 'us-east-1'
            });

            await expect(provider.refresh()).rejects.toThrow(AuthenticationError);
        });

        it('should include profile in error message', async () => {
            const provider = new AWSAuthProvider({
                profile: 'my-profile',
                region: 'us-east-1'
            });

            try {
                await provider.refresh();
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AuthenticationError);
                expect((error as Error).message).toContain('my-profile');
            }
        });

        it('should include command in error', async () => {
            const provider = new AWSAuthProvider({
                profile: 'test',
                region: 'us-east-1'
            });

            try {
                await provider.refresh();
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AuthenticationError);
                expect((error as Error).message).toContain('aws sso login');
            }
        });
    });

    describe('Different regions', () => {
        it('should handle us-east-1', () => {
            const provider = new AWSAuthProvider({
                region: 'us-east-1'
            });

            expect(provider.getRegion()).toBe('us-east-1');
        });

        it('should handle us-west-2', () => {
            const provider = new AWSAuthProvider({
                region: 'us-west-2'
            });

            expect(provider.getRegion()).toBe('us-west-2');
        });

        it('should handle eu-west-1', () => {
            const provider = new AWSAuthProvider({
                region: 'eu-west-1'
            });

            expect(provider.getRegion()).toBe('eu-west-1');
        });
    });
});
