/**
 * Anthropic content conversion utilities
 *
 * @aiInstruction
 * Converts individual content blocks between Anthropic and library formats.
 * Handles text, images, tool use/results, and prompt caching markers.
 * Cache markers in library format map to cache_control in Anthropic format.
 *
 * @aiExample
 * import { contentToOpenAI, contentFromOpenAI } from './AnthropicContentConverter';
 * const libContent = contentToOpenAI({ type: 'text', text: 'hello' });
 * const anthropicContent = contentFromOpenAI({ type: 'text', text: 'hello' });
 */

import { AnthropicContent } from './AnthropicTypes';
import { OpenAIContent } from '../../core/types/Message';

/**
 * Convert Anthropic content to library format
 */
export function contentToOpenAI(block: AnthropicContent | { type: 'text'; text: string; cache_control?: any }): OpenAIContent {
    if (block.type === 'text') {
        if ('cache_control' in block && block.cache_control) {
            return { type: 'cache_marker', text: block.text };
        }
        return { type: 'text', text: block.text };
    }

    if (block.type === 'image') {
        return {
            type: 'image',
            source: {
                type: block.source.type === 'base64' ? 'base64' : 'url',
                mediaType: block.source.media_type,
                data: block.source.data
            }
        };
    }

    if (block.type === 'tool_use') {
        return {
            type: 'tool_call',
            id: block.id,
            name: block.name,
            arguments: block.input
        };
    }

    if (block.type === 'tool_result') {
        return {
            type: 'tool_result',
            toolCallId: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
        };
    }

    return { type: 'text', text: JSON.stringify(block) };
}

/**
 * Convert library content to Anthropic format
 */
export function contentFromOpenAI(content: OpenAIContent): AnthropicContent {
    if (content.type === 'text') {
        return { type: 'text', text: content.text };
    }

    if (content.type === 'cache_marker') {
        return {
            type: 'text',
            text: content.text || '',
            cache_control: { type: 'ephemeral' }
        };
    }

    if (content.type === 'image') {
        return {
            type: 'image',
            source: {
                type: content.source?.type === 'url' ? 'url' : 'base64',
                media_type: content.source?.mediaType || 'image/png',
                data: content.source?.data || ''
            }
        };
    }

    if (content.type === 'tool_call') {
        return {
            type: 'tool_use',
            id: content.id || '',
            name: content.name || '',
            input: content.arguments
        };
    }

    if (content.type === 'tool_result') {
        return {
            type: 'tool_result',
            tool_use_id: content.toolCallId || '',
            content: (content.content as string) || (content.result as string) || ''
        };
    }

    return {
        type: 'text',
        text: `[${content.type}]: ${JSON.stringify(content)}`
    };
}
