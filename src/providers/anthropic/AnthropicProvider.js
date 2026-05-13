"use strict";
/**
 * Anthropic Provider - Wraps official Anthropic SDK
 *
 * @aiInstructions
 * This provider wraps the official `@anthropic-ai/sdk` npm package.
 * Supports Claude models with features like prompt caching, thinking blocks, etc.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const Model_1 = require("../../core/model/Model");
const AnthropicOpenAITranslator_1 = require("./AnthropicOpenAITranslator");
/**
 * Anthropic Provider
 * Wraps the official Anthropic SDK
 */
class AnthropicProvider extends Model_1.Model {
    constructor(config) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => { },
                getAuthHeaders: async () => ({ 'x-api-key': config.apiKey })
            },
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });
        this.client = new sdk_1.default({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });
        this.translator = new AnthropicOpenAITranslator_1.AnthropicOpenAITranslator();
        this.modelId = config.modelId;
    }
    /**
     * Send request to Anthropic API
     */
    async sendRequest(context) {
        // Translate OpenAI → Anthropic format
        const anthropicRequest = this.translator.fromOpenAI(context);
        anthropicRequest.model = this.modelId;
        try {
            // Call Anthropic SDK
            const response = await this.client.messages.create(anthropicRequest);
            // Extract headers for quota tracking
            const headers = response.response?.headers || {};
            // Translate Anthropic → OpenAI format
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
    estimateTokens(context) {
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
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=AnthropicProvider.js.map