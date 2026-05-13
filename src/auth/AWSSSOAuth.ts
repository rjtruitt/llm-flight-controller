/**
 * AWS SSO Authentication with Device Authorization Flow
 *
 * @aiInstruction
 * Implements proper OAuth 2.0 Device Authorization Grant flow for AWS SSO.
 * Does NOT shell out to AWS CLI - uses AWS SDK OIDC client directly.
 * Uses official AWS SDK utilities for config loading and token caching.
 *
 * Flow:
 * 1. Load SSO config from ~/.aws/config
 * 2. Call StartDeviceAuthorization to get device code + verification URL
 * 3. Application shows URL/code to user
 * 4. Poll CreateToken until user completes auth
 * 5. Cache token for reuse
 *
 * @aiExample
 * import { AWSSSOAuth } from './AWSSSOAuth';
 * const auth = new AWSSSOAuth({ profile: 'my-profile', region: 'us-east-1' });
 * auth.setAuthHandler({
 *   async handleDeviceCodeAuth({ verificationUrl, userCode }) {
 *     console.log(`Visit: ${verificationUrl}`);
 *     console.log(`Code: ${userCode}`);
 *   }
 * });
 * await auth.initialize();
 * const creds = await auth.getCredentials();
 */

import { SSOOIDCClient, StartDeviceAuthorizationCommand, CreateTokenCommand } from '@aws-sdk/client-sso-oidc';
import { IAuthProvider, IAuthHandler } from './IAuthProvider';
import { AuthenticationError } from '../core/errors/LLMError';
import { loadSSOSessionConfig, SSOSessionConfig } from './AWSSSOConfigLoader';
import { loadCachedToken, saveCachedToken, getOrRegisterClient, SSOToken } from './AWSSSOTokenCache';

export interface AWSSSOConfig {
    /** AWS profile name */
    profile: string;
    /** AWS region for the service (not SSO region) */
    region: string;
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

        const expiresAt = new Date(this.token.expiresAt);
        return expiresAt.getTime() > Date.now();
    }

    async initialize(): Promise<void> {
        // Load SSO session config from ~/.aws/config
        this.ssoSessionConfig = await loadSSOSessionConfig(this.config.profile);

        // Try to load cached token
        try {
            this.token = await loadCachedToken(this.ssoSessionConfig.sessionName);
            if (this.isAuthenticated()) {
                return;
            }
        } catch {
            // No cached token or invalid
        }

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
            const clientCreds = await getOrRegisterClient(
                client,
                this.ssoSessionConfig!.sso_start_url,
                this.ssoSessionConfig!.sso_registration_scopes || 'sso:account:access'
            );

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

                    await saveCachedToken(this.ssoSessionConfig!.sessionName, this.token);
                    return;

                } catch (error: any) {
                    if (error.name === 'AuthorizationPendingException') {
                        continue;
                    }
                    if (error.name === 'SlowDownException') {
                        await new Promise(resolve => setTimeout(resolve, interval));
                        continue;
                    }
                    throw error;
                }
            }

            throw new AuthenticationError('Device authorization timed out. User did not complete authentication.');

        } catch (error) {
            throw new AuthenticationError(
                `SSO authentication failed: ${(error as Error).message}`,
                {},
                error as Error
            );
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (!this.isAuthenticated()) {
            throw new AuthenticationError('Not authenticated');
        }
        return {};
    }

    /**
     * Get AWS credentials (for use with AWS SDK)
     */
    async getCredentials() {
        if (!this.isAuthenticated()) {
            throw new AuthenticationError('Not authenticated');
        }
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

        if (errorName.includes('expiredtoken') ||
            errorMessage.includes('expiredtoken') ||
            errorMessage.includes('token has expired') ||
            errorMessage.includes('token is expired')) {
            this.token = undefined;
            return true;
        }

        if (errorName.includes('unauthorizedexception') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('access denied') ||
            errorMessage.includes('invalid credentials')) {
            this.token = undefined;
            return true;
        }

        return false;
    }
}
