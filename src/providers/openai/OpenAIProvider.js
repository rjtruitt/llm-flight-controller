"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProviders = exports.OpenAIProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const Model_1 = require("../../core/model/Model");
const OpenAIOpenAITranslator_1 = require("./OpenAIOpenAITranslator");
/**
 * OpenAI Provider
 * Wraps the official OpenAI SDK for any OpenAI-compatible API
 */
class OpenAIProvider extends Model_1.Model {
    constructor(config) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => { },
                getAuthHeaders: async () => ({ 'Authorization': `Bearer ${config.apiKey}` })
            },
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });
        this.client = new openai_1.default({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });
        this.translator = new OpenAIOpenAITranslator_1.OpenAIOpenAITranslator();
        this.modelId = config.modelId;
    }
    /**
     * Send request to OpenAI-compatible API
     */
    async sendRequest(context) {
        // Translate OpenAI → OpenAI format
        const openaiRequest = this.translator.fromOpenAI(context);
        openaiRequest.model = this.modelId;
        try {
            // Call OpenAI SDK
            const response = await this.client.chat.completions.create(openaiRequest);
            // Extract headers for quota tracking
            const headers = response._request?.headers || {};
            // Translate OpenAI → OpenAI format
            const rosettaResponse = this.translator.responseToOpenAI(response);
            // Attach headers for quota tracking
            if (rosettaResponse.metadata) {
                rosettaResponse.metadata.custom = {
                    ...rosettaResponse.metadata.custom,
                    headers
                };
            }
            return rosettaResponse;
        }
        catch (error) {
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
    estimateTokens(context) {
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
exports.OpenAIProvider = OpenAIProvider;
/**
 * Factory helpers for common OpenAI-compatible providers
 */
class OpenAIProviders {
    /**
     * Create OpenAI provider
     */
    static createOpenAI(config) {
        return new OpenAIProvider(config);
    }
    /**
     * Create DeepSeek provider (uses OpenAI protocol)
     */
    static createDeepSeek(config) {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.deepseek.com/v1'
        });
    }
    /**
     * Create Groq provider (uses OpenAI protocol)
     */
    static createGroq(config) {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.groq.com/openai/v1'
        });
    }
    /**
     * Create Together AI provider (uses OpenAI protocol)
     */
    static createTogether(config) {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.together.xyz/v1'
        });
    }
    /**
     * Create Perplexity provider (uses OpenAI protocol)
     */
    static createPerplexity(config) {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.perplexity.ai'
        });
    }
    /**
     * Create Ollama provider (local, uses OpenAI protocol)
     */
    static createOllama(config) {
        return new OpenAIProvider({
            ...config,
            apiKey: 'none', // Ollama doesn't require API key
            baseURL: 'http://localhost:11434/v1'
        });
    }
    /**
     * Create LM Studio provider (local, uses OpenAI protocol)
     */
    static createLMStudio(config) {
        return new OpenAIProvider({
            ...config,
            apiKey: 'none', // LM Studio doesn't require API key
            baseURL: 'http://localhost:1234/v1'
        });
    }
    /**
     * Create custom OpenAI-compatible provider
     */
    static createCustom(config) {
        return new OpenAIProvider(config);
    }
}
exports.OpenAIProviders = OpenAIProviders;
//# sourceMappingURL=OpenAIProvider.js.map