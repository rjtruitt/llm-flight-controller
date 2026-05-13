/**
 * API Key Authentication - Simple bearer token auth
 *
 * @aiInstructions
 * Use ApiKeyAuth for providers that use simple API keys (Anthropic, OpenAI, DeepSeek, etc.).
 * Most common auth method - just pass key in Authorization header.
 *
 * @aiExample
 * ```typescript
 * const auth = new ApiKeyAuth(process.env.ANTHROPIC_API_KEY!);
 * const provider = new AnthropicProvider(auth);
 *
 * // Or with custom header name
 * const auth = new ApiKeyAuth(process.env.API_KEY!, {
 *   headerName: 'X-API-Key'
 * });
 * ```
 */

import { IAuthProvider } from './IAuthProvider';

export interface ApiKeyAuthConfig {
    /** API key */
    apiKey: string;
    /** Header name (default: 'Authorization') */
    headerName?: string;
    /** Header prefix (default: 'Bearer') */
    headerPrefix?: string;
    /** Additional headers */
    additionalHeaders?: Record<string, string>;
}

/**
 * API Key Authentication
 */
export class ApiKeyAuth implements IAuthProvider {
    private readonly apiKey: string;
    private readonly headerName: string;
    private readonly headerPrefix?: string;
    private readonly additionalHeaders: Record<string, string>;

    constructor(apiKey: string);
    constructor(config: ApiKeyAuthConfig);
    constructor(apiKeyOrConfig: string | ApiKeyAuthConfig) {
        if (typeof apiKeyOrConfig === 'string') {
            this.apiKey = apiKeyOrConfig;
            this.headerName = 'Authorization';
            this.headerPrefix = 'Bearer';
            this.additionalHeaders = {};
        } else {
            this.apiKey = apiKeyOrConfig.apiKey;
            this.headerName = apiKeyOrConfig.headerName ?? 'Authorization';
            this.headerPrefix = apiKeyOrConfig.headerPrefix ?? 'Bearer';
            this.additionalHeaders = apiKeyOrConfig.additionalHeaders ?? {};
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        const authValue = this.headerPrefix
            ? `${this.headerPrefix} ${this.apiKey}`
            : this.apiKey;

        return {
            [this.headerName]: authValue,
            'Content-Type': 'application/json',
            ...this.additionalHeaders
        };
    }

    isAuthenticated(): boolean {
        return !!this.apiKey;
    }
}
