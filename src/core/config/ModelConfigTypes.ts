/**
 * Model Configuration Types
 *
 * Type definitions for model configuration structure
 */

import { ModelCapability } from '../types/Capabilities';

export interface AuthConfig {
    type: 'api_key' | 'aws_profile' | 'aws_credentials' | 'azure_managed_identity' | 'azure_service_principal' | 'google_adc' | 'google_service_account' | 'browser_oauth';

    // API Key
    apiKey?: string;
    headerName?: string;
    headerPrefix?: string;

    // AWS
    profile?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;

    // Azure
    resource?: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    scope?: string;

    // Google
    scopes?: string[];
    credentialsPath?: string;
    serviceAccountJson?: any;

    // OAuth
    authUrl?: string;
    tokenUrl?: string;
    redirectUri?: string;
}

export interface LimitsConfig {
    // Rate limits
    tpm?: number;
    rpm?: number;
    tph?: number;
    rph?: number;
    warningThreshold?: number;

    // Session limits
    messagesPerDay?: number;
    sessionsPerDay?: number;
    tokensPerDay?: number;
    tokensPerMonth?: number;

    // Token limits
    contextWindow?: number;
    maxOutputTokens?: number;
    safetyMargin?: number;
}

export interface PricingConfig {
    inputTokens: number;
    outputTokens: number;
    cacheRead?: number;
    cacheWrite?: number;
    perRequest?: number;
    perImage?: number;
}

export interface BudgetConfig {
    daily?: number;
    monthly?: number;
    perRequest?: number;
}

export interface SingleModelConfig {
    /** Provider identifier (e.g., 'anthropic', 'openai', 'ollama', or custom) */
    provider: string;
    modelId: string;
    displayName?: string;
    family?: string;
    version?: string;
    aliases?: string[];

    auth: AuthConfig;

    capabilities?: {
        features?: ModelCapability[];
        maxImageSize?: number;
        maxAudioDuration?: number;
        supportedImageFormats?: string[];
        toolHandling?: 'native' | 'context' | 'none';
    };

    limits?: LimitsConfig;
    pricing?: PricingConfig;
    budget?: BudgetConfig;
    enableStats?: boolean;
}

export interface ModelsConfigFile {
    models: {
        [name: string]: SingleModelConfig;
    };
    defaults?: {
        auth?: Partial<AuthConfig>;
        limits?: Partial<LimitsConfig>;
        enableStats?: boolean;
    };
}
