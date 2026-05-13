/**
 * Anthropic Provider - Wraps official Anthropic SDK
 *
 * @aiInstructions
 * This provider wraps the official `@anthropic-ai/sdk` npm package.
 * Supports Claude models with features like prompt caching, thinking blocks, etc.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Model, ModelConfig } from '../../core/model/Model';
import { ModelResponse } from '../../core/types/Response';
import { OpenAIContext } from '../../core/types/Context';
import { AnthropicOpenAITranslator } from './AnthropicOpenAITranslator';

export interface AnthropicProviderConfig extends Omit<ModelConfig, 'auth'> {
    /** API key */
    apiKey: string;
    /** Model ID (e.g., 'claude-sonnet-4-20250514') */
    modelId: string;
    /** Base URL (optional, for custom endpoints) */
    baseURL?: string;
}

/**
 * Anthropic Provider
 * Wraps the official Anthropic SDK
 */
export class AnthropicProvider extends Model {
    private client: Anthropic;
    private translator: AnthropicOpenAITranslator;
    private modelId: string;

    constructor(config: AnthropicProviderConfig) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => {},
                getAuthHeaders: async () => ({ 'x-api-key': config.apiKey })
            } as any,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });

        this.translator = new AnthropicOpenAITranslator();
        this.modelId = config.modelId;
    }

    /**
     * Send request to Anthropic API
     */
    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        // Translate OpenAI → Anthropic format
        const anthropicRequest = this.translator.fromOpenAI(context);
        anthropicRequest.model = this.modelId;

        try {
            // Call Anthropic SDK
            const response = await this.client.messages.create(anthropicRequest as any);

            // Extract headers for quota tracking
            const headers = (response as any).response?.headers || {};

            // Translate Anthropic → OpenAI format
            const rosettaResponse = this.translator.responseToOpenAI(response as any);

            // Attach headers for quota tracking
            if (rosettaResponse.metadata) {
                rosettaResponse.metadata.custom = {
                    ...rosettaResponse.metadata.custom,
                    headers
                };
            }

            return rosettaResponse;
        } catch (error: any) {
            // Parse Anthropic error
            if (error.status === 429) {
                // Check if it's session limit or rate limit
                const errorMessage = error.message?.toLowerCase() || '';
                if (errorMessage.includes('daily') || errorMessage.includes('session')) {
                    throw new Error('Session limit exceeded');
                }
                throw new Error('Rate limit exceeded');
            }
            if (error.status === 401) {
                throw new Error('Authentication failed: Invalid API key');
            }

            throw error;
        }
    }

    /**
     * Estimate tokens for context (simplified)
     */
    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
        // Simplified estimation - real implementation would use Anthropic's token counter
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        // Claude uses ~4 chars per token on average
        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 4096;

        return { input: inputTokens, output: outputTokens };
    }
}
