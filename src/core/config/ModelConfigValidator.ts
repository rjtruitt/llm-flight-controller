/**
 * Model Configuration Validation
 *
 * Validates model configuration structure and required fields
 */

import { AuthConfig, SingleModelConfig, ModelsConfigFile } from './ModelConfigTypes';

/**
 * Validate entire configuration file
 */
export function validateConfig(config: ModelsConfigFile): void {
    if (!config.models || typeof config.models !== 'object') {
        throw new Error('Invalid config: models object required');
    }

    for (const [name, model] of Object.entries(config.models)) {
        validateModelConfig(name, model);
    }
}

/**
 * Validate single model configuration
 */
export function validateModelConfig(name: string, config: SingleModelConfig): void {
    if (!config.provider) {
        throw new Error(`Model ${name}: provider required`);
    }

    if (!config.modelId) {
        throw new Error(`Model ${name}: modelId required`);
    }

    if (!config.auth || !config.auth.type) {
        throw new Error(`Model ${name}: auth configuration required`);
    }

    // Validate auth config
    validateAuthConfig(name, config.auth);
}

/**
 * Validate authentication configuration
 */
export function validateAuthConfig(modelName: string, auth: AuthConfig): void {
    switch (auth.type) {
        case 'api_key':
            if (!auth.apiKey) {
                throw new Error(`Model ${modelName}: apiKey required for api_key auth`);
            }
            break;

        case 'aws_profile':
            if (!auth.region) {
                throw new Error(`Model ${modelName}: region required for aws_profile auth`);
            }
            break;

        case 'aws_credentials':
            if (!auth.region || !auth.accessKeyId || !auth.secretAccessKey) {
                throw new Error(`Model ${modelName}: region, accessKeyId, secretAccessKey required for aws_credentials auth`);
            }
            break;

        case 'azure_managed_identity':
            if (!auth.resource) {
                throw new Error(`Model ${modelName}: resource required for azure_managed_identity auth`);
            }
            break;

        case 'azure_service_principal':
            if (!auth.tenantId || !auth.clientId || !auth.clientSecret || !auth.scope) {
                throw new Error(`Model ${modelName}: tenantId, clientId, clientSecret, scope required for azure_service_principal auth`);
            }
            break;

        case 'google_adc':
            if (!auth.scopes || auth.scopes.length === 0) {
                throw new Error(`Model ${modelName}: scopes required for google_adc auth`);
            }
            break;

        case 'google_service_account':
            if (!auth.serviceAccountJson || !auth.scopes) {
                throw new Error(`Model ${modelName}: serviceAccountJson and scopes required for google_service_account auth`);
            }
            break;

        case 'browser_oauth':
            if (!auth.authUrl || !auth.tokenUrl || !auth.clientId || !auth.scopes) {
                throw new Error(`Model ${modelName}: authUrl, tokenUrl, clientId, scopes required for browser_oauth auth`);
            }
            break;
    }
}
