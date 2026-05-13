/**
 * OpenAI OpenAI Translator - Convert between OpenAI format and OpenAI
 *
 * @aiInstructions
 * Handles OpenAI chat completion format and all OpenAI-compatible providers:
 * - OpenAI (GPT-4, GPT-4o, o1, o3)
 * - DeepSeek (reasoning models)
 * - Groq
 * - Together AI
 * - Perplexity
 * - Ollama (local)
 * - LM Studio (local)
 * - vLLM (local)
 * - Any OpenAI-compatible endpoint
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage as BaseOpenAIMessage, OpenAIContent as BaseOpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';

/**
 * OpenAI message format (native SDK format)
 */
export interface OpenAINativeMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | OpenAINativeContent[];
    name?: string;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
}

export type OpenAINativeContent =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface OpenAIRequest {
    model: string;
    messages: OpenAINativeMessage[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters: any;
        };
    }>;
    stream?: boolean;
    reasoning_effort?: 'low' | 'medium' | 'high'; // o1/o3 models
}

export interface OpenAIResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: 'assistant';
            content: string | null;
            tool_calls?: OpenAIToolCall[];
            reasoning_content?: string; // o1/o3 reasoning
        };
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        reasoning_tokens?: number; // o1/o3 models
    };
}

/**
 * OpenAI OpenAI Translator
 */
export class OpenAIOpenAITranslator implements IOpenAITranslator<OpenAIRequest, OpenAIResponse> {
    getProviderId(): string {
        return 'openai';
    }

    /**
     * Convert OpenAI format to OpenAI
     */
    toOpenAI(openaiRequest: OpenAIRequest): OpenAIContext {
        const messages: BaseOpenAIMessage[] = [];

        for (const msg of openaiRequest.messages) {
            const content: BaseOpenAIContent[] = [];

            // Handle string content
            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            }
            // Handle array content
            else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    const converted = this.contentToOpenAI(block);
                    if (converted) content.push(converted);
                }
            }

            // Handle tool calls
            if (msg.tool_calls) {
                for (const toolCall of msg.tool_calls) {
                    content.push({
                        type: 'tool_call',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        arguments: JSON.parse(toolCall.function.arguments)
                    });
                }
            }

            // Handle tool results
            if (msg.role === 'tool' && msg.tool_call_id) {
                content.push({
                    type: 'tool_result',
                    toolCallId: msg.tool_call_id,
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                });
            }

            messages.push({
                role: (msg.role === 'tool' ? 'user' : msg.role) as 'user' | 'assistant' | 'system', // Map tool → user
                content
            });
        }

        return {
            messages,
            tools: openaiRequest.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }
            })),
            maxTokens: openaiRequest.max_tokens,
            temperature: openaiRequest.temperature,
            topP: openaiRequest.top_p
        };
    }

    /**
     * Convert OpenAI format to OpenAI
     */
    fromOpenAI(rosettaContext: OpenAIContext): OpenAIRequest {
        const openaiMessages: OpenAINativeMessage[] = [];

        for (const msg of rosettaContext.messages) {
            // Separate tool calls and tool results from other content
            const regularContent: OpenAINativeContent[] = [];
            const toolCalls: OpenAIToolCall[] = [];
            let toolCallId: string | undefined;

            for (const block of msg.content) {
                if (block.type === 'tool_call') {
                    toolCalls.push({
                        id: block.id || '',
                        type: 'function',
                        function: {
                            name: block.name || '',
                            arguments: JSON.stringify(block.arguments)
                        }
                    });
                } else if (block.type === 'tool_result') {
                    toolCallId = block.toolCallId;
                    regularContent.push({
                        type: 'text',
                        text: (block.content as string) || ''
                    });
                } else {
                    const converted = this.contentFromOpenAI(block);
                    if (converted) regularContent.push(converted);
                }
            }

            // Tool results get their own message
            if (toolCallId) {
                openaiMessages.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: regularContent.length > 0
                        ? regularContent[0].type === 'text' ? regularContent[0].text : JSON.stringify(regularContent)
                        : ''
                });
            }
            // Regular message
            else {
                const message: OpenAINativeMessage = {
                    role: msg.role as 'system' | 'user' | 'assistant',
                    content: regularContent.length === 1 && regularContent[0].type === 'text'
                        ? regularContent[0].text
                        : regularContent
                };

                if (toolCalls.length > 0) {
                    message.tool_calls = toolCalls;
                }

                openaiMessages.push(message);
            }
        }

        return {
            model: '', // Set by provider implementation
            messages: openaiMessages,
            max_tokens: rosettaContext.maxTokens,
            temperature: rosettaContext.temperature,
            top_p: rosettaContext.topP,
            tools: rosettaContext.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }
            }))
        };
    }

    /**
     * Convert OpenAI response to OpenAI ModelResponse
     */
    responseToOpenAI(openaiResponse: OpenAIResponse): ModelResponse {
        const choice = openaiResponse.choices[0];
        const content: BaseOpenAIContent[] = [];

        // Regular text content
        if (choice.message.content) {
            content.push({ type: 'text', text: choice.message.content });
        }

        // Reasoning content (o1/o3)
        if (choice.message.reasoning_content) {
            content.push({ type: 'thinking', text: choice.message.reasoning_content });
        }

        // Tool calls
        if (choice.message.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                content.push({
                    type: 'tool_call',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments)
                });
            }
        }

        const usage: TokenUsage = {
            inputTokens: openaiResponse.usage.prompt_tokens,
            outputTokens: openaiResponse.usage.completion_tokens,
            totalTokens: openaiResponse.usage.total_tokens,
            reasoningTokens: openaiResponse.usage.reasoning_tokens
        };

        return {
            id: openaiResponse.id,
            content,
            usage,
            finishReason: choice.finish_reason,
            metadata: {
                providerId: 'openai',
                modelId: openaiResponse.model,
                custom: {
                    created: openaiResponse.created
                }
            }
        };
    }

    /**
     * Convert single OpenAI content block to OpenAI
     */
    private contentToOpenAI(block: OpenAINativeContent): BaseOpenAIContent | null {
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

        // Fallback
        return { type: 'text', text: JSON.stringify(block) };
    }

    /**
     * Convert OpenAI content to OpenAI format
     */
    private contentFromOpenAI(rosetta: BaseOpenAIContent): OpenAINativeContent | null {
        if (rosetta.type === 'text') {
            return { type: 'text', text: rosetta.text };
        }

        if (rosetta.type === 'image') {
            if (rosetta.source?.type === 'url') {
                return {
                    type: 'image_url',
                    image_url: { url: rosetta.source.data || '' }
                };
            }
            if (rosetta.source?.type === 'base64') {
                return {
                    type: 'image_url',
                    image_url: { url: `data:${rosetta.source.mediaType};base64,${rosetta.source.data}` }
                };
            }
        }

        // Unsupported types (audio, video, etc.) - skip
        return null;
    }
}
