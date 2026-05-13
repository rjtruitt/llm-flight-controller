/**
 * Anthropic OpenAI Translator - Convert between Anthropic format and OpenAI
 *
 * @aiInstruction
 * Translates Anthropic's message format to/from library format.
 * Handles Anthropic-specific features like prompt caching and extended context.
 * System messages are passed separately in the 'system' field, not in messages array.
 *
 * @aiExample
 * import { AnthropicOpenAITranslator } from './AnthropicOpenAITranslator';
 * const translator = new AnthropicOpenAITranslator();
 * const request = translator.fromOpenAI(context);
 * const response = await anthropic.messages.create(request);
 * const modelResponse = translator.responseToOpenAI(response);
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';
import { AnthropicRequest, AnthropicResponse, AnthropicMessage } from './AnthropicTypes';
import { contentToOpenAI, contentFromOpenAI } from './AnthropicContentConverter';

/**
 * Anthropic OpenAI Translator
 */
export class AnthropicOpenAITranslator implements IOpenAITranslator<AnthropicRequest, AnthropicResponse> {
    getProviderId(): string {
        return 'anthropic';
    }

    /**
     * Convert Anthropic format to library format
     */
    toOpenAI(anthropicRequest: AnthropicRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        // Convert system message if present
        if (anthropicRequest.system) {
            if (typeof anthropicRequest.system === 'string') {
                messages.push({
                    role: 'system',
                    content: [{ type: 'text', text: anthropicRequest.system }]
                });
            } else {
                messages.push({
                    role: 'system',
                    content: anthropicRequest.system.map(block => contentToOpenAI(block))
                });
            }
        }

        // Convert messages
        for (const msg of anthropicRequest.messages) {
            const content: OpenAIContent[] = [];

            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            } else {
                content.push(...msg.content.map(block => contentToOpenAI(block)));
            }

            messages.push({
                role: msg.role,
                content
            });
        }

        return {
            messages,
            tools: anthropicRequest.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema
                }
            })),
            maxTokens: anthropicRequest.max_tokens,
            temperature: anthropicRequest.temperature,
            topP: anthropicRequest.top_p
        };
    }

    /**
     * Convert library format to Anthropic format
     */
    fromOpenAI(context: OpenAIContext): AnthropicRequest {
        const anthropicMessages: AnthropicMessage[] = [];
        let systemPrompt: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;

        // Extract system message
        const systemMessages = context.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            const systemContent = systemMessages.flatMap(msg => msg.content);
            const hasCache = systemContent.some(c => c.type === 'cache_marker');

            if (hasCache || systemContent.length > 1) {
                // Use array format for caching
                systemPrompt = systemContent
                    .filter(c => c.type === 'text')
                    .map(c => ({
                        type: 'text' as const,
                        text: (c as any).text
                    }));
            } else {
                // Simple string format
                systemPrompt = systemContent.find(c => c.type === 'text')?.text;
            }
        }

        // Convert user/assistant messages
        for (const msg of context.messages) {
            if (msg.role === 'system') continue;

            const content = msg.content.map(block => contentFromOpenAI(block));

            anthropicMessages.push({
                role: msg.role as 'user' | 'assistant',
                content
            });
        }

        return {
            model: '',
            messages: anthropicMessages,
            system: systemPrompt,
            max_tokens: context.maxTokens || 4096,
            temperature: context.temperature,
            top_p: context.topP,
            tools: context.tools?.map(tool => ({
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters
            }))
        };
    }

    /**
     * Convert Anthropic response to library ModelResponse
     */
    responseToOpenAI(anthropicResponse: AnthropicResponse): ModelResponse {
        const content = anthropicResponse.content.map(block => contentToOpenAI(block));

        const usage: TokenUsage = {
            inputTokens: anthropicResponse.usage.input_tokens,
            outputTokens: anthropicResponse.usage.output_tokens,
            totalTokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
            cacheReadTokens: anthropicResponse.usage.cache_read_input_tokens,
            cacheWriteTokens: anthropicResponse.usage.cache_creation_input_tokens
        };

        // Map Anthropic finish reasons to OpenAI format
        const finishReasonMap: Record<string, any> = {
            'end_turn': 'stop',
            'max_tokens': 'length',
            'tool_use': 'tool_calls',
            'stop_sequence': 'stop'
        };

        return {
            id: anthropicResponse.id,
            content,
            usage,
            finishReason: finishReasonMap[anthropicResponse.stop_reason] || 'stop',
            metadata: {
                providerId: 'anthropic',
                modelId: anthropicResponse.model,
                custom: {
                    stopSequence: anthropicResponse.stop_sequence
                }
            }
        };
    }
}
