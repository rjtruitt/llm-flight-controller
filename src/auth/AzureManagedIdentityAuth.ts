/**
 * Azure Managed Identity Authentication
 *
 * @aiInstructions
 * Uses Azure Managed Identity for authentication. Works on Azure VMs, App Services,
 * Functions, and other Azure resources with managed identity enabled.
 *
 * @aiExample
 * ```typescript
 * const auth = new AzureManagedIdentityAuth({
 *   resource: 'https://cognitiveservices.azure.com',
 *   clientId: 'optional-client-id' // For user-assigned identity
 * });
 *
 * await auth.initialize();
 * const headers = await auth.getHeaders();
 * ```
 */

import { IAuthProvider, IAuthHandler, AuthenticationError } from './IAuthProvider';

export interface AzureManagedIdentityConfig {
    /** Azure resource to authenticate against */
    resource: string;
    /** Client ID for user-assigned managed identity (optional) */
    clientId?: string;
    /** Azure Instance Metadata Service endpoint */
    imdsEndpoint?: string;
}

export class AzureManagedIdentityAuth implements IAuthProvider {
    private accessToken?: string;
    private expiresAt?: number;
    private authHandler?: IAuthHandler;
    private readonly imdsEndpoint: string;

    constructor(private config: AzureManagedIdentityConfig) {
        this.imdsEndpoint = config.imdsEndpoint || 'http://169.254.169.254/metadata/identity/oauth2/token';
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
            const params = new URLSearchParams({
                'api-version': '2018-02-01',
                'resource': this.config.resource
            });

            if (this.config.clientId) {
                params.append('client_id', this.config.clientId);
            }

            const response = await fetch(`${this.imdsEndpoint}?${params.toString()}`, {
                headers: {
                    'Metadata': 'true'
                }
            });

            if (!response.ok) {
                throw new AuthenticationError(
                    `Azure IMDS request failed: ${response.statusText}`
                );
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
            // expires_on is Unix timestamp in seconds
            this.expiresAt = parseInt(data.expires_on) * 1000;

        } catch (error) {
            if (this.authHandler) {
                this.authHandler.onAuthenticationFailed({
                    provider: 'azure_managed_identity',
                    reason: error instanceof Error ? error.message : 'Failed to fetch token',
                    canRetry: true
                });
            }
            throw error;
        }
    }
}
