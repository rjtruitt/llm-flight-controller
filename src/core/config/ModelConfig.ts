/**
 * Model Config - Configuration loading and validation
 *
 * @aiInstructions
 * ModelConfig handles loading model configurations from various sources
 * (JSON files, objects, environment variables) and validates them.
 *
 * @aiExample
 * ```typescript
 * const config = await ModelConfig.fromFile('models.json');
 * const claudeConfig = config.getModel('claude-sonnet-4');
 *
 * // Or from object
 * const config = ModelConfig.fromObject({
 *   models: {
 *     'claude-sonnet-4': {
 *       provider: 'anthropic',
 *       modelId: 'claude-sonnet-4-20250514',
 *       auth: { type: 'api_key', apiKey: process.env.ANTHROPIC_API_KEY },
 *       limits: { tpm: 100000, rpm: 50 }
 *     }
 *   }
 * });
 * ```
 */

import { ModelsConfigFile, SingleModelConfig } from './ModelConfigTypes';
import { loadConfigFromFile, loadConfigFromObject, mergeWithDefaults } from './ModelConfigLoader';

// Re-export types for convenience
export * from './ModelConfigTypes';

/**
 * Model configuration manager
 */
export class ModelConfig {
    private config: ModelsConfigFile;

    private constructor(config: ModelsConfigFile) {
        this.config = config;
    }

    /**
     * Load config from JSON file
     */
    static async fromFile(filePath: string): Promise<ModelConfig> {
        const config = await loadConfigFromFile(filePath);
        return new ModelConfig(config);
    }

    /**
     * Load config from object
     */
    static fromObject(config: ModelsConfigFile): ModelConfig {
        const validatedConfig = loadConfigFromObject(config);
        return new ModelConfig(validatedConfig);
    }

    /**
     * Get configuration for a specific model
     */
    getModel(name: string): SingleModelConfig | undefined {
        const modelConfig = this.config.models[name];
        if (!modelConfig) {
            return undefined;
        }

        // Merge with defaults
        return mergeWithDefaults(modelConfig, this.config.defaults);
    }

    /**
     * Get all model names
     */
    getModelNames(): string[] {
        return Object.keys(this.config.models);
    }

    /**
     * Check if model exists
     */
    hasModel(name: string): boolean {
        return name in this.config.models;
    }

    /**
     * Get models by provider
     */
    getModelsByProvider(provider: string): { name: string; config: SingleModelConfig }[] {
        const results: { name: string; config: SingleModelConfig }[] = [];

        for (const [name, config] of Object.entries(this.config.models)) {
            if (config.provider === provider) {
                results.push({
                    name,
                    config: mergeWithDefaults(config, this.config.defaults)
                });
            }
        }

        return results;
    }
}
