/**
 * Known Providers - Registry of well-known provider IDs
 *
 * @aiInstructions
 * This is a convenience list of known providers. The library supports ANY provider
 * string - this is just for documentation and autocomplete.
 *
 * Users can use any string as a provider ID without modifying core files.
 */

/**
 * Well-known provider IDs (not exhaustive - any string is valid)
 */
export const KnownProviders = {
    // Cloud APIs
    ANTHROPIC: 'anthropic',
    OPENAI: 'openai',
    GEMINI: 'gemini',
    BEDROCK: 'bedrock',
    AZURE: 'azure',
    DEEPSEEK: 'deepseek',
    REPLICATE: 'replicate',
    HUGGINGFACE: 'huggingface',

    // OpenAI-compatible
    GROQ: 'groq',
    TOGETHER: 'together',
    PERPLEXITY: 'perplexity',
    ANYSCALE: 'anyscale',

    // Local/self-hosted
    OLLAMA: 'ollama',
    LM_STUDIO: 'lm-studio',
    VLLM: 'vllm',
    TEXT_GEN_WEBUI: 'text-generation-webui',
    LOCALAI: 'localai',

    // Generic fallback
    OPENAI_COMPATIBLE: 'openai-compatible',
    CUSTOM: 'custom'
} as const;

/**
 * Type helper for known provider IDs
 */
export type KnownProviderId = typeof KnownProviders[keyof typeof KnownProviders];

/**
 * Provider protocol/compatibility info
 */
export const ProviderProtocols: Record<string, string> = {
    [KnownProviders.ANTHROPIC]: 'anthropic',
    [KnownProviders.OPENAI]: 'openai',
    [KnownProviders.GEMINI]: 'gemini',
    [KnownProviders.BEDROCK]: 'bedrock',

    // OpenAI-compatible providers
    [KnownProviders.DEEPSEEK]: 'openai',
    [KnownProviders.GROQ]: 'openai',
    [KnownProviders.TOGETHER]: 'openai',
    [KnownProviders.PERPLEXITY]: 'openai',
    [KnownProviders.ANYSCALE]: 'openai',
    [KnownProviders.OLLAMA]: 'openai',
    [KnownProviders.LM_STUDIO]: 'openai',
    [KnownProviders.VLLM]: 'openai',
    [KnownProviders.TEXT_GEN_WEBUI]: 'openai',
    [KnownProviders.LOCALAI]: 'openai',
    [KnownProviders.OPENAI_COMPATIBLE]: 'openai',
};

/**
 * Get protocol for a provider (defaults to provider name if unknown)
 */
export function getProviderProtocol(providerId: string): string {
    return ProviderProtocols[providerId] || providerId;
}

/**
 * Check if provider uses OpenAI protocol
 */
export function isOpenAICompatible(providerId: string): boolean {
    return getProviderProtocol(providerId) === 'openai';
}
