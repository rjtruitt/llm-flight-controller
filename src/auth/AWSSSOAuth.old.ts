/**
 * AWS SSO Authentication with Device Authorization Flow
 *
 * @aiInstructions
 * Implements proper OAuth 2.0 Device Authorization Grant flow for AWS SSO.
 * Does NOT shell out to AWS CLI - uses AWS SDK OIDC client directly.
 *
 * Flow:
 * 1. Load SSO config from ~/.aws/config
 * 2. Call StartDeviceAuthorization to get device code + verification URL
 * 3. Application shows URL/code to user
 * 4. Poll CreateToken until user completes auth
 * 5. Cache token for reuse
 */

import { SSOOIDCClient, StartDeviceAuthorizationCommand, CreateTokenCommand } from '@aws-sdk/client-sso-oidc';
import { getSSOTokenFilepath, getSSOTokenFromFile } from '@smithy/shared-ini-file-loader';
import { IAuthProvider, IAuthHandler } from './IAuthProvider';
import { AuthenticationError } from '../core/types/Errors';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface AWSSSOConfig {
    /** AWS profile name */
    profile: string;
    /** AWS region for the service (not SSO region) */
    region: string;
}

interface SSOSessionConfig {
    sso_start_url: string;
    sso_region: string;
    sso_registration_scopes?: string;
}

interface SSOToken {
    accessToken: string;
    expiresAt: string;
    refreshToken?: string;
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

/**
 * AWS SSO Authentication Provider
 * Implements OAuth 2.0 Device Authorization Grant flow
 */
export class AWSSSOAuth implements IAuthProvider {
    private config: AWSSSOConfig;
    private authHandler?: IAuthHandler;
    private token?: SSOToken;
    private ssoSessionConfig?: SSOSessionConfig;
    private sessionName?: string;

    constructor(config: AWSSSOConfig) {
        this.config = config;
        console.log(`[AWSSSOAuth] Initialized with profile: ${config.profile}, region: ${config.region}`);
    }

    setAuthHandler(handler: IAuthHandler): void {
        this.authHandler = handler;
    }

    isAuthenticated(): boolean {
        if (!this.token) {
            return false;
        }

        // Check if token is expired
        const expiresAt = new Date(this.token.expiresAt);
        return expiresAt.getTime() > Date.now();
    }

    async initialize(): Promise<void> {
        // Load SSO session config from ~/.aws/config
        this.ssoSessionConfig = await this.loadSSOSessionConfig();

        // Try to load cached token
        try {
            this.token = await this.loadCachedToken();
            if (this.isAuthenticated()) {
                return; // Token still valid
            }
        } catch {
            // No cached token or invalid
        }

        // Need to authenticate
        throw new AuthenticationError('AWS SSO token not found or expired. Authentication required.');
    }

    async refresh(): Promise<void> {
        if (!this.ssoSessionConfig) {
            await this.initialize();
        }

        if (!this.authHandler) {
            throw new AuthenticationError('No auth handler set. Cannot perform interactive authentication.');
        }

        const client = new SSOOIDCClient({ region: this.ssoSessionConfig!.sso_region });

        try {
            // Step 1: Register client (or load cached client registration)
            const clientCreds = await this.getOrRegisterClient(client);

            // Step 2: Start device authorization
            const deviceAuth = await client.send(new StartDeviceAuthorizationCommand({
                clientId: clientCreds.clientId,
                clientSecret: clientCreds.clientSecret,
                startUrl: this.ssoSessionConfig!.sso_start_url
            }));

            // Step 3: Show device code to user via handler
            await this.authHandler.handleDeviceCodeAuth({
                verificationUrl: deviceAuth.verificationUri!,
                userCode: deviceAuth.userCode!,
                verificationUrlComplete: deviceAuth.verificationUriComplete,
                expiresIn: deviceAuth.expiresIn!,
                interval: deviceAuth.interval || 5
            });

            // Step 4: Poll for token
            const expiresAt = Date.now() + (deviceAuth.expiresIn! * 1000);
            const interval = (deviceAuth.interval || 5) * 1000;

            while (Date.now() < expiresAt) {
                await new Promise(resolve => setTimeout(resolve, interval));

                try {
                    const tokenResponse = await client.send(new CreateTokenCommand({
                        clientId: clientCreds.clientId,
                        clientSecret: clientCreds.clientSecret,
                        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
                        deviceCode: deviceAuth.deviceCode!
                    }));

                    // Success! Save token
                    this.token = {
                        accessToken: tokenResponse.accessToken!,
                        expiresAt: new Date(Date.now() + (tokenResponse.expiresIn! * 1000)).toISOString(),
                        refreshToken: tokenResponse.refreshToken,
                        clientId: clientCreds.clientId,
                        clientSecret: clientCreds.clientSecret,
                        registeredAt: clientCreds.registeredAt
                    };

                    await this.saveCachedToken(this.token);
                    return;

                } catch (error: any) {
                    if (error.name === 'AuthorizationPendingException') {
                        // User hasn't completed auth yet, continue polling
                        continue;
                    }
                    if (error.name === 'SlowDownException') {
                        // Polling too fast, wait longer
                        await new Promise(resolve => setTimeout(resolve, interval));
                        continue;
                    }
                    // Other errors are fatal
                    throw error;
                }
            }

            throw new AuthenticationError('Device authorization timed out. User did not complete authentication.');

        } catch (error) {
            throw new AuthenticationError(
                `SSO authentication failed: ${(error as Error).message}`,
                error as Error
            );
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (!this.isAuthenticated()) {
            throw new AuthenticationError('Not authenticated');
        }
        return {}; // AWS SDK uses credential providers, not headers
    }

    /**
     * Get AWS credentials (for use with AWS SDK)
     */
    async getCredentials() {
        if (!this.isAuthenticated()) {
            throw new AuthenticationError('Not authenticated');
        }
        // Return fromSSO credential provider
        const { fromSSO } = await import('@aws-sdk/credential-providers');
        return fromSSO({ profile: this.config.profile });
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
            this.token = undefined; // Clear cached token
            return true;
        }

        // Check for other auth errors
        if (errorName.includes('unauthorizedexception') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('access denied') ||
            errorMessage.includes('invalid credentials')) {
            this.token = undefined;
            return true;
        }

        return false;
    }

