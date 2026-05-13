"use strict";
/**
 * Model Identity - Model identification and metadata
 *
 * @aiInstructions
 * ModelIdentity defines who a model is - its ID, display name, provider, version, etc.
 * This allows you to distinguish between the same model from different providers
 * (e.g., "Claude Sonnet 4 via Bedrock" vs "Claude Sonnet 4 via Anthropic Direct").
 *
 * @aiExample
 * ```typescript
 * const identity = new ModelIdentity({
 *   id: 'bedrock:claude-sonnet-4',
 *   displayName: 'Claude Sonnet 4 (Bedrock)',
 *   description: 'Balanced model via AWS Bedrock',
 *   provider: {
 *     id: 'bedrock',
 *     displayName: 'AWS Bedrock',
 *     region: 'us-east-1'
 *   },
 *   family: 'claude',
 *   version: '20250929',
 *   aliases: ['sonnet-4', 'claude-4-sonnet'],
 *   tier: 'pro'
 * });
 *
 * console.log(identity.displayName); // "Claude Sonnet 4 (Bedrock)"
 * console.log(identity.provider.displayName); // "AWS Bedrock"
 * ```
 *
 * @aiWhenToUse
 * Use ModelIdentity when:
 * - Registering models in a registry
 * - Displaying model information to users
 * - Logging and observability
 * - Distinguishing same model across providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelIdentity = void 0;
/**
 * Model Identity - Identifies and describes a model
 */
class ModelIdentity {
    constructor(config) {
        this.id = config.id;
        this.displayName = config.displayName;
        this.description = config.description;
        this.provider = config.provider;
        this.family = config.family;
        this.version = config.version;
        this.aliases = config.aliases ?? [];
        this.tier = config.tier;
    }
    /**
     * Check if this model matches a given ID or alias
     */
    matches(idOrAlias) {
        return this.id === idOrAlias || this.aliases.includes(idOrAlias);
    }
    /**
     * Get full model identifier (provider:id)
     */
    getFullId() {
        return `${this.provider.id}:${this.id}`;
    }
    /**
     * Convert to JSON
     */
    toJSON() {
        return {
            id: this.id,
            displayName: this.displayName,
            description: this.description,
            provider: this.provider,
            family: this.family,
            version: this.version,
            aliases: this.aliases,
            tier: this.tier
        };
    }
    /**
     * Create from JSON
     */
    static fromJSON(json) {
        return new ModelIdentity(json);
    }
}
exports.ModelIdentity = ModelIdentity;
//# sourceMappingURL=ModelIdentity.js.map