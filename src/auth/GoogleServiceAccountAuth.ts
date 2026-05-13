/**
 * Google Service Account Authentication
 *
 * @aiInstructions
 * Direct authentication using Google Service Account JSON key.
 * Simpler than ADC when you have the key directly.
 *
 * @aiExample
 * ```typescript
 * const auth = new GoogleServiceAccountAuth({
 *   serviceAccountJson: JSON.parse(fs.readFileSync('key.json', 'utf-8')),
 *   scopes: ['https://www.googleapis.com/auth/cloud-platform']
 * });
 *
 * await auth.initialize();
 * const headers = await auth.getHeaders();
 * ```
 */

import { IAuthProvider, IAuthHandler, AuthenticationError } from './IAuthProvider';

export interface ServiceAccountJson {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
}

export interface GoogleServiceAccountConfig {
    /** Service account JSON key */
    serviceAccountJson: ServiceAccountJson;
    /** OAuth scopes */
    scopes: string[];
}

export class GoogleServiceAccountAuth implements IAuthProvider {
    private accessToken?: string;
    private expiresAt?: number;
    private authHandler?: IAuthHandler;

    constructor(private config: GoogleServiceAccountConfig) {
        if (config.serviceAccountJson.type !== 'service_account') {
            throw new AuthenticationError(
                'Invalid service account JSON'
            );
        }
    }

    setAuthHandler(handler: IAuthHandler): void {
        this.authHandler = handler;
    }

    async initialize(): Promise<void> {
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

    private async fetchToken(): Promise<void> {
        try {
            const now = Math.floor(Date.now() / 1000);
            const claim = {
                iss: this.config.serviceAccountJson.client_email,
                scope: this.config.scopes.join(' '),
                aud: this.config.serviceAccountJson.token_uri,
                exp: now + 3600,
                iat: now
            };

            // Create JWT assertion
            const jwt = await this.createJwt(claim, this.config.serviceAccountJson.private_key);

            // Exchange JWT for access token
            const body = new URLSearchParams({
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion': jwt
            });

            const response = await fetch(this.config.serviceAccountJson.token_uri, {
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
                    provider: 'google_service_account',
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
