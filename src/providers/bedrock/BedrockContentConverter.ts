/**
 * Bedrock content conversion utilities
 *
 * @aiInstruction
 * Converts individual content blocks between Bedrock and OpenAI formats.
 * Handles text, images, documents, and tool use/results.
 * IMPORTANT: Bedrock only accepts 'user' and 'assistant' roles, not 'tool' role.
 * Tool results must be embedded in user messages as toolResult content.
 *
 * @aiExample
 * import { contentToOpenAI, contentFromOpenAI } from './BedrockContentConverter';
 * const openaiContent = contentToOpenAI({ text: 'hello' });
 * const bedrockContent = contentFromOpenAI({ type: 'text', text: 'hello' });
 */

import { BedrockContent } from './BedrockTypes';
import { OpenAIContent } from '../../core/types/Message';

/**
 * Convert single Bedrock content block to OpenAI
 */
export function contentToOpenAI(block: BedrockContent): OpenAIContent {
    if ('text' in block) {
        return { type: 'text', text: block.text };
    }

    if ('image' in block) {
        return {
            type: 'image',
            source: {
                type: 'base64',
                mediaType: `image/${block.image.format}`,
                data: block.image.source.bytes.toString('base64')
            }
        };
    }

    if ('document' in block) {
        return {
            type: 'document',
            url: `data:application/${block.document.format};base64,${block.document.source.bytes.toString('base64')}`,
            mimeType: `application/${block.document.format}`,
            text: block.document.source.bytes.toString('utf-8'),
            metadata: {
                title: block.document.name
            }
        };
    }

    if ('toolUse' in block) {
        return {
            type: 'tool_call',
            id: block.toolUse.toolUseId,
            name: block.toolUse.name,
            arguments: block.toolUse.input
        };
    }

    if ('toolResult' in block) {
        const resultText = block.toolResult.content
            .filter(c => 'text' in c)
            .map(c => (c as any).text)
            .join('\n');

        return {
            type: 'tool_result',
            toolCallId: block.toolResult.toolUseId,
            content: resultText
        };
    }

    return { type: 'text', text: JSON.stringify(block) };
}

/**
 * Convert OpenAI content to Bedrock format
 * Returns null if content type is unsupported
 */
export function contentFromOpenAI(content: OpenAIContent): BedrockContent | null {
    if (content.type === 'text') {
        return { text: content.text };
    }

    if (content.type === 'image') {
        if (content.source?.type === 'base64') {
            const format = content.source.mediaType?.split('/')[1] || 'png';
            return {
                image: {
                    format,
                    source: {
                        bytes: Buffer.from(content.source.data || '', 'base64')
                    }
                }
            };
        }
    }

    if (content.type === 'document') {
        const format = content.mimeType?.split('/')[1] || 'txt';
        return {
            document: {
                format: format as any,
                name: content.metadata?.title || 'document',
                source: {
                    bytes: Buffer.from(content.text || '', 'utf-8')
                }
            }
        };
    }

    if (content.type === 'tool_call') {
        return {
            toolUse: {
                toolUseId: content.id || '',
                name: content.name || '',
                input: content.arguments
            }
        };
    }

    if (content.type === 'tool_result') {
        return {
            toolResult: {
                toolUseId: content.toolCallId || '',
                content: [{ text: (content.content as string) || (content.result as string) || '' }]
            }
        };
    }

    return null;
}
