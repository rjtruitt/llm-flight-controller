/**
 * Model Configuration Loader
 *
 * Loads model configurations from files or objects
 */

import { readFile } from 'fs/promises';
import { ModelsConfigFile, SingleModelConfig } from './ModelConfigTypes';
import { validateConfig } from './ModelConfigValidator';

/**
 * Load configuration from JSON file
 */
export async function loadConfigFromFile(filePath: string): Promise<ModelsConfigFile> {
    const content = await readFile(filePath, 'utf-8');
    const config = JSON.parse(content);
    validateConfig(config);
    return config;
}

/**
 * Load configuration from object
 */
export function loadConfigFromObject(config: ModelsConfigFile): ModelsConfigFile {
    validateConfig(config);
    return config;
}

/**
 * Merge model configuration with defaults
 */
export function mergeWithDefaults(
    config: SingleModelConfig,
    defaults?: ModelsConfigFile['defaults']
): SingleModelConfig {
    if (!defaults) {
        return config;
    }

    return {
        ...config,
        auth: {
            ...defaults.auth,
            ...config.auth
        },
        limits: {
            ...defaults.limits,
            ...config.limits
        },
        enableStats: config.enableStats ?? defaults.enableStats
    };
}
