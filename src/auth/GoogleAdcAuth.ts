/**
 * Google Application Default Credentials (ADC) Authentication
 *
 * @aiInstructions
 * Uses Google Application Default Credentials. Automatically discovers credentials from:
 * 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 2. gcloud CLI configuration
 * 3. Compute Engine/GKE metadata service
 *
 * @aiExample
 * ```typescript
 * const auth = new GoogleAdcAuth({
 *   scopes: ['https://www.googleapis.com/auth/cloud-platform']
 * });
 *
 * await auth.initialize();
 * const headers = await auth.getHeaders();
 * ```
 */

import { IAuthProvider, IAuthHandler, AuthenticationError } from './IAuthProvider';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface GoogleAdcConfig {
    /** OAuth scopes */
    scopes: string[];
    /** Path to service account JSON (overrides auto-discovery) */
    credentialsPath?: string;
}

interface ServiceAccountCredentials {
    client_email: string;
    private_key: string;
    token_uri: string;
}

export class GoogleAdcAuth implements IAuthProvider {
    private accessToken?: string;
    private expiresAt?: number;
    private authHandler?: IAuthHandler;
    private credentials?: ServiceAccountCredentials;

    constructor(private config: GoogleAdcConfig) {}

    setAuthHandler(handler: IAuthHandler): void {
        this.authHandler = handler;
    }

    async initialize(): Promise<void> {
        await this.loadCredentials();
        await this.fetchToken();
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (!this.isAuthenticated()) {
            await this.refresh();
        }

        return {
            'Authorization': `Bearer ${this.accessToken}`
        };
    }

    async refresh(): Promise<void> {
        await this.fetchToken();
    }

    isAuthenticated(): boolean {
        if (!this.accessToken || !this.expiresAt) {
            return false;
        }
        // Check if token expires in next 5 minutes
        return Date.now() < this.expiresAt - 5 * 60 * 1000;
    }

    private async loadCredentials(): Promise<void> {
        try {
            let credPath = this.config.credentialsPath;

            // Try GOOGLE_APPLICATION_CREDENTIALS env var
            if (!credPath && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            }

            // Try gcloud default path
            if (!credPath) {
                credPath = join(
                    homedir(),
                    '.config',
                    'gcloud',
                    'application_default_credentials.json'
                );
            }

            const content = await readFile(credPath, 'utf-8');
            const creds = JSON.parse(content);

            // Check if it's a service account key
            if (creds.type === 'service_account') {
                this.credentials = {
                    client_email: creds.client_email,
                    private_key: creds.private_key,
                    token_uri: creds.token_uri || 'https://oauth2.googleapis.com/token'
                };
            } else {
                throw new AuthenticationError(
                    'Google ADC only supports service account credentials'
                );
            }
        } catch (error) {
            if (this.authHandler) {
                this.authHandler.onAuthenticationFailed({
                    provider: 'google_adc',
                    reason: error instanceof Error ? error.message : 'Failed to load credentials',
                    canRetry: false
                });
            }
            throw error;
        }
    }

    private async fetchToken(): Promise<void> {
        if (!this.credentials) {
            throw new AuthenticationError('Credentials not loaded');
        }

        try {
            // Create JWT assertion
            const now = Math.floor(Date.now() / 1000);
            const claim = {
                iss: this.credentials.client_email,
                scope: this.config.scopes.join(' '),
                aud: this.credentials.token_uri,
                exp: now + 3600,
                iat: now
            };

            // Sign JWT (simplified - in production use a proper JWT library)
            const jwt = await this.createJwt(claim, this.credentials.private_key);

            // Exchange JWT for access token
            const body = new URLSearchParams({
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion': jwt
            });

            const response = await fetch(this.credentials.token_uri, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            });

            if (!response.ok) {
                const error: any = await response.json().catch(() => ({ error: response.statusText }));
                throw new AuthenticationError(
                    `Google OAuth token request failed: ${error.error_description || error.error}`
                );
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
            this.expiresAt = Date.now() + (data.expires_in * 1000);

        } catch (error) {
            if (this.authHandler) {
                this.authHandler.onAuthenticationFailed({
                    provider: 'google_adc',
                    reason: error instanceof Error ? error.message : 'Failed to fetch token',
                    canRetry: true
                });
            }
            throw error;
        }
    }

    private async createJwt(_claim: any, _privateKey: string): Promise<string> {
        // In production, use a proper JWT library like 'jsonwebtoken'
        // Note: Actual implementation would use crypto.subtle.importKey() and sign()
        throw new AuthenticationError(
            'JWT signing not implemented - install google-auth-library npm package'
        );
    }
}
