/**
 * Gemini content part conversion utilities
 *
 * @aiInstruction
 * Converts individual content parts between Gemini and OpenAI formats.
 * Handles text, images, video, audio, and function calls.
 * Use partToOpenAI() to convert Gemini parts to OpenAI format.
 * Use partFromOpenAI() to convert OpenAI content to Gemini parts.
 *
 * @aiExample
 * import { partToOpenAI, partFromOpenAI } from './GeminiPartConverter';
 * const openaiContent = partToOpenAI({ text: 'hello' });
 * const geminiPart = partFromOpenAI({ type: 'text', text: 'hello' });
 */

import { GeminiPart } from './GeminiTypes';
import { OpenAIContent } from '../../core/types/Message';

/**
 * Convert single Gemini part to OpenAI content
 */
export function partToOpenAI(part: GeminiPart): OpenAIContent {
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
            id: `call_${Date.now()}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args
        };
    }

    if ('functionResponse' in part) {
        return {
            type: 'tool_result',
            toolCallId: part.functionResponse.name,
            content: JSON.stringify(part.functionResponse.response)
        };
    }

    return { type: 'text', text: JSON.stringify(part) };
}

/**
 * Convert OpenAI content to Gemini part
 * Returns null if content type is unsupported
 */
export function partFromOpenAI(content: OpenAIContent): GeminiPart | null {
    if (content.type === 'text') {
        return { text: content.text };
    }

    if (content.type === 'image') {
        if (content.source?.type === 'base64') {
            return {
                inlineData: {
                    mimeType: content.source.mediaType || 'image/png',
                    data: content.source.data || ''
                }
            };
        }
        if (content.source?.type === 'url') {
            return {
                fileData: {
                    mimeType: content.source.mediaType || 'image/png',
                    fileUri: content.source.data || ''
                }
            };
        }
    }

    if (content.type === 'video') {
        if (content.source?.type === 'base64') {
            return {
                inlineData: {
                    mimeType: content.source.mediaType || 'video/mp4',
                    data: content.source.data || ''
                }
            };
        }
        if (content.source?.type === 'url') {
            return {
                fileData: {
                    mimeType: content.source.mediaType || 'video/mp4',
                    fileUri: content.source.data || ''
                }
            };
        }
    }

    if (content.type === 'audio') {
        if (content.source?.type === 'base64') {
            return {
                inlineData: {
                    mimeType: content.source.mediaType || 'audio/mp3',
                    data: content.source.data || ''
                }
            };
        }
    }

    if (content.type === 'tool_call') {
        return {
            functionCall: {
                name: content.name || '',
                args: content.arguments
            }
        };
    }

    if (content.type === 'tool_result') {
        const contentStr = (content.content as string) || (content.result as string) || '{}';
        return {
            functionResponse: {
                name: content.toolCallId || '',
                response: JSON.parse(contentStr)
            }
        };
    }

    return null;
}
