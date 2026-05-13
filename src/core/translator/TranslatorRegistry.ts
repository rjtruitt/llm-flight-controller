/**
 * Translator Registry - Manages OpenAI translators for all providers
 *
 * @aiInstructions
 * TranslatorRegistry composes translations between providers via OpenAI format.
 * Given provider A and provider B, it:
 * 1. Gets translator for A → toOpenAI()
 * 2. Gets translator for B → fromOpenAI()
 * 3. Applies capability adapters if needed
 *
 * @aiExample
 * ```typescript
 * const registry = new TranslatorRegistry();
 * registry.register('anthropic', new AnthropicOpenAITranslator());
 * registry.register('gemini', new GeminiOpenAITranslator());
 *
 * // Translate Anthropic → Gemini
 * const geminiFormat = registry.translate(anthropicMessages, 'anthropic', 'gemini', geminiCapabilities);
 * ```
 */

import { IOpenAITranslator, IContentAdapter, BaseContentAdapter } from './IOpenAITranslator';
import { OpenAIContext } from '../types/Context';
import { ModelCapabilities } from '../types/Capabilities';

/**
 * Translator Registry - Manages format translations via OpenAI Stone
 */
export class TranslatorRegistry {
    private translators: Map<string, IOpenAITranslator> = new Map();
    private adapters: Map<string, IContentAdapter> = new Map();
    private defaultAdapter: IContentAdapter;

    constructor() {
        this.defaultAdapter = new BaseContentAdapter();
    }

    /**
     * Register translator for a provider
     */
    register(providerId: string, translator: IOpenAITranslator): void {
        this.translators.set(providerId, translator);
    }

    /**
     * Register custom content adapter for a provider
     */
    registerAdapter(providerId: string, adapter: IContentAdapter): void {
        this.adapters.set(providerId, adapter);
    }

    /**
     * Get translator for provider
     */
    get(providerId: string): IOpenAITranslator | undefined {
        return this.translators.get(providerId);
    }

    /**
     * Check if translator exists
     */
    has(providerId: string): boolean {
        return this.translators.has(providerId);
    }

    /**
     * Translate from one provider format to another via OpenAI
     */
    translate<TSource = any, TTarget = any>(
        sourceFormat: TSource,
        sourceProviderId: string,
        targetProviderId: string,
        targetCapabilities?: ModelCapabilities
    ): TTarget {
        // Get translators
        const sourceTranslator = this.translators.get(sourceProviderId);
        const targetTranslator = this.translators.get(targetProviderId);

        if (!sourceTranslator) {
            throw new Error(`No translator registered for source provider: ${sourceProviderId}`);
        }

        if (!targetTranslator) {
            throw new Error(`No translator registered for target provider: ${targetProviderId}`);
        }

        // Convert to OpenAI
        const rosettaContext = sourceTranslator.toOpenAI(sourceFormat);

        // Apply capability adapters if needed
        if (targetCapabilities) {
            const adapter = this.adapters.get(targetProviderId) || this.defaultAdapter;
            const capabilitySet = this.getCapabilitySet(targetCapabilities);

            rosettaContext.messages = rosettaContext.messages.map(msg => ({
                ...msg,
                content: adapter.adaptContent(msg.content, capabilitySet)
            }));
        }

        // Convert from OpenAI to target format
        return targetTranslator.fromOpenAI(rosettaContext) as TTarget;
    }

    /**
     * Convert provider format to OpenAI
     */
    toOpenAI<T = any>(providerFormat: T, providerId: string): OpenAIContext {
        const translator = this.translators.get(providerId);

        if (!translator) {
            throw new Error(`No translator registered for provider: ${providerId}`);
        }

        return translator.toOpenAI(providerFormat);
    }

    /**
     * Convert OpenAI to provider format
     */
    fromOpenAI<T = any>(
        rosettaContext: OpenAIContext,
        providerId: string,
        targetCapabilities?: ModelCapabilities
    ): T {
        const translator = this.translators.get(providerId);

        if (!translator) {
            throw new Error(`No translator registered for provider: ${providerId}`);
        }

        // Apply capability adapters if needed
        let adapted = rosettaContext;
        if (targetCapabilities) {
            const adapter = this.adapters.get(providerId) || this.defaultAdapter;
            const capabilitySet = this.getCapabilitySet(targetCapabilities);

            adapted = {
                ...rosettaContext,
                messages: rosettaContext.messages.map(msg => ({
                    ...msg,
                    content: adapter.adaptContent(msg.content, capabilitySet)
                }))
            };
        }

        return translator.fromOpenAI(adapted) as T;
    }

    /**
     * Get registered provider IDs
     */
    getProviderIds(): string[] {
        return Array.from(this.translators.keys());
    }

    /**
     * Extract capability set for adapter
     */
    private getCapabilitySet(capabilities: ModelCapabilities): Set<string> {
        const capSet = new Set<string>();

        // Map capabilities to adapter-friendly strings
        if (capabilities.features.supportsVision) capSet.add('vision');
        if (capabilities.features.supportsAudio) capSet.add('audio');
        if (capabilities.features.supportsFunctions) capSet.add('native_tools');
        if (capabilities.toolHandling.mode === 'native') capSet.add('native_tools');

        // Provider-specific features
        for (const cap of capabilities.capabilities) {
            capSet.add(cap.toLowerCase().replace(/_/g, '-'));
        }

        return capSet;
    }
}

/**
 * Global translator registry instance
 */
export const translatorRegistry = new TranslatorRegistry();
