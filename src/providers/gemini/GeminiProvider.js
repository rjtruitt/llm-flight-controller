"use strict";
/**
 * Gemini Provider - Wraps official Google Generative AI SDK
 *
 * @aiInstructions
 * This provider wraps the official `@google/generative-ai` npm package.
 * Supports Gemini models with multi-modal capabilities (text, images, video, audio).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const generative_ai_1 = require("@google/generative-ai");
const Model_1 = require("../../core/model/Model");
const GeminiOpenAITranslator_1 = require("./GeminiOpenAITranslator");
/**
 * Gemini Provider
 * Wraps the official Google Generative AI SDK
 */
class GeminiProvider extends Model_1.Model {
    constructor(config) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => { },
                getAuthHeaders: async () => ({ 'x-goog-api-key': config.apiKey })
            },
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });
        this.client = new generative_ai_1.GoogleGenerativeAI(config.apiKey);
        this.translator = new GeminiOpenAITranslator_1.GeminiOpenAITranslator();
        this.modelId = config.modelId;
    }
    /**
     * Send request to Gemini API
     */
    async sendRequest(context) {
        // Translate OpenAI → Gemini format
        const geminiRequest = this.translator.fromOpenAI(context);
        try {
            // Get model
            const model = this.client.getGenerativeModel({ model: this.modelId });
            // Prepare request
            const request = {
                contents: geminiRequest.contents,
                generationConfig: geminiRequest.generationConfig
            };
            if (geminiRequest.systemInstruction) {
                request.systemInstruction = geminiRequest.systemInstruction;
            }
            if (geminiRequest.tools) {
                request.tools = geminiRequest.tools;
            }
            // Call Gemini SDK
            const result = await model.generateContent(request);
            const response = result.response;
            // Convert to our expected format
            const geminiResponse = {
                candidates: [
                    {
                        content: {
                            parts: response.candidates?.[0]?.content?.parts || [],
                            role: 'model'
                        },
                        finishReason: response.candidates?.[0]?.finishReason || 'STOP',
                        index: 0,
                        safetyRatings: response.candidates?.[0]?.safetyRatings
                    }
                ],
                usageMetadata: response.usageMetadata
                    ? {
                        promptTokenCount: response.usageMetadata.promptTokenCount || 0,
                        candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
                        totalTokenCount: response.usageMetadata.totalTokenCount || 0
                    }
                    : undefined,
                modelVersion: this.modelId
            };
            // Translate Gemini → OpenAI format
            const rosettaResponse = this.translator.responseToOpenAI(geminiResponse);
            return rosettaResponse;
        }
        catch (error) {
            // Parse Gemini error
            const errorMessage = error.message?.toLowerCase() || '';
            if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
                if (errorMessage.includes('daily') || errorMessage.includes('session')) {
                    throw new Error('Session limit exceeded');
                }
                throw new Error('Rate limit exceeded');
            }
            if (errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
                throw new Error('Authentication failed: Invalid API key');
            }
            throw error;
        }
    }
    /**
     * Estimate tokens for context (simplified)
     */
    estimateTokens(context) {
        // Simplified estimation - real implementation would use Gemini's token counter
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');
        // Gemini uses ~4 chars per token on average
        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 2048;
        return { input: inputTokens, output: outputTokens };
    }
}
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=GeminiProvider.js.map