    /**
     * Load SSO session config from ~/.aws/config
     */
    private async loadSSOSessionConfig(): Promise<SSOSessionConfig> {
        const configPath = join(homedir(), '.aws', 'config');
        const content = await readFile(configPath, 'utf-8');

        console.log(`[AWSSSOAuth] Loading SSO config for profile: ${this.config.profile}`);

        // Parse profile to find sso_session name
        const profileMatch = content.match(new RegExp(`\\[profile ${this.config.profile}\\]([\\s\\S]*?)(?=\\[|$)`));
        if (!profileMatch) {
            console.error(`[AWSSSOAuth] Profile ${this.config.profile} not found in config`);
            throw new Error(`Profile ${this.config.profile} not found in ~/.aws/config`);
        }

        console.log(`[AWSSSOAuth] Found profile config:`, profileMatch[1]);

        const ssoSessionMatch = profileMatch[1].match(/sso_session\s*=\s*(.+)/);
        if (!ssoSessionMatch) {
            throw new Error(`Profile ${this.config.profile} does not have sso_session configured`);
        }

        const sessionName = ssoSessionMatch[1].trim();
        this.sessionName = sessionName; // Store for cache file naming

        console.log(`[AWSSSOAuth] SSO session name: ${sessionName}`);

        // Find sso-session config
        const sessionMatch = content.match(new RegExp(`\\[sso-session ${sessionName}\\]([\\s\\S]*?)(?=\\[|$)`));
        if (!sessionMatch) {
            throw new Error(`SSO session ${sessionName} not found in ~/.aws/config`);
        }

        const sessionConfig = sessionMatch[1];
        const startUrl = sessionConfig.match(/sso_start_url\s*=\s*(.+)/)?.[1].trim();
        const ssoRegion = sessionConfig.match(/sso_region\s*=\s*(.+)/)?.[1].trim();
        const scopes = sessionConfig.match(/sso_registration_scopes\s*=\s*(.+)/)?.[1].trim();

        if (!startUrl || !ssoRegion) {
            throw new Error(`SSO session ${sessionName} is missing required config (sso_start_url, sso_region)`);
        }

        return {
            sso_start_url: startUrl,
            sso_region: ssoRegion,
            sso_registration_scopes: scopes
        };
    }

    /**
     * Get or register OIDC client
     */
    private async getOrRegisterClient(client: SSOOIDCClient): Promise<{
        clientId: string;
        clientSecret: string;
        registeredAt: string;
    }> {
        // Try to load cached client registration
        const cachePath = this.getClientCachePath();
        try {
            const cached = JSON.parse(await readFile(cachePath, 'utf-8'));
            // Check if still valid (valid for 90 days)
            const registeredAt = new Date(cached.registeredAt);
            if (Date.now() - registeredAt.getTime() < 90 * 24 * 60 * 60 * 1000) {
                return cached;
            }
        } catch {
            // No cached client or invalid
        }

        // Register new client
        const { RegisterClientCommand } = await import('@aws-sdk/client-sso-oidc');
        const registration = await client.send(new RegisterClientCommand({
            clientName: 'llm-flight-controller',
            clientType: 'public',
            scopes: (this.ssoSessionConfig!.sso_registration_scopes || 'sso:account:access').split(',')
        }));

        const clientCreds = {
            clientId: registration.clientId!,
            clientSecret: registration.clientSecret!,
            registeredAt: new Date().toISOString()
        };

        // Cache it
        await this.saveClientCache(clientCreds);

        return clientCreds;
    }

    /**
     * Get cached token path using AWS SDK's official implementation
     */
    private getTokenCachePath(): string {
        const path = getSSOTokenFilepath(this.sessionName!);
        console.log(`[AWSSSOAuth] Token cache path (session: ${this.sessionName}): ${path}`);
        return path;
    }

    /**
     * Get client cache path
     */
    private getClientCachePath(): string {
        const hash = require('crypto')
            .createHash('sha1')
            .update(this.ssoSessionConfig!.sso_start_url + '-client')
            .digest('hex');
        return join(homedir(), '.aws', 'sso', 'cache', `${hash}.json`);
    }

    /**
     * Load cached token using AWS SDK's official implementation
     */
    private async loadCachedToken(): Promise<SSOToken> {
        const token = await getSSOTokenFromFile(this.sessionName!);
        return token as SSOToken;
    }

    /**
     * Save token to cache
     */
    private async saveCachedToken(token: SSOToken): Promise<void> {
        const cachePath = this.getTokenCachePath();
        await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
        await writeFile(cachePath, JSON.stringify(token, null, 2), 'utf-8');
    }

    /**
     * Save client registration to cache
     */
    private async saveClientCache(client: { clientId: string; clientSecret: string; registeredAt: string }): Promise<void> {
        const cachePath = this.getClientCachePath();
        await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
        await writeFile(cachePath, JSON.stringify(client, null, 2), 'utf-8');
    }
}
