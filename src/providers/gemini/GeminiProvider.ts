/**
 * Gemini Provider - Wraps official Google Generative AI SDK
 *
 * @aiInstructions
 * This provider wraps the official `@google/generative-ai` npm package.
 * Supports Gemini models with multi-modal capabilities (text, images, video, audio).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Model, ModelConfig } from '../../core/model/Model';
import { ModelResponse } from '../../core/types/Response';
import { OpenAIContext } from '../../core/types/Context';
import { GeminiOpenAITranslator } from './GeminiOpenAITranslator';
import { GeminiResponse } from './GeminiTypes';

export interface GeminiProviderConfig extends Omit<ModelConfig, 'auth'> {
    /** API key */
    apiKey: string;
    /** Model ID (e.g., 'gemini-1.5-pro', 'gemini-2.0-flash') */
    modelId: string;
}

/**
 * Gemini Provider
 * Wraps the official Google Generative AI SDK
 */
export class GeminiProvider extends Model {
    private client: GoogleGenerativeAI;
    private translator: GeminiOpenAITranslator;
    private modelId: string;

    constructor(config: GeminiProviderConfig) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => {},
                getAuthHeaders: async () => ({ 'x-goog-api-key': config.apiKey })
            } as any,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.client = new GoogleGenerativeAI(config.apiKey);
        this.translator = new GeminiOpenAITranslator();
        this.modelId = config.modelId;
    }

    /**
     * Send request to Gemini API
     */
    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        // Translate OpenAI → Gemini format
        const geminiRequest = this.translator.fromOpenAI(context);

        try {
            // Get model
            const model = this.client.getGenerativeModel({ model: this.modelId });

            // Prepare request
            const request: any = {
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
            const geminiResponse: GeminiResponse = {
                candidates: [
                    {
                        content: {
                            parts: (response.candidates?.[0]?.content?.parts as any) || [],
                            role: 'model'
                        },
                        finishReason: (response.candidates?.[0]?.finishReason as any) || 'STOP',
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
        } catch (error: any) {
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
    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
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
