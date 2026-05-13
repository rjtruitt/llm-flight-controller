/**
 * OpenAI Provider - Wraps official OpenAI SDK
 *
 * @aiInstructions
 * This provider wraps the official `openai` npm package and works with:
 * - OpenAI (GPT-4, GPT-4o, o1, o3)
 * - DeepSeek (same protocol, different base URL)
 * - Groq (same protocol, different base URL)
 * - Together AI (same protocol, different base URL)
 * - Perplexity (same protocol, different base URL)
 * - Ollama (same protocol, local)
 * - LM Studio (same protocol, local)
 * - Any OpenAI-compatible endpoint
 */

import OpenAI from 'openai';
import { Model, ModelConfig } from '../../core/model/Model';
import { ModelResponse } from '../../core/types/Response';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIOpenAITranslator } from './OpenAIOpenAITranslator';

export interface OpenAIProviderConfig extends Omit<ModelConfig, 'auth'> {
    /** Base URL for OpenAI-compatible endpoint (optional) */
    baseURL?: string;
    /** API key */
    apiKey: string;
    /** Model ID (e.g., 'gpt-4-turbo', 'deepseek-chat', 'llama3:8b') */
    modelId: string;
}

/**
 * OpenAI Provider
 * Wraps the official OpenAI SDK for any OpenAI-compatible API
 */
export class OpenAIProvider extends Model {
    private client: OpenAI;
    private translator: OpenAIOpenAITranslator;
    private modelId: string;

    constructor(config: OpenAIProviderConfig) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => {},
                getAuthHeaders: async () => ({ 'Authorization': `Bearer ${config.apiKey}` })
            } as any,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });

        this.translator = new OpenAIOpenAITranslator();
        this.modelId = config.modelId;
    }

    /**
     * Send request to OpenAI-compatible API
     */
    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        // Translate OpenAI → OpenAI format
        const openaiRequest = this.translator.fromOpenAI(context);
        openaiRequest.model = this.modelId;

        try {
            // Call OpenAI SDK
            const response = await this.client.chat.completions.create(openaiRequest as any);

            // Extract headers for quota tracking
            const headers = (response as any)._request?.headers || {};

            // Translate OpenAI → OpenAI format
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
            // Parse OpenAI error
            if (error.status === 429) {
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
        // Simplified estimation - real implementation would use tiktoken
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 1000;

        return { input: inputTokens, output: outputTokens };
    }
}

/**
 * Factory helpers for common OpenAI-compatible providers
 */
export class OpenAIProviders {
    /**
     * Create OpenAI provider
     */
    static createOpenAI(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider(config);
    }

    /**
     * Create DeepSeek provider (uses OpenAI protocol)
     */
    static createDeepSeek(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.deepseek.com/v1'
        });
    }

    /**
     * Create Groq provider (uses OpenAI protocol)
     */
    static createGroq(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.groq.com/openai/v1'
        });
    }

    /**
     * Create Together AI provider (uses OpenAI protocol)
     */
    static createTogether(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.together.xyz/v1'
        });
    }

    /**
     * Create Perplexity provider (uses OpenAI protocol)
     */
    static createPerplexity(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.perplexity.ai'
        });
    }

    /**
     * Create Ollama provider (local, uses OpenAI protocol)
     */
    static createOllama(config: Omit<OpenAIProviderConfig, 'baseURL' | 'apiKey'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            apiKey: 'none', // Ollama doesn't require API key
            baseURL: 'http://localhost:11434/v1'
        });
    }

    /**
     * Create LM Studio provider (local, uses OpenAI protocol)
     */
    static createLMStudio(config: Omit<OpenAIProviderConfig, 'baseURL' | 'apiKey'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            apiKey: 'none', // LM Studio doesn't require API key
            baseURL: 'http://localhost:1234/v1'
        });
    }

    /**
     * Create custom OpenAI-compatible provider
     */
    static createCustom(config: OpenAIProviderConfig): OpenAIProvider {
        return new OpenAIProvider(config);
    }
}
