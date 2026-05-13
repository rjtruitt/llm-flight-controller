/**
 * OpenAI Translator - Interface for provider format translation
 *
 * @aiInstructions
 * All providers translate to/from OpenAI format (the universal middle layer).
 * This avoids N×N matrix of provider-to-provider translators.
 *
 * Provider Format ↔ OpenAI Format ↔ Provider Format
 *
 * @aiExample
 * ```typescript
 * const translator = new AnthropicOpenAITranslator();
 * const rosettaContext = translator.toOpenAI(anthropicMessages);
 * const geminiMessages = geminiTranslator.fromOpenAI(rosettaContext);
 * ```
 */

import { OpenAIContext } from '../types/Context';
import { OpenAIContent } from '../types/Message';
import { ModelResponse } from '../types/Response';

/**
 * Translator interface - converts between provider format and OpenAI format
 */
export interface IOpenAITranslator<TProviderFormat = any, TProviderResponse = any> {
    /**
     * Convert provider-specific format to OpenAI format
     */
    toOpenAI(providerFormat: TProviderFormat): OpenAIContext;

    /**
     * Convert OpenAI format to provider-specific format
     */
    fromOpenAI(rosettaContext: OpenAIContext): TProviderFormat;

    /**
     * Convert provider response to unified ModelResponse
     */
    responseToOpenAI(providerResponse: TProviderResponse): ModelResponse;

    /**
     * Get provider identifier
     */
    getProviderId(): string;
}

/**
 * Content adapter - handles feature gaps between providers
 */
export interface IContentAdapter {
    /**
     * Adapt content for a model that lacks certain capabilities
     * (e.g., inject tool definitions into text for models without native tool support)
     */
    adaptContent(
        content: OpenAIContent[],
        targetCapabilities: Set<string>
    ): OpenAIContent[];

    /**
     * Extract tool calls from text response (for non-native tool models)
     */
    extractToolCalls?(text: string): Array<{
        id: string;
        name: string;
        arguments: any;
    }>;
}

/**
 * Base content adapter with common adaptations
 */
export class BaseContentAdapter implements IContentAdapter {
    adaptContent(
        content: OpenAIContent[],
        targetCapabilities: Set<string>
    ): OpenAIContent[] {
        const adapted: OpenAIContent[] = [];

        for (const item of content) {
            // Pass through text always
            if (item.type === 'text') {
                adapted.push(item);
                continue;
            }

            // Images - check vision support
            if (item.type === 'image') {
                if (targetCapabilities.has('vision')) {
                    adapted.push(item);
                } else {
                    // Fallback: describe image
                    adapted.push({
                        type: 'text',
                        text: `[Image: ${item.source?.data?.substring(0, 50) || 'image data'}...]`
                    });
                }
                continue;
            }

            // Tool calls - check native support
            if (item.type === 'tool_call') {
                if (targetCapabilities.has('native_tools')) {
                    adapted.push(item);
                } else {
                    // Fallback: inject as structured text
                    adapted.push({
                        type: 'text',
                        text: `Tool Call: ${item.name}(${JSON.stringify(item.arguments)})`
                    });
                }
                continue;
            }

            // Tool results - check native support
            if (item.type === 'tool_result') {
                if (targetCapabilities.has('native_tools')) {
                    adapted.push(item);
                } else {
                    // Fallback: inject result as text
                    adapted.push({
                        type: 'text',
                        text: `Tool Result: ${JSON.stringify(item.content)}`
                    });
                }
                continue;
            }

            // Cache markers - Anthropic only
            if (item.type === 'cache_marker') {
                if (targetCapabilities.has('prompt_caching')) {
                    adapted.push(item);
                }
                // Otherwise skip - other providers don't support
                continue;
            }

            // Thinking - o1/o3/DeepSeek R1 only
            if (item.type === 'thinking') {
                if (targetCapabilities.has('reasoning')) {
                    adapted.push(item);
                } else {
                    // Fallback: inject as text
                    adapted.push({
                        type: 'text',
                        text: `[Reasoning: ${item.text}]`
                    });
                }
                continue;
            }

            // Audio/video/document - pass through if supported, otherwise skip
            if (item.type === 'audio' || item.type === 'video' || item.type === 'document') {
                if (targetCapabilities.has(item.type)) {
                    adapted.push(item);
                } else {
                    adapted.push({
                        type: 'text',
                        text: `[${item.type}: not supported by target model]`
                    });
                }
                continue;
            }

            // Unknown type - pass through
            adapted.push(item);
        }

        return adapted;
    }

    extractToolCalls(text: string): Array<{ id: string; name: string; arguments: any }> {
        const calls: Array<{ id: string; name: string; arguments: any }> = [];

        // Match pattern: Tool Call: functionName({"arg": "value"})
        const regex = /Tool Call: (\w+)\((.*?)\)/g;
        let match;
        let index = 0;

        while ((match = regex.exec(text)) !== null) {
            const name = match[1];
            const argsJson = match[2];

            try {
                const args = JSON.parse(argsJson);
                calls.push({
                    id: `call_${index++}`,
                    name,
                    arguments: args
                });
            } catch (e) {
                // Skip malformed tool calls
            }
        }

        return calls;
    }
}
