/**
 * Browser OAuth Authentication - OAuth flow with browser
 *
 * @aiInstructions
 * Use BrowserOAuthAuth for providers requiring browser-based OAuth (Google, some AWS SSO).
 * Emits events and uses callbacks - never directly opens browsers or shows UI.
 *
 * @aiExample
 * ```typescript
 * const auth = new BrowserOAuthAuth({
 *   authUrl: 'https://accounts.google.com/o/oauth2/auth',
 *   tokenUrl: 'https://oauth2.googleapis.com/token',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-secret',
 *   scopes: ['https://www.googleapis.com/auth/generative-language']
 * });
 *
 * // Set handler for orchestrator
 * auth.setAuthHandler(new MyAuthHandler());
 *
 * // Events emitted when auth needed
 * auth.on('auth_browser_needed', (data) => {
 *   console.log('Open:', data.url);
 * });
 * ```
 */

import { EventEmitter } from 'events';
import { IAuthProvider, IAuthHandler } from './IAuthProvider';
import { AuthenticationError } from '../core/errors/LLMError';

export interface BrowserOAuthAuthConfig {
    /** OAuth authorization URL */
    authUrl: string;
    /** Token exchange URL */
    tokenUrl: string;
    /** Client ID */
    clientId: string;
    /** Client secret (optional) */
    clientSecret?: string;
    /** Redirect URI */
    redirectUri?: string;
    /** OAuth scopes */
    scopes: string[];
}

export class BrowserOAuthAuth extends EventEmitter implements IAuthProvider {
    private authHandler?: IAuthHandler;
    private accessToken?: string;
    private refreshToken?: string;
    private expiresAt?: number;

    constructor(private config: BrowserOAuthAuthConfig) {
        super();
    }

    setAuthHandler(handler: IAuthHandler): void {
        this.authHandler = handler;
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (this.accessToken && Date.now() >= this.expiresAt!) {
            await this.handleTokenExpired();
        }

        if (!this.accessToken) {
            await this.performBrowserAuth();
        }

        return {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };
    }

    private async handleTokenExpired(): Promise<void> {
        this.emit('auth_expired', {
            message: 'Your authentication token has expired',
            expiresIn: 0
        });

        if (this.authHandler) {
            const shouldRefresh = await this.authHandler.handleRefreshPrompt(
                'Your token has expired. Would you like to refresh it now?'
            );

            if (shouldRefresh) {
                await this.refresh();
            } else {
                throw new AuthenticationError('Token expired and refresh declined');
            }
        } else {
            await this.refresh();
        }
    }

    private async performBrowserAuth(): Promise<void> {
        const authUrl = this.buildAuthUrl();

        this.emit('auth_browser_needed', {
            url: authUrl,
            message: 'Please authenticate in your browser'
        });

        if (!this.authHandler) {
            throw new AuthenticationError('Browser auth required but no auth handler set');
        }

        const code = await this.authHandler.handleBrowserAuth(authUrl);

        await this.exchangeCodeForToken(code);

        this.emit('auth_success', {
            message: 'Authentication successful',
            expiresIn: this.expiresAt! - Date.now()
        });
    }

    async refresh(): Promise<void> {
        if (!this.refreshToken) {
            throw new AuthenticationError('No refresh token available');
        }

        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret
            })
        });

        if (!response.ok) {
            throw new AuthenticationError(`Token refresh failed: ${response.statusText}`);
        }

        const data: any = await response.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token ?? this.refreshToken;
        this.expiresAt = Date.now() + (data.expires_in * 1000);

        this.emit('auth_success', { message: 'Token refreshed' });
    }

    private buildAuthUrl(): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri ?? 'http://localhost:3000/callback',
            scope: this.config.scopes.join(' '),
            response_type: 'code',
            access_type: 'offline'
        });

        return `${this.config.authUrl}?${params.toString()}`;
    }

    private async exchangeCodeForToken(code: string): Promise<void> {
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                redirect_uri: this.config.redirectUri ?? 'http://localhost:3000/callback'
            })
        });

        if (!response.ok) {
            throw new AuthenticationError(`Token exchange failed: ${response.statusText}`);
        }

        const data: any = await response.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.expiresAt = Date.now() + (data.expires_in * 1000);
    }

    isAuthenticated(): boolean {
        return !!this.accessToken && Date.now() < this.expiresAt!;
    }
}
