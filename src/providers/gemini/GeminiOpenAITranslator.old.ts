/**
 * Gemini OpenAI Translator - Convert between Gemini format and OpenAI
 *
 * @aiInstructions
 * Handles Google Gemini API format, including unique features:
 * - Multi-modal (text, images, video, audio)
 * - Function calling
 * - System instructions
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';

/**
 * Gemini message format
 */
export interface GeminiMessage {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

export type GeminiPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { mimeType: string; fileUri: string } }
    | { functionCall: { name: string; args: any } }
    | { functionResponse: { name: string; response: any } };

export interface GeminiRequest {
    contents: GeminiMessage[];
    systemInstruction?: {
        role: 'user';
        parts: Array<{ text: string }>;
    };
    tools?: Array<{
        functionDeclarations: Array<{
            name: string;
            description?: string;
            parameters?: any;
        }>;
    }>;
    generationConfig?: {
        temperature?: number;
        topP?: number;
        topK?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
    };
}

export interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: GeminiPart[];
            role: 'model';
        };
        finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
        index: number;
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    }>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
    modelVersion?: string;
}

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
                content.push(this.partToOpenAI(part));
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
    fromOpenAI(rosettaContext: OpenAIContext): GeminiRequest {
        const geminiMessages: GeminiMessage[] = [];
        let systemInstruction: GeminiRequest['systemInstruction'];

        // Extract system message
        const systemMessages = rosettaContext.messages.filter(msg => msg.role === 'system');
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
        for (const msg of rosettaContext.messages) {
            if (msg.role === 'system') continue;

            const parts: GeminiPart[] = [];

            for (const block of msg.content) {
                const converted = this.partFromOpenAI(block);
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
            tools: rosettaContext.tools
                ? [
                      {
                          functionDeclarations: rosettaContext.tools.map(tool => ({
                              name: tool.function.name,
                              description: tool.function.description,
                              parameters: tool.function.parameters
                          }))
                      }
                  ]
                : undefined,
            generationConfig: {
                maxOutputTokens: rosettaContext.maxTokens,
                temperature: rosettaContext.temperature,
                topP: rosettaContext.topP
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
            content.push(this.partToOpenAI(part));
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
            id: `gemini-${Date.now()}`, // Gemini doesn't return ID
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

    /**
     * Convert single Gemini part to OpenAI
     */
    private partToOpenAI(part: GeminiPart): OpenAIContent {
        if ('text' in part) {
            return { type: 'text', text: part.text };
        }

        if ('inlineData' in part) {
            const mimeType = part.inlineData.mimeType;
            if (mimeType.startsWith('image/')) {
                return {
                    type: 'image',
                    source: {
                        type: 'base64',
                        mediaType: mimeType,
                        data: part.inlineData.data
                    }
                };
            }
            if (mimeType.startsWith('video/')) {
                return {
                    type: 'video',
                    source: {
                        type: 'base64',
                        mediaType: mimeType,
                        data: part.inlineData.data
                    }
                };
            }
            if (mimeType.startsWith('audio/')) {
                return {
                    type: 'audio',
                    source: {
                        type: 'base64',
                        mediaType: mimeType,
                        data: part.inlineData.data
                    }
                };
            }
        }

        if ('fileData' in part) {
            const mimeType = part.fileData.mimeType;
            if (mimeType.startsWith('image/')) {
                return {
                    type: 'image',
                    source: {
                        type: 'url',
                        mediaType: mimeType,
                        data: part.fileData.fileUri
                    }
                };
            }
            if (mimeType.startsWith('video/')) {
                return {
                    type: 'video',
                    source: {
                        type: 'url',
                        mediaType: mimeType,
                        data: part.fileData.fileUri
                    }
                };
            }
        }

        if ('functionCall' in part) {
            return {
                type: 'tool_call',
                id: `call_${Date.now()}`, // Gemini doesn't provide IDs
                name: part.functionCall.name,
                arguments: part.functionCall.args
            };
        }

        if ('functionResponse' in part) {
            return {
                type: 'tool_result',
                toolCallId: part.functionResponse.name, // Use name as ID
                content: JSON.stringify(part.functionResponse.response)
            };
        }

        // Fallback
        return { type: 'text', text: JSON.stringify(part) };
    }

    /**
     * Convert OpenAI content to Gemini part
     */
    private partFromOpenAI(rosetta: OpenAIContent): GeminiPart | null {
        if (rosetta.type === 'text') {
            return { text: rosetta.text };
        }

        if (rosetta.type === 'image') {
            if (rosetta.source?.type === 'base64') {
                return {
                    inlineData: {
                        mimeType: rosetta.source.mediaType || 'image/png',
                        data: rosetta.source.data || ''
                    }
                };
            }
            if (rosetta.source?.type === 'url') {
                return {
                    fileData: {
                        mimeType: rosetta.source.mediaType || 'image/png',
                        fileUri: rosetta.source.data || ''
                    }
                };
            }
        }

        if (rosetta.type === 'video') {
            if (rosetta.source?.type === 'base64') {
                return {
                    inlineData: {
                        mimeType: rosetta.source.mediaType || 'video/mp4',
                        data: rosetta.source.data || ''
                    }
                };
            }
            if (rosetta.source?.type === 'url') {
                return {
                    fileData: {
                        mimeType: rosetta.source.mediaType || 'video/mp4',
                        fileUri: rosetta.source.data || ''
                    }
                };
            }
        }

        if (rosetta.type === 'audio') {
            if (rosetta.source?.type === 'base64') {
                return {
                    inlineData: {
                        mimeType: rosetta.source.mediaType || 'audio/mp3',
                        data: rosetta.source.data || ''
                    }
                };
            }
        }

        if (rosetta.type === 'tool_call') {
            return {
                functionCall: {
                    name: rosetta.name || '',
                    args: rosetta.arguments
                }
            };
        }

        if (rosetta.type === 'tool_result') {
            const contentStr = (rosetta.content as string) || (rosetta.result as string) || '{}';
            return {
                functionResponse: {
                    name: rosetta.toolCallId || '',
                    response: JSON.parse(contentStr)
                }
            };
        }

        // Unsupported types - skip
        return null;
    }
}
