/**
 * OpenAI content conversion utilities
 *
 * @aiInstruction
 * Converts individual content blocks between OpenAI native and library formats.
 * Handles text and images. Tool calls are handled at message level, not content level.
 *
 * @aiExample
 * import { contentToOpenAI, contentFromOpenAI } from './OpenAIContentConverter';
 * const libContent = contentToOpenAI({ type: 'text', text: 'hello' });
 * const nativeContent = contentFromOpenAI({ type: 'text', text: 'hello' });
 */

import { OpenAINativeContent } from './OpenAITypes';
import { OpenAIContent } from '../../core/types/Message';

/**
 * Convert OpenAI native content to library format
 */
export function contentToOpenAI(block: OpenAINativeContent): OpenAIContent | null {
    if (block.type === 'text') {
        return { type: 'text', text: block.text };
    }

    if (block.type === 'image_url') {
        return {
            type: 'image',
            source: {
                type: 'url',
                data: block.image_url.url
            }
        };
    }

    return { type: 'text', text: JSON.stringify(block) };
}

/**
 * Convert library content to OpenAI native format
 * Returns null if content type is unsupported
 */
export function contentFromOpenAI(content: OpenAIContent): OpenAINativeContent | null {
    if (content.type === 'text') {
        return { type: 'text', text: content.text };
    }

    if (content.type === 'image') {
        if (content.source?.type === 'url') {
            return {
                type: 'image_url',
                image_url: { url: content.source.data || '' }
            };
        }
        if (content.source?.type === 'base64') {
            return {
                type: 'image_url',
                image_url: { url: `data:${content.source.mediaType};base64,${content.source.data}` }
            };
        }
    }

    return null;
}
