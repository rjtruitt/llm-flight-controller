/**
 * Gemini OpenAI Translator - Convert between Gemini format and OpenAI
 *
 * @aiInstruction
 * Handles Google Gemini API format, including unique features:
 * - Multi-modal (text, images, video, audio)
 * - Function calling
 * - System instructions (converted to systemInstruction field, not regular messages)
 *
 * @aiExample
 * import { GeminiOpenAITranslator } from './GeminiOpenAITranslator';
 * const translator = new GeminiOpenAITranslator();
 * const geminiRequest = translator.fromOpenAI(openaiContext);
 * const geminiResponse = await geminiClient.generateContent(geminiRequest);
 * const modelResponse = translator.responseToOpenAI(geminiResponse);
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';
import { GeminiRequest, GeminiResponse, GeminiMessage, GeminiPart } from './GeminiTypes';
import { partToOpenAI, partFromOpenAI } from './GeminiPartConverter';

/**
 * Gemini OpenAI Translator
 */
export class GeminiOpenAITranslator implements IOpenAITranslator<GeminiRequest, GeminiResponse> {
    getProviderId(): string {
        return 'gemini';
    }

    /**
     * Convert Gemini format to OpenAI
     */
    toOpenAI(geminiRequest: GeminiRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        // Convert system instruction if present
        if (geminiRequest.systemInstruction) {
            messages.push({
                role: 'system',
                content: geminiRequest.systemInstruction.parts.map(p => ({
                    type: 'text' as const,
                    text: p.text
                }))
            });
        }

        // Convert messages
        for (const msg of geminiRequest.contents) {
            const content: OpenAIContent[] = [];

            for (const part of msg.parts) {
                content.push(partToOpenAI(part));
            }

            messages.push({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content
            });
        }

        return {
            messages,
            tools: geminiRequest.tools?.flatMap(tool =>
                tool.functionDeclarations.map(func => ({
                    type: 'function' as const,
                    function: {
                        name: func.name,
                        description: func.description,
                        parameters: func.parameters
                    }
                }))
            ),
            maxTokens: geminiRequest.generationConfig?.maxOutputTokens,
            temperature: geminiRequest.generationConfig?.temperature,
            topP: geminiRequest.generationConfig?.topP
        };
    }

    /**
     * Convert OpenAI format to Gemini
     */
    fromOpenAI(openaiContext: OpenAIContext): GeminiRequest {
        const geminiMessages: GeminiMessage[] = [];
        let systemInstruction: GeminiRequest['systemInstruction'];

        // Extract system message
        const systemMessages = openaiContext.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            const systemText = systemMessages
                .flatMap(msg => msg.content)
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');

            systemInstruction = {
                role: 'user',
                parts: [{ text: systemText }]
            };
        }

        // Convert user/assistant messages
        for (const msg of openaiContext.messages) {
            if (msg.role === 'system') continue;

            const parts: GeminiPart[] = [];

            for (const block of msg.content) {
                const converted = partFromOpenAI(block);
                if (converted) parts.push(converted);
            }

            if (parts.length > 0) {
                geminiMessages.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts
                });
            }
        }

        return {
            contents: geminiMessages,
            systemInstruction,
            tools: openaiContext.tools
                ? [
                      {
                          functionDeclarations: openaiContext.tools.map(tool => ({
                              name: tool.function.name,
                              description: tool.function.description,
                              parameters: tool.function.parameters
                          }))
                      }
                  ]
                : undefined,
            generationConfig: {
                maxOutputTokens: openaiContext.maxTokens,
                temperature: openaiContext.temperature,
                topP: openaiContext.topP
            }
        };
    }

    /**
     * Convert Gemini response to OpenAI ModelResponse
     */
    responseToOpenAI(geminiResponse: GeminiResponse): ModelResponse {
        const candidate = geminiResponse.candidates[0];
        const content: OpenAIContent[] = [];

        for (const part of candidate.content.parts) {
            content.push(partToOpenAI(part));
        }

        const usage: TokenUsage = {
            inputTokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
            outputTokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: geminiResponse.usageMetadata?.totalTokenCount || 0
        };

        // Map finish reason to OpenAI format
        const finishReasonMap: Record<string, any> = {
            'STOP': 'stop',
            'MAX_TOKENS': 'length',
            'SAFETY': 'content_filter',
            'RECITATION': 'content_filter',
            'OTHER': 'stop'
        };
        const finishReason = finishReasonMap[candidate.finishReason] || 'stop';

        return {
            id: `gemini-${Date.now()}`,
            content,
            usage,
            finishReason,
            metadata: {
                providerId: 'gemini',
                modelId: geminiResponse.modelVersion || 'unknown',
                custom: {
                    safetyRatings: candidate.safetyRatings
                }
            }
        };
    }
}
