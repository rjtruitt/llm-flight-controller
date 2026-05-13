/**
 * Anthropic OpenAI Translator - Convert between Anthropic format and OpenAI
 *
 * @aiInstructions
 * Translates Anthropic's message format to/from OpenAI universal format.
 * Handles Anthropic-specific features like prompt caching, thinking blocks, etc.
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';

/**
 * Anthropic message format (from @anthropic-ai/sdk)
 */
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContent[];
}

export type AnthropicContent =
    | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
    | { type: 'image'; source: { type: 'base64' | 'url'; media_type: string; data: string } }
    | { type: 'tool_use'; id: string; name: string; input: any }
    | { type: 'tool_result'; tool_use_id: string; content: string | any[] };

export interface AnthropicRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    max_tokens: number;
    temperature?: number;
    top_p?: number;
    tools?: Array<{
        name: string;
        description?: string;
        input_schema: any;
    }>;
    stream?: boolean;
}

export interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContent[];
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    };
}

/**
 * Anthropic OpenAI Translator
 */
export class AnthropicOpenAITranslator implements IOpenAITranslator<AnthropicRequest, AnthropicResponse> {
    getProviderId(): string {
        return 'anthropic';
    }

    /**
     * Convert Anthropic format to OpenAI
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
                    content: anthropicRequest.system.map(block => this.contentToOpenAI(block))
                });
            }
        }

        // Convert messages
        for (const msg of anthropicRequest.messages) {
            const content: OpenAIContent[] = [];

            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            } else {
                content.push(...msg.content.map(block => this.contentToOpenAI(block)));
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
     * Convert OpenAI format to Anthropic
     */
    fromOpenAI(rosettaContext: OpenAIContext): AnthropicRequest {
        const anthropicMessages: AnthropicMessage[] = [];
        let systemPrompt: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;

        // Extract system message
        const systemMessages = rosettaContext.messages.filter(msg => msg.role === 'system');
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
        for (const msg of rosettaContext.messages) {
            if (msg.role === 'system') continue;

            const content = msg.content.map(block => this.contentFromOpenAI(block));

            anthropicMessages.push({
                role: msg.role as 'user' | 'assistant',
                content
            });
        }

        return {
            model: '', // Set by provider implementation
            messages: anthropicMessages,
            system: systemPrompt,
            max_tokens: rosettaContext.maxTokens || 4096,
            temperature: rosettaContext.temperature,
            top_p: rosettaContext.topP,
            tools: rosettaContext.tools?.map(tool => ({
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters
            }))
        };
    }

    /**
     * Convert Anthropic response to OpenAI ModelResponse
     */
    responseToOpenAI(anthropicResponse: AnthropicResponse): ModelResponse {
        const content = anthropicResponse.content.map(block => this.contentToOpenAI(block));

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

    /**
     * Convert single Anthropic content block to OpenAI
     */
    private contentToOpenAI(block: AnthropicContent | { type: 'text'; text: string; cache_control?: any }): OpenAIContent {
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

        // Fallback
        return { type: 'text', text: JSON.stringify(block) };
    }

    /**
     * Convert OpenAI content to Anthropic format
     */
    private contentFromOpenAI(rosetta: OpenAIContent): AnthropicContent {
        if (rosetta.type === 'text') {
            return { type: 'text', text: rosetta.text };
        }

        if (rosetta.type === 'cache_marker') {
            return {
                type: 'text',
                text: rosetta.text || '',
                cache_control: { type: 'ephemeral' }
            };
        }

        if (rosetta.type === 'image') {
            return {
                type: 'image',
                source: {
                    type: rosetta.source?.type === 'url' ? 'url' : 'base64',
                    media_type: rosetta.source?.mediaType || 'image/png',
                    data: rosetta.source?.data || ''
                }
            };
        }

        if (rosetta.type === 'tool_call') {
            return {
                type: 'tool_use',
                id: rosetta.id || '',
                name: rosetta.name || '',
                input: rosetta.arguments
            };
        }

        if (rosetta.type === 'tool_result') {
            return {
                type: 'tool_result',
                tool_use_id: rosetta.toolCallId || '',
                content: (rosetta.content as string) || (rosetta.result as string) || ''
            };
        }

        // Fallback - convert unknown types to text
        return {
            type: 'text',
            text: `[${rosetta.type}]: ${JSON.stringify(rosetta)}`
        };
    }
}
