/**
 * AWS Auth Provider - Handles AWS SSO and profile-based authentication
 *
 * @aiInstructions
 * This provider handles AWS authentication detection:
 * - Detects expired tokens (ExpiredTokenException)
 * - Provides credentials via AWS SDK
 * - Does NOT run shell commands - that's the application's job
 * - Throws clear AuthenticationError with profile info for app to handle
 */

import { fromIni } from '@aws-sdk/credential-providers';
import { IAuthProvider } from './IAuthProvider';
import { AuthenticationError } from '../core/errors/LLMError';

export interface AWSAuthConfig {
    /** AWS profile name (optional - uses default if not provided) */
    profile?: string;
    /** AWS region */
    region: string;
}

/**
 * AWS Authentication Provider
 * Handles credential loading and auth error detection
 */
export class AWSAuthProvider implements IAuthProvider {
    private config: AWSAuthConfig;
    private authenticated: boolean = true; // Assume authenticated until proven otherwise

    constructor(config: AWSAuthConfig) {
        this.config = config;
    }

    /**
     * Check if authenticated (synchronous)
     */
    isAuthenticated(): boolean {
        return this.authenticated;
    }

    /**
     * Initialize authentication - try to load credentials
     */
    async initialize(): Promise<void> {
        try {
            const credentials = this.getCredentials();
            await credentials(); // Resolve to verify they work
            this.authenticated = true;
        } catch (error) {
            this.authenticated = false;
            throw this.createAuthError(error as Error);
        }
    }

    /**
     * Refresh credentials
     * NOTE: AWS SDK doesn't support programmatic SSO login
     * This throws an error that tells the application what command to run
     */
    async refresh(): Promise<void> {
        throw this.createAuthError(new Error('Token expired'));
    }

    /**
     * Get auth headers (AWS doesn't use headers - uses SDK credential chain)
     */
    async getHeaders(): Promise<Record<string, string>> {
        return {}; // AWS SDK handles auth internally via credential providers
    }

    /**
     * Get credentials provider for AWS SDK
     */
    getCredentials() {
        if (this.config.profile) {
            return fromIni({ profile: this.config.profile });
        }
        return fromIni(); // Default credential chain
    }

    /**
     * Get profile name
     */
    getProfile(): string | undefined {
        return this.config.profile;
    }

    /**
     * Get region
     */
    getRegion(): string {
        return this.config.region;
    }

    /**
     * Handle authentication error from API call
     * Returns true if error is auth-related
     */
    handleAuthError(error: Error): boolean {
        const errorMessage = error.message.toLowerCase();
        const errorName = (error as any).name?.toLowerCase() || '';

        // Check for expired token
        if (errorName.includes('expiredtoken') ||
            errorMessage.includes('expiredtoken') ||
            errorMessage.includes('token has expired') ||
            errorMessage.includes('token is expired')) {
            this.authenticated = false;
            return true;
        }

        // Check for other auth errors
        if (errorName.includes('unauthorizedexception') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('access denied') ||
            errorMessage.includes('invalid credentials')) {
            this.authenticated = false;
            return true;
        }

        return false;
    }

    /**
     * Create a clear authentication error with instructions
     */
    private createAuthError(originalError: Error): AuthenticationError {
        const command = `aws sso login${this.config.profile ? ` --profile ${this.config.profile}` : ''}`;
        const message = `AWS SSO token expired or invalid. Please run: ${command}`;

        const error = new AuthenticationError(message, {}, originalError);

        // Add metadata that application can use
        (error as any).profile = this.config.profile;
        (error as any).region = this.config.region;
        (error as any).command = command;

        return error;
    }
}
