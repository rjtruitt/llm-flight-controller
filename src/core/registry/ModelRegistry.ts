/**
 * Model Registry - Register and lookup models
 *
 * @aiInstructions
 * ModelRegistry manages a collection of available models. Use it to:
 * - Register models by name
 * - Lookup models by capability
 * - Find best model for a task
 * - Switch between models easily
 *
 * @aiExample
 * ```typescript
 * const registry = new ModelRegistry();
 *
 * // Register models
 * registry.register('claude-sonnet', claudeModel);
 * registry.register('gpt-4', gpt4Model);
 * registry.register('gemini-pro', geminiModel);
 *
 * // Lookup by name
 * const model = registry.get('claude-sonnet');
 *
 * // Find by capability
 * const visionModels = registry.findByCapability(ModelCapability.IMAGE_INPUT);
 * const cheapestVision = registry.findCheapest(visionModels);
 *
 * // Find by provider
 * const anthropicModels = registry.findByProvider('anthropic');
 * ```
 */

import { Model } from '../model/Model';
import { ModelCapability } from '../types/Capabilities';

/**
 * Model registry for managing multiple models
 */
export class ModelRegistry {
    private models: Map<string, Model> = new Map();

    /**
     * Register a model
     */
    register(name: string, model: Model): void {
        this.models.set(name, model);
    }

    /**
     * Unregister a model
     */
    unregister(name: string): boolean {
        return this.models.delete(name);
    }

    /**
     * Get model by name
     */
    get(name: string): Model | undefined {
        return this.models.get(name);
    }

    /**
     * Check if model is registered
     */
    has(name: string): boolean {
        return this.models.has(name);
    }

    /**
     * Get all registered model names
     */
    getNames(): string[] {
        return Array.from(this.models.keys());
    }

    /**
     * Get all registered models
     */
    getAll(): Model[] {
        return Array.from(this.models.values());
    }

    /**
     * Find models by capability
     */
    findByCapability(capability: ModelCapability): Model[] {
        return this.getAll().filter(model =>
            model.getCapabilities().capabilities.has(capability)
        );
    }

    /**
     * Find models by provider
     */
    findByProvider(providerId: string): Model[] {
        return this.getAll().filter(model =>
            model.getIdentity().provider.id === providerId
        );
    }

    /**
     * Find models by multiple capabilities (must have all)
     */
    findByCapabilities(capabilities: ModelCapability[]): Model[] {
        return this.getAll().filter(model => {
            const modelCaps = model.getCapabilities().capabilities;
            return capabilities.every(cap => modelCaps.has(cap));
        });
    }

    /**
     * Find cheapest model from a list
     * Returns undefined if no models have pricing info
     * TODO: Add getPricing() to Model interface to implement this
     */
    findCheapest(_models?: Model[]): Model | undefined {
        return undefined;
    }

    /**
     * Find fastest model from a list
     * Returns undefined if no models have stats
     */
    findFastest(models?: Model[]): Model | undefined {
        const candidates = models || this.getAll();

        let fastest: Model | undefined;
        let lowestLatency = Infinity;

        for (const model of candidates) {
            const stats = model.getStats();
            if (!stats) continue;

            const avgLatency = stats.getAverageLatency();
            if (avgLatency < lowestLatency) {
                lowestLatency = avgLatency;
                fastest = model;
            }
        }

        return fastest;
    }

    /**
     * Find most reliable model from a list
     * Returns undefined if no models have stats
     */
    findMostReliable(models?: Model[]): Model | undefined {
        const candidates = models || this.getAll();

        let mostReliable: Model | undefined;
        let lowestErrorRate = Infinity;

        for (const model of candidates) {
            const stats = model.getStats();
            if (!stats) continue;

            const errorRate = stats.getErrorRate();
            if (errorRate < lowestErrorRate) {
                lowestErrorRate = errorRate;
                mostReliable = model;
            }
        }

        return mostReliable;
    }

    /**
     * Find best model for requirements
     */
    findBest(requirements: {
        capabilities?: ModelCapability[];
        provider?: string;
        maxCost?: number;
        maxLatency?: number;
        minReliability?: number;
    }): Model | undefined {
        let candidates = this.getAll();

        // Filter by capabilities
        if (requirements.capabilities) {
            candidates = this.findByCapabilities(requirements.capabilities);
        }

        // Filter by provider
        if (requirements.provider) {
            candidates = candidates.filter(m =>
                m.getIdentity().provider.id === requirements.provider
            );
        }

        // Filter by max cost
        // TODO: Add getPricing() to Model interface to access cost data
        // For now, skip cost filtering

        // Filter by max latency
        if (requirements.maxLatency !== undefined) {
            candidates = candidates.filter(m => {
                const stats = m.getStats();
                const avgLatency = stats?.getAverageLatency();
                return avgLatency === undefined || avgLatency <= requirements.maxLatency!;
            });
        }

        // Filter by min reliability
        if (requirements.minReliability !== undefined) {
            candidates = candidates.filter(m => {
                const stats = m.getStats();
                const errorRate = stats?.getErrorRate();
                return errorRate === undefined || (100 - errorRate) >= requirements.minReliability!;
            });
        }

        // Return fastest of remaining
        return this.findFastest(candidates);
    }

    /**
     * Clear all registered models
     */
    clear(): void {
        this.models.clear();
    }

    /**
     * Get registry size
     */
    size(): number {
        return this.models.size;
    }
}
