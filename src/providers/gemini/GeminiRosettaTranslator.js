"use strict";
/**
 * Gemini Rosetta Translator - Convert between Gemini format and Rosetta
 *
 * @aiInstructions
 * Handles Google Gemini API format, including unique features:
 * - Multi-modal (text, images, video, audio)
 * - Function calling
 * - System instructions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiRosettaTranslator = void 0;
/**
 * Gemini Rosetta Translator
 */
class GeminiRosettaTranslator {
    getProviderId() {
        return 'gemini';
    }
    /**
     * Convert Gemini format to Rosetta
     */
    toRosetta(geminiRequest) {
        const messages = [];
        // Convert system instruction if present
        if (geminiRequest.systemInstruction) {
            messages.push({
                role: 'system',
                content: geminiRequest.systemInstruction.parts.map(p => ({
                    type: 'text',
                    text: p.text
                }))
            });
        }
        // Convert messages
        for (const msg of geminiRequest.contents) {
            const content = [];
            for (const part of msg.parts) {
                content.push(this.partToRosetta(part));
            }
            messages.push({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content
            });
        }
        return {
            messages,
            tools: geminiRequest.tools?.flatMap(tool => tool.functionDeclarations.map(func => ({
                type: 'function',
                function: {
                    name: func.name,
                    description: func.description,
                    parameters: func.parameters
                }
            }))),
            maxTokens: geminiRequest.generationConfig?.maxOutputTokens,
            temperature: geminiRequest.generationConfig?.temperature,
            topP: geminiRequest.generationConfig?.topP
        };
    }
    /**
     * Convert Rosetta format to Gemini
     */
    fromRosetta(rosettaContext) {
        const geminiMessages = [];
        let systemInstruction;
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
            if (msg.role === 'system')
                continue;
            const parts = [];
            for (const block of msg.content) {
                const converted = this.partFromRosetta(block);
                if (converted)
                    parts.push(converted);
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
     * Convert Gemini response to Rosetta ModelResponse
     */
    responseToRosetta(geminiResponse) {
        const candidate = geminiResponse.candidates[0];
        const content = [];
        for (const part of candidate.content.parts) {
            content.push(this.partToRosetta(part));
        }
        const usage = {
            inputTokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
            outputTokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: geminiResponse.usageMetadata?.totalTokenCount || 0
        };
        // Map finish reason
        let finishReason;
        switch (candidate.finishReason) {
            case 'STOP':
                finishReason = 'stop';
                break;
            case 'MAX_TOKENS':
                finishReason = 'length';
                break;
            case 'SAFETY':
                finishReason = 'content_filter';
                break;
            default:
                finishReason = candidate.finishReason.toLowerCase();
        }
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
     * Convert single Gemini part to Rosetta
     */
    partToRosetta(part) {
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
     * Convert Rosetta content to Gemini part
     */
    partFromRosetta(rosetta) {
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
            return {
                functionResponse: {
                    name: rosetta.toolCallId || '',
                    response: JSON.parse(rosetta.content || '{}')
                }
            };
        }
        // Unsupported types - skip
        return null;
    }
}
exports.GeminiRosettaTranslator = GeminiRosettaTranslator;
//# sourceMappingURL=GeminiRosettaTranslator.js.map