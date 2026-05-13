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

/**
 * Provider information
 */
export interface ProviderInfo {
    /** Provider ID (e.g., 'bedrock', 'anthropic', 'openai') */
    id: string;
    /** Provider display name (e.g., 'AWS Bedrock', 'Anthropic Direct') */
    displayName: string;
    /** Provider region (if applicable) */
    region?: string;
    /** Provider endpoint (if custom) */
    endpoint?: string;
}

/**
 * Model tier
 */
export type ModelTier = 'free' | 'pro' | 'enterprise';

/**
 * Model identity configuration
 */
export interface ModelIdentityConfig {
    /** Unique model ID (e.g., 'bedrock:claude-sonnet-4') */
    id: string;
    /** Display name for UI (e.g., 'Claude Sonnet 4 (Bedrock)') */
    displayName: string;
    /** Human-readable description */
    description?: string;
    /** Provider information */
    provider: ProviderInfo;
    /** Model family (e.g., 'claude', 'gpt', 'gemini') */
    family?: string;
    /** Model version (e.g., '4.0', '20250929') */
    version?: string;
    /** Alternative names/IDs for this model */
    aliases?: string[];
    /** Pricing tier */
    tier?: ModelTier;
}

/**
 * Model Identity - Identifies and describes a model
 */
export class ModelIdentity {
    /** Unique model ID */
    readonly id: string;

    /** Display name */
    readonly displayName: string;

    /** Description */
    readonly description?: string;

    /** Provider information */
    readonly provider: ProviderInfo;

    /** Model family */
    readonly family?: string;

    /** Model version */
    readonly version?: string;

    /** Aliases */
    readonly aliases: string[];

    /** Pricing tier */
    readonly tier?: ModelTier;

    constructor(config: ModelIdentityConfig) {
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
    matches(idOrAlias: string): boolean {
        return this.id === idOrAlias || this.aliases.includes(idOrAlias);
    }

    /**
     * Get full model identifier (provider:id)
     */
    getFullId(): string {
        return `${this.provider.id}:${this.id}`;
    }

    /**
     * Convert to JSON
     */
    toJSON(): ModelIdentityConfig {
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
    static fromJSON(json: ModelIdentityConfig): ModelIdentity {
        return new ModelIdentity(json);
    }
}
